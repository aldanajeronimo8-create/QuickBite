import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const root = process.cwd();
const envPath = path.join(root, '.env');
const envExamplePath = path.join(root, '.env.example');
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

function stringifyEnv(templateRaw, values) {
  return templateRaw
    .split(/\r?\n/)
    .map((line) => {
      if (!line || line.trim().startsWith('#') || !line.includes('=')) return line;
      const key = line.slice(0, line.indexOf('=')).trim();
      if (!(key in values)) return line;
      return `${key}=${values[key] ?? ''}`;
    })
    .join('\n');
}

async function ask(question, currentValue = '') {
  const rl = readline.createInterface({ input, output });
  const suffix = currentValue ? ' [actual configurado]' : '';
  const answer = await rl.question(`${question}${suffix}: `);
  rl.close();
  return answer.trim() || currentValue;
}

async function main() {
  if (!fs.existsSync(envPath)) {
    fs.copyFileSync(envExamplePath, envPath);
  }

  const templateRaw = fs.readFileSync(envPath, 'utf8');
  const env = parseEnv(templateRaw);

  env.VITE_RUNTIME_MODE = 'supabase';
  env.VITE_SUPABASE_URL = await ask('VITE_SUPABASE_URL', env.VITE_SUPABASE_URL);
  env.VITE_SUPABASE_ANON_KEY = await ask('VITE_SUPABASE_ANON_KEY', env.VITE_SUPABASE_ANON_KEY);
  env.VITE_SUPABASE_REALTIME_ENABLED = 'true';
  env.SUPABASE_DB_URL = await ask(
    'SUPABASE_DB_URL opcional para aplicar migraciones',
    env.SUPABASE_DB_URL,
  );
  env.SUPABASE_SERVICE_ROLE_KEY = await ask(
    'SUPABASE_SERVICE_ROLE_KEY opcional para bootstrap server-side',
    env.SUPABASE_SERVICE_ROLE_KEY,
  );
  env.INSTALL_TOKEN = env.INSTALL_TOKEN || crypto.randomUUID();

  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
    throw new Error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY.');
  }

  fs.writeFileSync(envPath, stringifyEnv(templateRaw, env));
  console.log('\n.env actualizado.');

  const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
  const { error } = await supabase.auth.getSession();
  if (error) throw error;
  console.log('Cliente Supabase inicializa correctamente con URL y anon key.');

  if (env.SUPABASE_DB_URL) {
    const client = new pg.Client({
      connectionString: env.SUPABASE_DB_URL,
      ssl: { rejectUnauthorized: false },
    });
    await client.connect();
    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      console.log(`Aplicando migracion: ${file}`);
      await client.query(sql);
    }

    await client.end();
    console.log('Migraciones aplicadas correctamente.');
  } else {
    console.log('SUPABASE_DB_URL no fue configurada; no se aplicaron migraciones.');
  }

  console.log('\nListo. Ejecuta: npm.cmd run dev:local');
}

main().catch((error) => {
  console.error('\nNo se pudo conectar Supabase:');
  console.error(error);
  process.exit(1);
});
