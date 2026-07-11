import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const root = process.cwd();
const envPath = path.join(root, '.env');
const migrationsDir = path.join(root, 'supabase', 'migrations');

function parseEnv(raw) {
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
    const index = line.indexOf('=');
    env[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return env;
}

function readEnv() {
  if (!fs.existsSync(envPath)) {
    throw new Error('No existe .env. Copia .env.example a .env y configura SUPABASE_DB_URL.');
  }
  return parseEnv(fs.readFileSync(envPath, 'utf8'));
}

async function main() {
  const env = readEnv();
  const dbUrl = process.env.SUPABASE_DB_URL || env.SUPABASE_DB_URL;

  if (!dbUrl) {
    throw new Error(
      'SUPABASE_DB_URL no esta configurada. Agregala temporalmente en .env para aplicar migraciones.',
    );
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      console.log(`Aplicando migracion: ${file}`);
      await client.query(sql);
    }
  } finally {
    await client.end();
  }

  console.log('Migraciones aplicadas correctamente.');
}

main().catch((error) => {
  console.error('No se pudieron aplicar las migraciones.');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
