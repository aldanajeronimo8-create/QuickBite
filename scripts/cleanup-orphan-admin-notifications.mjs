import fs from 'node:fs';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { URL } from 'node:url';
import pg from 'pg';

const PROJECT_REF = 'cczbbqxunygcowqfrqdm';
const PAGE_SIZE = 5000;
const COLUMNS = [
  'id', 'admin_user_id', 'section', 'title', 'body',
  'entity_type', 'entity_id', 'metadata', 'created_at', 'read_at',
];

function parseEnv(raw) {
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const index = trimmed.indexOf('=');
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    env[trimmed.slice(0, index).trim()] = value;
  }
  return env;
}

function pathIsOutsideRepo(repoRoot, candidate) {
  const relative = path.relative(repoRoot, candidate);
  return relative !== '' &&
    (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative));
}

async function sha256File(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

function validateProjectConnection(dbUrl, projectRef) {
  if (projectRef !== PROJECT_REF) {
    throw new Error('SUPABASE_PROJECT_REF no coincide con el proyecto de QuickBite; no se hizo ninguna modificación.');
  }
  const parsedUrl = new URL(dbUrl);
  const directHost = parsedUrl.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
  const poolerHost = parsedUrl.hostname.endsWith('.pooler.supabase.com');
  const poolerUser = parsedUrl.username.match(/^postgres\.([a-z0-9]+)$/i);
  if (directHost) {
    if (directHost[1] !== PROJECT_REF) throw new Error('La conexión apunta a otro proyecto Supabase.');
  } else if (poolerHost && poolerUser) {
    if (poolerUser[1] !== PROJECT_REF) throw new Error('El usuario del pooler apunta a otro proyecto Supabase.');
  } else {
    throw new Error('No se pudo verificar el proyecto desde el host. Usa db.<project-ref>.supabase.co o pooler con usuario postgres.<project-ref>.');
  }
}

async function getCounts(client) {
  const result = await client.query([
    'SELECT count(*)::bigint AS total,',
    ' count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = n.admin_user_id))::bigint AS orphaned,',
    ' count(*) FILTER (WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = n.admin_user_id))::bigint AS linked',
    'FROM public.admin_notifications n',
  ].join('\n'));
  return {
    total: Number(result.rows[0].total),
    orphaned: Number(result.rows[0].orphaned),
    linked: Number(result.rows[0].linked),
  };
}

async function hashOrphanIds(client) {
  const hash = createHash('sha256');
  let cursor = null;
  let count = 0;
  while (true) {
    const firstPageSql = [
      'SELECT n.id FROM public.admin_notifications n',
      'WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = n.admin_user_id)',
      'ORDER BY n.id ASC LIMIT $1',
    ].join('\n');
    const nextPageSql = [
      'SELECT n.id FROM public.admin_notifications n',
      'WHERE n.id > $1::uuid',
      'AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = n.admin_user_id)',
      'ORDER BY n.id ASC LIMIT $2',
    ].join('\n');
    const result = cursor
      ? await client.query(nextPageSql, [cursor, PAGE_SIZE])
      : await client.query(firstPageSql, [PAGE_SIZE]);
    if (result.rows.length === 0) break;
    for (const row of result.rows) {
      hash.update(String(row.id) + '\n');
      count += 1;
    }
    cursor = result.rows[result.rows.length - 1].id;
  }
  return { count, sha256: hash.digest('hex') };
}

function requireBackupManifest(manifest, stat, fileDigest) {
  if (manifest.project_ref !== PROJECT_REF) throw new Error('El manifiesto es de otro proyecto.');
  if (manifest.table !== 'public.admin_notifications') throw new Error('El manifiesto no corresponde a public.admin_notifications.');
  if (!Number.isSafeInteger(manifest.expected_rows) || manifest.expected_rows < 1 ||
      manifest.exported_rows !== manifest.expected_rows) {
    throw new Error('El manifiesto no acredita una exportación completa.');
  }
  if (!Number.isSafeInteger(manifest.notifications_without_auth_account) ||
      manifest.notifications_without_auth_account < 0 ||
      !Number.isSafeInteger(manifest.notifications_with_auth_account) ||
      manifest.notifications_without_auth_account + manifest.notifications_with_auth_account !== manifest.expected_rows) {
    throw new Error('Los recuentos del manifiesto no son coherentes.');
  }
  if (manifest.csv_bytes !== stat.size || manifest.csv_sha256 !== fileDigest) {
    throw new Error('El CSV no coincide con el tamaño o SHA-256 del manifiesto.');
  }
  if (!/^[a-f0-9]{64}$/i.test(manifest.orphan_ids_sha256 ?? '')) {
    throw new Error('Este respaldo no contiene el hash de IDs huérfanos. Genera uno con la versión actual del exportador.');
  }
}

async function main() {
  const args = process.argv.slice(2);
  const manifestArg = args.indexOf('--manifest');
  const csvArg = args.indexOf('--csv');
  const apply = args.includes('--apply');
  if (manifestArg < 0 || !args[manifestArg + 1] || csvArg < 0 || !args[csvArg + 1]) {
    throw new Error('Uso: pnpm cleanup:orphan-admin-notifications -- --manifest <archivo.manifest.json> --csv <respaldo.csv> [--apply]. Sin --apply solo simula.');
  }

  const root = process.cwd();
  const manifestPath = path.resolve(args[manifestArg + 1]);
  const csvPath = path.resolve(args[csvArg + 1]);
  if (!pathIsOutsideRepo(root, manifestPath) || !pathIsOutsideRepo(root, csvPath)) {
    throw new Error('Por seguridad, el CSV y el manifiesto deben estar fuera de la carpeta del repositorio.');
  }
  if (!fs.existsSync(manifestPath) || !fs.existsSync(csvPath)) {
    throw new Error('No se encontró el CSV o el manifiesto. No se hizo ninguna modificación.');
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const stat = fs.statSync(csvPath);
  const digest = await sha256File(csvPath);
  requireBackupManifest(manifest, stat, digest);

  const envPath = path.join(root, '.env');
  const fileEnv = fs.existsSync(envPath) ? parseEnv(fs.readFileSync(envPath, 'utf8')) : {};
  const dbUrl = process.env.SUPABASE_DB_URL || fileEnv.SUPABASE_DB_URL;
  const projectRef = process.env.SUPABASE_PROJECT_REF || fileEnv.SUPABASE_PROJECT_REF;
  if (!dbUrl) throw new Error('Falta SUPABASE_DB_URL en el .env local. No pegues la conexión en GitHub o en el chat.');
  validateProjectConnection(dbUrl, projectRef);

  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
    query_timeout: 120000,
  });
  let transactionOpen = false;
  try {
    await client.connect();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    transactionOpen = true;
    const preflightCounts = await getCounts(client);
    const preflightHash = await hashOrphanIds(client);
    const inboundFk = await client.query(
      "SELECT count(*)::int AS count FROM pg_constraint WHERE contype = 'f' AND confrelid = 'public.admin_notifications'::regclass"
    );
    await client.query('COMMIT');
    transactionOpen = false;

    if (preflightCounts.orphaned !== manifest.notifications_without_auth_account ||
        preflightHash.count !== manifest.notifications_without_auth_account ||
        preflightHash.sha256 !== manifest.orphan_ids_sha256) {
      throw new Error('Los IDs o el recuento de notificaciones huérfanas cambiaron desde el respaldo. Genera un respaldo nuevo antes de limpiar.');
    }
    if (preflightCounts.total !== preflightCounts.linked + preflightCounts.orphaned) {
      throw new Error('El recuento actual no cuadra; se cancela la limpieza.');
    }
    if (Number(inboundFk.rows[0].count) !== 0) {
      throw new Error('La tabla tiene claves foráneas entrantes. Se aborta para evitar una limpieza destructiva.');
    }

    const sizeResult = await client.query([
      "SELECT pg_size_pretty(pg_total_relation_size('public.admin_notifications')) AS table_size,",
      "pg_size_pretty(pg_database_size(current_database())) AS database_size",
    ].join('\n'));
    console.log('Verificación previa del respaldo: PASS');
    console.log('Proyecto:', PROJECT_REF);
    console.log('CSV SHA-256:', digest);
    console.log('Filas actuales:', preflightCounts.total);
    console.log('Notificaciones que se retirarían:', preflightCounts.orphaned);
    console.log('Notificaciones de cuentas Auth que se conservarían:', preflightCounts.linked);
    console.log('Tamaño actual tabla / base:', sizeResult.rows[0].table_size, '/', sizeResult.rows[0].database_size);

    if (!apply) {
      console.log('\nDRY RUN: no se modificó ningún dato. Tras comprobar dos copias privadas verificadas, vuelve a ejecutar con --apply.');
      return;
    }

    const rl = createInterface({ input, output });
    try {
      const copyAnswer = await rl.question('¿Tienes el CSV y una segunda copia privada en otro destino? Escribe TENGO_DOS_COPIAS: ');
      if (copyAnswer.trim() !== 'TENGO_DOS_COPIAS') {
        console.log('Cancelado: no se confirmó la segunda copia; no se modificó ningún dato.');
        return;
      }
      const phrase = 'LIMPIAR ' + preflightCounts.orphaned;
      const deleteAnswer = await rl.question('Para retirar exactamente ' + preflightCounts.orphaned + ' notificaciones huérfanas, escribe ' + phrase + ': ');
      if (deleteAnswer.trim() !== phrase) {
        console.log('Cancelado: confirmación no coincidente; no se modificó ningún dato.');
        return;
      }
    } finally {
      rl.close();
    }

    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    transactionOpen = true;
    await client.query("SET LOCAL statement_timeout = '5min'");
    await client.query('LOCK TABLE public.admin_notifications IN ACCESS EXCLUSIVE MODE');

    const lockedCounts = await getCounts(client);
    const lockedHash = await hashOrphanIds(client);
    if (lockedCounts.orphaned !== manifest.notifications_without_auth_account ||
        lockedHash.count !== manifest.notifications_without_auth_account ||
        lockedHash.sha256 !== manifest.orphan_ids_sha256) {
      throw new Error('El conjunto de IDs huérfanos cambió antes de adquirir el bloqueo. Se aborta la transacción.');
    }
    if (lockedCounts.total !== lockedCounts.linked + lockedCounts.orphaned) {
      throw new Error('Los recuentos bajo bloqueo no cuadran. Se aborta la transacción.');
    }

    await client.query([
      'CREATE TEMP TABLE admin_notifications_keep ON COMMIT DROP AS',
      'SELECT n.id, n.admin_user_id, n.section, n.title, n.body,',
      '       n.entity_type, n.entity_id, n.metadata, n.created_at, n.read_at',
      'FROM public.admin_notifications n',
      'WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = n.admin_user_id)',
    ].join('\n'));
    const keepResult = await client.query('SELECT count(*)::bigint AS count FROM pg_temp.admin_notifications_keep');
    const keepCount = Number(keepResult.rows[0].count);
    if (keepCount !== lockedCounts.linked || keepCount + lockedCounts.orphaned !== lockedCounts.total) {
      throw new Error('El conteo de conservación no coincide. Se aborta la transacción.');
    }

    await client.query('TRUNCATE TABLE public.admin_notifications');
    await client.query([
      'INSERT INTO public.admin_notifications(' + COLUMNS.join(', ') + ')',
      'SELECT ' + COLUMNS.join(', ') + ' FROM pg_temp.admin_notifications_keep',
    ].join('\n'));

    const verify = await getCounts(client);
    if (verify.total !== keepCount || verify.linked !== keepCount || verify.orphaned !== 0) {
      throw new Error('La verificación previa al COMMIT falló. La transacción se revertirá.');
    }
    await client.query('COMMIT');
    transactionOpen = false;

    const finalCounts = await getCounts(client);
    const finalSize = await client.query([
      "SELECT pg_size_pretty(pg_total_relation_size('public.admin_notifications')) AS table_size,",
      "pg_size_pretty(pg_database_size(current_database())) AS database_size",
    ].join('\n'));
    if (finalCounts.orphaned !== 0 || finalCounts.linked < keepCount) {
      throw new Error('La verificación posterior al COMMIT no coincide. Conserva el respaldo y revisa el proyecto inmediatamente.');
    }
    console.log('\nLIMPIEZA VERIFICADA');
    console.log('Notificaciones retiradas:', lockedCounts.orphaned);
    console.log('Notificaciones conservadas:', keepCount);
    console.log('Huérfanas restantes:', finalCounts.orphaned);
    console.log('Tamaño tabla / base después:', finalSize.rows[0].table_size, '/', finalSize.rows[0].database_size);
    console.log('No se modificaron perfiles, cuentas Auth ni historiales de auditoría.');
  } catch (error) {
    if (transactionOpen) {
      try { await client.query('ROLLBACK'); } catch { /* connection may have closed */ }
    }
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error('La comprobación/limpieza no se completó.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
