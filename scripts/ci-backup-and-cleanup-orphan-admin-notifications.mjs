import fs from 'node:fs';
import path from 'node:path';
import { createReadStream, createWriteStream } from 'node:fs';
import { createHash, createCipheriv, createDecipheriv, randomBytes, hkdfSync } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip, createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { URL } from 'node:url';

const PROJECT_REF = 'cczbbqxunygcowqfrqdm';
const API_URL = 'https://' + PROJECT_REF + '.supabase.co';
const PAGE_SIZE = 1000;
const KDF_INFO = 'QuickBite admin notification offsite backup v1';
const COLUMNS = [
  'id', 'admin_user_id', 'section', 'title', 'body',
  'entity_type', 'entity_id', 'metadata', 'created_at', 'read_at',
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error('Missing required environment variable: ' + name);
  return value;
}

async function requestJson(url, options = {}) {
  const serviceKey = required('SUPABASE_SERVICE_ROLE_KEY');
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(90000),
        headers: {
          apikey: serviceKey,
          Authorization: 'Bearer ' + serviceKey,
          Accept: 'application/json',
          ...(options.headers ?? {}),
        },
      });
      if ((response.status === 429 || response.status >= 500) && attempt < 4) {
        await response.arrayBuffer().catch(() => undefined);
        await sleep((attempt + 1) * 1500);
        continue;
      }
      if (!response.ok) {
        const safeText = (await response.text()).slice(0, 400);
        throw new Error('Supabase API returned HTTP ' + response.status + ': ' + safeText);
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < 4 && (error?.name === 'TimeoutError' || error?.name === 'TypeError')) {
        await sleep((attempt + 1) * 1500);
        continue;
      }
      throw error;
    }
  }
  throw lastError ?? new Error('Supabase API request failed after retries.');
}

async function getAuthIds() {
  const ids = new Set();
  for (let page = 1; page <= 20; page += 1) {
    const url = new URL(API_URL + '/auth/v1/admin/users');
    url.searchParams.set('page', String(page));
    url.searchParams.set('per_page', '1000');
    const response = await requestJson(url.toString());
    const payload = await response.json();
    const users = Array.isArray(payload?.users)
      ? payload.users
      : Array.isArray(payload?.data?.users) ? payload.data.users : null;
    if (!users) throw new Error('Auth admin API returned an unexpected shape; cleanup refused.');
    for (const user of users) {
      if (typeof user.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(user.id)) {
        throw new Error('Auth user ID validation failed; cleanup refused.');
      }
      ids.add(user.id.toLowerCase());
    }
    if (users.length < 1000) break;
    if (page === 20) throw new Error('Auth account pagination limit reached; cleanup refused.');
  }
  if (ids.size === 0) throw new Error('Auth user listing was empty; cleanup refused.');
  return ids;
}

function orphanFilter(authIds) {
  if (authIds.size > 100) {
    throw new Error('Auth account list exceeds safe URL filter size; cleanup refused.');
  }
  return 'not.in.(' + [...authIds].sort().join(',') + ')';
}

function buildOrphanQuery(authIds, cursor = null, select = COLUMNS.join(','), limit = PAGE_SIZE) {
  const url = new URL(API_URL + '/rest/v1/admin_notifications');
  url.searchParams.set('select', select);
  url.searchParams.set('admin_user_id', orphanFilter(authIds));
  url.searchParams.set('order', 'id.asc');
  url.searchParams.set('limit', String(limit));
  if (cursor) url.searchParams.set('id', 'gt.' + cursor);
  return url.toString();
}

async function getOrphanCount(authIds) {
  const url = buildOrphanQuery(authIds, null, 'id', 1);
  const response = await requestJson(url, {
    headers: { Prefer: 'count=exact', Range: '0-0' },
  });
  const contentRange = response.headers.get('content-range') ?? '';
  const match = contentRange.match(/\/(\d+)$/);
  if (!match) throw new Error('Could not verify exact orphan notification count from Content-Range.');
  return Number(match[1]);
}

