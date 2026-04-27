import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { readdir, writeFile, rename, mkdir } from 'node:fs/promises';

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
  await writeFile(join(dir, 'path'), path);

  const seq = await nextSequence(dir);
  const ts = Date.now();
  const id = `${pad10(seq)}_${isoFsSafe(new Date(ts))}`;
  const sha = sha1Hex(content);
  const record = {
    id,
    path,
    ts,
    username,
    size: content.length,
    sha,
    content,
  };

  const finalPath = join(dir, `${id}.json`);
  const tmpPath = `${finalPath}.tmp`;
  await writeFile(tmpPath, JSON.stringify(record));
  await rename(tmpPath, finalPath);

  return { id, ts };
}
