import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

export async function verifyBackup(backupInput, checksumInput) {
  const backupFile = resolve(backupInput);
  const checksumFile = resolve(checksumInput ?? `${backupFile}.sha256`);
  if (!existsSync(backupFile)) throw new Error(`No existe el backup: ${backupFile}`);
  if (!existsSync(checksumFile)) throw new Error(`No existe el checksum: ${checksumFile}`);

  const checksumContents = readFileSync(checksumFile, 'utf8').trim();
  const [expectedHash, recordedFile] = checksumContents.split(/\s+/, 2);
  if (!/^[a-f0-9]{64}$/i.test(expectedHash ?? '')) {
    throw new Error('El archivo SHA-256 no tiene un formato válido.');
  }
  if (recordedFile && basename(recordedFile.replace(/^\*/, '')) !== basename(backupFile)) {
    throw new Error('El checksum no corresponde al archivo de backup indicado.');
  }

  const hash = createHash('sha256');
  await new Promise((resolvePromise, reject) => {
    createReadStream(backupFile)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', resolvePromise);
  });
  if (hash.digest('hex').toLowerCase() !== expectedHash.toLowerCase()) {
    throw new Error('El checksum SHA-256 no coincide. No restaures este backup.');
  }

  const inspect = spawnSync('pg_restore', ['--list', backupFile], { stdio: 'ignore' });
  if (inspect.error) throw new Error('No se encontró pg_restore. Instala las herramientas de PostgreSQL antes de continuar.');
  if (inspect.status !== 0) throw new Error('pg_restore no pudo leer el archivo. El backup está dañado o no es válido.');

  return { backupFile, checksumFile, sha256: expectedHash.toLowerCase() };
}

async function main() {
  const args = process.argv.slice(2);
  const backupFile = option(args, '--file');
  if (!backupFile || args.includes('--help')) {
    console.log('Uso: node scripts/verify-backup.mjs --file <quickbite-...dump> [--checksum <archivo.sha256>]');
    process.exit(backupFile ? 0 : 1);
  }
  const verified = await verifyBackup(backupFile, option(args, '--checksum'));
  console.log(`Backup válido: ${verified.backupFile}`);
  console.log(`SHA-256 válido: ${verified.sha256}`);
}

if (import.meta.url === `file:///${process.argv[1].replaceAll('\\', '/')}`) {
  main().catch((error) => {
    console.error(`Verificación fallida: ${error instanceof Error ? error.message : 'error desconocido'}`);
    process.exit(1);
  });
}
