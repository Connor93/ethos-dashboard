import { createHash } from 'node:crypto';
import { join } from 'node:path';

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

import { readdir } from 'node:fs/promises';

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
    if (!name.endsWith('.json')) continue;          // skips .tmp and the `path` file
    const seq = parseInt(name.slice(0, 10), 10);
    if (Number.isFinite(seq) && seq > max) max = seq;
  }
  return max + 1;
}
