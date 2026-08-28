import { basename, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { URL } from 'node:url';
import { verifyBackup } from './verify-backup.mjs';

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const backupInput = option(args, '--file');
  const databaseUrl = option(args, '--database');
  const isConfirmed = args.includes('--confirm-restore');
  const allowProduction = args.includes('--allow-production');

  if (!backupInput || !databaseUrl || args.includes('--help')) {
    console.log('Uso: node scripts/restore-backup.mjs --file <backup.dump> --database <postgres-url> --confirm-restore [--allow-production]');
    console.log('Este comando modifica la base de datos indicada. Primero prueba la restauración en un proyecto de recuperación.');
    process.exit(backupInput && databaseUrl ? 0 : 1);
  }
  if (!isConfirmed) throw new Error('Falta --confirm-restore. No se ejecutó ninguna restauración.');

  const backupFile = resolve(backupInput);
  const target = new URL(databaseUrl);
  const isSupabaseProductionHost = /supabase\.co$/i.test(target.hostname);
  if (isSupabaseProductionHost && !allowProduction) {
    throw new Error('La restauración hacia Supabase exige --allow-production. Prueba primero en una base de recuperación.');
  }

  const requiredPhrase = `RESTORE ${basename(backupFile)}`;
  if (process.env.QUICKBITE_RESTORE_CONFIRM !== requiredPhrase) {
    throw new Error(`Confirma la operación estableciendo QUICKBITE_RESTORE_CONFIRM exactamente a: ${requiredPhrase}`);
  }

  await verifyBackup(backupFile, option(args, '--checksum'));
  const restore = spawnSync('pg_restore', [
    '--clean',
    '--if-exists',
    '--no-owner',
    '--no-privileges',
    '--exit-on-error',
    `--dbname=${databaseUrl}`,
    backupFile,
  ], { stdio: 'inherit' });
  if (restore.error) throw new Error('No se encontró pg_restore. Instala las herramientas de PostgreSQL antes de continuar.');
  if (restore.status !== 0) throw new Error('pg_restore informó un error. Revisa la salida y no des por completada la recuperación.');
  console.log('Restauración finalizada. Ejecuta el checklist de BACKUP_RECOVERY_RUNBOOK.md antes de reabrir QuickBite.');
}

main().catch((error) => {
  console.error(`Restauración detenida: ${error instanceof Error ? error.message : 'error desconocido'}`);
  process.exit(1);
});
