import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import pg from 'pg';

const PROJECT_REF = 'cczbbqxunygcowqfrqdm';
const PAGE_SIZE = 2000;
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

function csvValue(value) {
  if (value === null || value === undefined) return '\\N';
  const rendered = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return '"' + rendered.replace(/"/g, '""') + '"';
}

async function writeChunk(stream, hash, content) {
  hash.update(content);
  if (!stream.write(content)) await once(stream, 'drain');
}

async function main() {
  const root = process.cwd();
  const envPath = path.join(root, '.env');
  const fileEnv = fs.existsSync(envPath) ? parseEnv(fs.readFileSync(envPath, 'utf8')) : {};
  const dbUrl = process.env.SUPABASE_DB_URL || fileEnv.SUPABASE_DB_URL;
  const projectRef = process.env.SUPABASE_PROJECT_REF || fileEnv.SUPABASE_PROJECT_REF;

  if (!dbUrl) throw new Error('Falta SUPABASE_DB_URL. Configúrala localmente en .env; no pegues la conexión en GitHub o en el chat.');
  if (projectRef !== PROJECT_REF) {
    throw new Error(`Verificación de seguridad: define SUPABASE_PROJECT_REF=${PROJECT_REF} localmente y confirma que SUPABASE_DB_URL apunta a ese proyecto.`);
  }

  const parsedUrl = new URL(dbUrl);
  const dbHostMatch = parsedUrl.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
  const poolerHost = parsedUrl.hostname.endsWith('.pooler.supabase.com');
  const poolerUserMatch = parsedUrl.username.match(/^postgres\.([a-z0-9]+)$/i);
  if (dbHostMatch) {
    if (dbHostMatch[1] !== PROJECT_REF) {
      throw new Error('La conexión apunta a otro proyecto Supabase; no se exportó ningún dato.');
    }
  } else if (poolerHost && poolerUserMatch) {
    if (poolerUserMatch[1] !== PROJECT_REF) {
      throw new Error('El usuario de conexión del pooler apunta a otro proyecto Supabase; no se exportó ningún dato.');
    }
  } else {
    throw new Error('No se pudo verificar el proyecto desde el host de conexión. Usa el host directo db.<project-ref>.supabase.co o el pooler con usuario postgres.<project-ref>.');
  }

  const outputDir = path.resolve(
    process.env.QUICKBITE_BACKUP_DIR || fileEnv.QUICKBITE_BACKUP_DIR ||
    path.resolve(root, '..', 'quickbite-private-backups'),
  );
  const relative = path.relative(root, outputDir);
  const insideRepository = relative === '' ||
    (!path.isAbsolute(relative) && relative !== '..' &&
      !relative.startsWith(`..${path.sep}`));
  if (insideRepository) {
    throw new Error('El respaldo debe guardarse fuera de la carpeta del repositorio para evitar subir datos privados a Git.');
  }
  fs.mkdirSync(outputDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const basename = `admin-notifications-${PROJECT_REF}-${stamp}`;
  const finalPath = path.join(outputDir, `${basename}.csv`);
  const tempPath = `${finalPath}.partial`;
  const manifestPath = path.join(outputDir, `${basename}.manifest.json`);

  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
    query_timeout: 60000,
  });

  let inTransaction = false;
  let stream;
  try {
    await client.connect();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    inTransaction = true;

    const countResult = await client.query(`
      SELECT
        (SELECT count(*)::bigint FROM public.admin_notifications) AS total,
        (SELECT count(*)::bigint
           FROM public.admin_notifications n
          WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = n.admin_user_id)) AS orphaned,
        (SELECT count(*)::bigint
           FROM public.admin_notifications n
          WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = n.admin_user_id)) AS linked
    `);
    const counts = countResult.rows[0];
    const expected = Number(counts.total);
    if (!Number.isSafeInteger(expected) || expected < 1) {
      throw new Error('Recuento inicial vacío o no válido; se cancela el respaldo.');
    }
    if (Number(counts.orphaned) + Number(counts.linked) !== expected) {
      throw new Error('Los recuentos Auth no coinciden con el total; se cancela el respaldo.');
    }

    stream = fs.createWriteStream(tempPath, { flags: 'wx' });
    stream.on('error', () => undefined);
    const hash = createHash('sha256');
    await writeChunk(stream, hash, COLUMNS.map(csvValue).join(',') + '\r\n');

    let lastId = null;
    let exported = 0;
    while (true) {
      const sql = lastId
        ? `SELECT ${COLUMNS.join(', ')} FROM public.admin_notifications WHERE id > $1::uuid ORDER BY id ASC LIMIT $2`
        : `SELECT ${COLUMNS.join(', ')} FROM public.admin_notifications ORDER BY id ASC LIMIT $1`;
      const result = lastId
        ? await client.query(sql, [lastId, PAGE_SIZE])
        : await client.query(sql, [PAGE_SIZE]);
      if (result.rows.length === 0) break;

      for (const row of result.rows) {
        await writeChunk(stream, hash, COLUMNS.map((column) => csvValue(row[column])).join(',') + '\r\n');
      }
      exported += result.rows.length;
      lastId = result.rows[result.rows.length - 1].id;
      console.log(`Exportadas ${exported.toLocaleString('es-CO')} de ${expected.toLocaleString('es-CO')} notificaciones…`);
    }

    if (exported !== expected) {
      throw new Error(`La verificación falló: se exportaron ${exported} filas y se esperaban ${expected}. El archivo parcial no se considera respaldo.`);
    }

    const finished = once(stream, 'finish');
    stream.end();
    await finished;
    stream = null;

    const digest = hash.digest('hex');
    const stat = fs.statSync(tempPath);
    if (stat.size <= 0) throw new Error('El archivo de respaldo está vacío.');
    fs.renameSync(tempPath, finalPath);

    const manifest = {
      project_ref: PROJECT_REF,
      table: 'public.admin_notifications',
      created_at: new Date().toISOString(),
      exported_rows: exported,
      expected_rows: expected,
      notifications_without_auth_account: Number(counts.orphaned),
      notifications_with_auth_account: Number(counts.linked),
      csv_bytes: stat.size,
      csv_sha256: digest,
      null_encoding: '\\N',
      columns: COLUMNS,
      note: 'Exportación read-only en una transacción repeatable-read; no se modificó la base.',
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
    await client.query('COMMIT');
    inTransaction = false;

    console.log('\nRESPALDO VERIFICADO');
    console.log(`CSV: ${finalPath}`);
    console.log(`Manifest: ${manifestPath}`);
    console.log(`Filas: ${exported}`);
    console.log(`Tamaño: ${stat.size.toLocaleString('es-CO')} bytes`);
    console.log(`SHA-256: ${digest}`);
    console.log('La base de datos no fue modificada. Guarda una segunda copia privada antes de la limpieza.');
  } catch (error) {
    if (stream) {
      stream.destroy();
      try { fs.unlinkSync(tempPath); } catch { /* incomplete file may not exist */ }
    }
    if (inTransaction) {
      try { await client.query('ROLLBACK'); } catch { /* connection may already be closed */ }
    }
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error('No se pudo verificar el respaldo externo.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