async function sha256File(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

async function* encryptedBackupSource(authIds, state) {
  let cursor = null;
  while (true) {
    const response = await requestJson(buildOrphanQuery(authIds, cursor));
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error('Notification export returned an unexpected shape.');
    if (rows.length === 0) break;

    for (const row of rows) {
      if (!row.id || !row.admin_user_id || authIds.has(String(row.admin_user_id).toLowerCase())) {
        throw new Error('The orphan filter returned an invalid recipient; backup and cleanup aborted.');
      }
      if (typeof row.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(row.id)) {
        throw new Error('Notification ID validation failed; backup and cleanup aborted.');
      }
      state.idHash.update(row.id.toLowerCase() + '\n');
      state.count += 1;
      state.recipientIds.add(String(row.admin_user_id).toLowerCase());
      yield Buffer.from(JSON.stringify(row) + '\n', 'utf8');
    }

    cursor = rows[rows.length - 1].id;
    if (rows.length < PAGE_SIZE) break;
    if (state.count % 50000 < PAGE_SIZE) {
      console.log('Encrypted backup progress: ' + state.count.toLocaleString('en-US') + ' orphan notification rows.');
    }
  }
}

async function verifyEncryptedBackup(filePath, key, iv, tag, authIds, expectedCount, expectedHash) {
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decryptedGzip = createReadStream(filePath).pipe(decipher).pipe(createGunzip());
  const lines = createInterface({ input: decryptedGzip, crlfDelay: Infinity });
  const hash = createHash('sha256');
  let count = 0;
  for await (const line of lines) {
    if (!line) continue;
    const row = JSON.parse(line);
    if (!row.id || !row.admin_user_id || authIds.has(String(row.admin_user_id).toLowerCase())) {
      throw new Error('Encrypted backup self-test found a non-orphan row; cleanup refused.');
    }
    hash.update(String(row.id).toLowerCase() + '\n');
    count += 1;
  }
  const actualHash = hash.digest('hex');
  if (count !== expectedCount || actualHash !== expectedHash) {
    throw new Error('Encrypted backup self-test count/hash mismatch; cleanup refused.');
  }
}

async function backup() {
  const serviceKey = required('SUPABASE_SERVICE_ROLE_KEY');
  const authIds = await getAuthIds();
  console.log('Verified Auth account list: ' + authIds.size + ' accounts.');
  const initialCount = await getOrphanCount(authIds);
  if (initialCount <= 0) throw new Error('There are no orphan notifications to clean; no data changed.');

  const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
  const outputDir = path.join(workspace, 'maintenance-backup');
  fs.mkdirSync(outputDir, { recursive: true });
  const backupPath = path.join(outputDir, 'orphan-admin-notifications.jsonl.gz.enc');
  const manifestPath = path.join(outputDir, 'manifest.json');

  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = Buffer.from(hkdfSync('sha256', Buffer.from(serviceKey, 'utf8'), salt, Buffer.from(KDF_INFO, 'utf8'), 32));
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const gzip = createGzip({ level: 9 });
  const output = createWriteStream(backupPath, { flags: 'wx', mode: 0o600 });
  const state = { count: 0, idHash: createHash('sha256'), recipientIds: new Set() };

  try {
    await pipeline(Readable.from(encryptedBackupSource(authIds, state)), gzip, cipher, output);
  } catch (error) {
    try { fs.unlinkSync(backupPath); } catch { /* partial file may not exist */ }
    throw error;
  }

  const expectedHash = state.idHash.digest('hex');
  const afterCount = await getOrphanCount(authIds);
  if (state.count !== initialCount || afterCount !== initialCount) {
    throw new Error('Orphan count changed during backup (initial=' + initialCount +
      ', exported=' + state.count + ', after=' + afterCount + '); cleanup refused.');
  }

  const tag = cipher.getAuthTag();
  await verifyEncryptedBackup(backupPath, key, iv, tag, authIds, state.count, expectedHash);
  console.log('Encrypted backup decryption self-test: PASS.');
  const encryptedSha256 = await sha256File(backupPath);
  const stat = fs.statSync(backupPath);
  if (stat.size < 32) throw new Error('Encrypted backup file is unexpectedly small.');

  const manifest = {
    format: 'quickbite-orphan-admin-notifications-backup-v1',
    project_ref: PROJECT_REF,
    table: 'public.admin_notifications',
    created_at: new Date().toISOString(),
    encrypted_file: path.basename(backupPath),
    encrypted_bytes: stat.size,
    encrypted_sha256: encryptedSha256,
    row_format: 'UTF-8 JSON Lines -> gzip -> AES-256-GCM',
    encryption: {
      algorithm: 'AES-256-GCM',
      kdf: 'HKDF-SHA-256',
      key_source: 'SUPABASE_SERVICE_ROLE_KEY (never exported)',
      salt_base64: salt.toString('base64'),
      iv_base64: iv.toString('base64'),
      auth_tag_base64: tag.toString('base64'),
      info: KDF_INFO,
    },
    orphan_notifications_count: state.count,
    orphan_recipient_count: state.recipientIds.size,
    orphan_ids_sha256: expectedHash,
    auth_accounts_seen: authIds.size,
    cleanup_function: 'public.admin_cleanup_orphan_admin_notifications(bigint,text)',
    note: 'Encrypted records are only notifications whose recipient has no matching auth.users identity. No accounts or audit rows are included.',
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });

  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    fs.appendFileSync(outputFile, 'orphan_count=' + state.count + '\n');
    fs.appendFileSync(outputFile, 'orphan_sha256=' + expectedHash + '\n');
    fs.appendFileSync(outputFile, 'recipients_count=' + state.recipientIds.size + '\n');
  }
  console.log('Encrypted external backup created and verified.');
  console.log('Orphan notifications: ' + state.count);
  console.log('Orphan recipient identities: ' + state.recipientIds.size);
  console.log('Encrypted backup bytes: ' + stat.size);
  console.log('Encrypted SHA-256: ' + encryptedSha256);
  console.log('Orphan ID SHA-256: ' + expectedHash);
}

