import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { readdir, readFile, writeFile, rename, mkdir, unlink } from 'node:fs/promises';

export const MAX_PER_PATH = 20;

export function pathHash(path) {
  return createHash('sha1').update(path).digest('hex').slice(0, 16);
}

export function dirFor(root, path) {
  return join(root, pathHash(path));
}

export function validatePath(path) {
  if (typeof path !== 'string' || path.length === 0) {
    throw new Error('path must be a non-empty string');
  }
  if (path.includes('\u0000')) {
    throw new Error('path contains null byte');
  }
  if (path.includes('\\')) {
    throw new Error('path contains backslash');
  }
  if (path.startsWith('/')) {
    throw new Error('path must be relative');
  }
  // split on / and check no segment is ".."
  for (const seg of path.split('/')) {
    if (seg === '..') {
      throw new Error('path contains parent traversal');
    }
  }
}

export async function nextSequence(dir) {
  let entries;
  try {
    entries = await readdir(dir);
  } catch (e) {
    if (e.code === 'ENOENT') return 1;
    throw e;
  }
  let max = 0;
  for (const name of entries) {
    // Strict match: 10-digit zero-padded sequence followed by `_`, ending in `.json`.
    // Anything else (path file, .tmp leftovers, malformed names) is ignored.
    const match = /^(\d{10})_.*\.json$/.exec(name);
    if (!match) continue;
    const seq = parseInt(match[1], 10);
    if (seq > max) max = seq;
  }
  return max + 1;
}

function pad10(n) {
  return String(n).padStart(10, '0');
}

function isoFsSafe(d) {
  return d.toISOString().replace(/[:.]/g, '-');
}

function sha1Hex(text) {
  return createHash('sha1').update(text).digest('hex');
}

export async function writeBackup({ root, path, content, username }) {
  validatePath(path);
  if (typeof content !== 'string') throw new Error('content must be a string');
  if (typeof username !== 'string' || username.length === 0) {
    throw new Error('username must be a non-empty string');
  }

  const dir = dirFor(root, path);
  await mkdir(dir, { recursive: true });
  await cleanupTmp(dir);

  // Write the human-readable `path` debug file only the first time we touch
  // this directory. Subsequent saves don't need to rewrite it (same content)
  // and avoiding the syscall keeps the dir's first-created-ish timestamp.
  try {
    await writeFile(join(dir, 'path'), path, { flag: 'wx' });
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }

  const incomingSha = sha1Hex(content);
  const newest = await newestRecord(dir);
  if (newest && newest.sha === incomingSha) {
    return { id: newest.id, ts: newest.ts };
  }

  const seq = await nextSequence(dir);
  const ts = Date.now();
  const id = `${pad10(seq)}_${isoFsSafe(new Date(ts))}`;
  const record = {
    id,
    path,
    ts,
    username,
    size: Buffer.byteLength(content, 'utf8'),
    sha: incomingSha,
    content,
  };

  const finalPath = join(dir, `${id}.json`);
  const tmpPath = `${finalPath}.tmp`;
  await writeFile(tmpPath, JSON.stringify(record));
  await rename(tmpPath, finalPath);
  await enforceRetention(dir);

  return { id, ts };
}

async function cleanupTmp(dir) {
  let entries;
  try { entries = await readdir(dir); } catch (e) {
    if (e.code === 'ENOENT') return;
    throw e;
  }
  for (const name of entries) {
    if (name.endsWith('.tmp')) {
      try { await unlink(join(dir, name)); } catch { /* best effort */ }
    }
  }
}

async function enforceRetention(dir) {
  let entries;
  try {
    entries = await readdir(dir);
  } catch (e) {
    if (e.code === 'ENOENT') return;
    throw e;
  }
  const jsons = entries.filter(f => f.endsWith('.json')).sort();   // ascending by sequence
  if (jsons.length <= MAX_PER_PATH) return;
  const toDelete = jsons.slice(0, jsons.length - MAX_PER_PATH);
  for (const name of toDelete) {
    await unlink(join(dir, name));
  }
}

export async function listBackups({ root, path }) {
  validatePath(path);
  const dir = dirFor(root, path);
  let entries;
  try {
    entries = await readdir(dir);
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  const jsons = entries.filter(f => f.endsWith('.json')).sort().reverse();   // newest first
  const out = [];
  for (const name of jsons.slice(0, MAX_PER_PATH)) {
    try {
      const rec = JSON.parse(await readFile(join(dir, name), 'utf8'));
      if (!rec || !rec.id || typeof rec.ts !== 'number' || !rec.sha) {
        continue;   // structurally incomplete — drop silently rather than serving undefineds
      }
      out.push({
        id: rec.id,
        ts: rec.ts,
        username: rec.username,
        size: rec.size,
        sha: rec.sha,
      });
    } catch {
      // ignore unreadable record; corruption shouldn't take down the whole list
    }
  }
  return out;
}

export async function getBackup({ root, path, id }) {
  validatePath(path);
  if (typeof id !== 'string' || id.length === 0) throw new Error('invalid id');
  if (id.includes('/') || id.includes('\\') || id.includes('..') || id.includes('\u0000')) {
    throw new Error('invalid id');
  }
  const file = join(dirFor(root, path), `${id}.json`);
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

async function newestRecord(dir) {
  let entries;
  try {
    entries = await readdir(dir);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
  const jsons = entries.filter(f => f.endsWith('.json')).sort();
  if (!jsons.length) return null;
  const newest = jsons[jsons.length - 1];
  try {
    return JSON.parse(await readFile(join(dir, newest), 'utf8'));
  } catch {
    // Treat unreadable / malformed records as "no usable newest" so a save
    // is never lost just because a prior file is corrupt. The new write
    // gets a fresh sequence number and the bad file lingers harmlessly.
    return null;
  }
}
