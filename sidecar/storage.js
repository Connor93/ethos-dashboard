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