async function cleanup() {
  const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
  const manifestPath = path.join(workspace, 'maintenance-backup', 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error('Encrypted backup manifest missing; cleanup refused.');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.project_ref !== PROJECT_REF ||
      manifest.table !== 'public.admin_notifications' ||
      manifest.format !== 'quickbite-orphan-admin-notifications-backup-v1' ||
      !Number.isSafeInteger(manifest.orphan_notifications_count) ||
      manifest.orphan_notifications_count <= 0 ||
      !/^[a-f0-9]{64}$/.test(manifest.orphan_ids_sha256 ?? '')) {
    throw new Error('Backup manifest validation failed; cleanup refused.');
  }

  const backupPath = path.join(workspace, 'maintenance-backup', manifest.encrypted_file);
  if (!fs.existsSync(backupPath) ||
      fs.statSync(backupPath).size !== manifest.encrypted_bytes ||
      await sha256File(backupPath) !== manifest.encrypted_sha256) {
    throw new Error('Encrypted backup integrity check failed; cleanup refused.');
  }

  const response = await requestJson(API_URL + '/rest/v1/rpc/admin_cleanup_orphan_admin_notifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_expected_count: manifest.orphan_notifications_count,
      p_expected_sha256: manifest.orphan_ids_sha256,
    }),
  });
  const result = await response.json();
  const cleanupResult = Array.isArray(result) ? result[0] : result;
  if (!cleanupResult || cleanupResult.status !== 'verified' ||
      Number(cleanupResult.notifications_removed) !== manifest.orphan_notifications_count ||
      Number(cleanupResult.notifications_remaining_without_auth) !== 0) {
    throw new Error('Database cleanup response did not meet expected postconditions.');
  }

  const authIds = await getAuthIds();
  const remaining = await getOrphanCount(authIds);
  if (remaining !== 0) throw new Error('Post-cleanup verification found ' + remaining + ' orphan notifications.');
  console.log('ORPHAN NOTIFICATION CLEANUP VERIFIED');
  console.log('Notifications removed: ' + cleanupResult.notifications_removed);
  console.log('Valid Auth notifications preserved: ' + cleanupResult.notifications_preserved);
  console.log('Notifications without Auth remaining: ' + remaining);
  console.log('Encrypted backup SHA-256: ' + manifest.encrypted_sha256);
  console.log('No Auth users, profiles, orders, or audit logs were deleted.');
}

const mode = process.argv[2];
if (mode === 'backup') {
  backup().catch((error) => {
    console.error('Encrypted notification backup failed; cleanup was not attempted.');
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
} else if (mode === 'cleanup') {
  cleanup().catch((error) => {
    console.error('Orphan notification cleanup failed; inspect the transaction result before retrying.');
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
} else {
  console.error('Usage: node scripts/ci-backup-and-cleanup-orphan-admin-notifications.mjs <backup|cleanup>');
  process.exitCode = 2;
}
