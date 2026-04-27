import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { readdir } from 'node:fs/promises';

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
