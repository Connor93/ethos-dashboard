import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathHash, dirFor } from './storage.js';

test('pathHash returns 16 hex chars', () => {
  const h = pathHash('config/admin.ini');
  assert.match(h, /^[0-9a-f]{16}$/);
});

test('pathHash is stable for the same input', () => {
  assert.equal(pathHash('config/admin.ini'), pathHash('config/admin.ini'));
});

test('pathHash differs for different inputs', () => {
  assert.notEqual(pathHash('config/a.ini'), pathHash('config/b.ini'));
});

test('dirFor joins the root and the hash', () => {
  const h = pathHash('config/admin.ini');
  assert.equal(dirFor('/data/backups', 'config/admin.ini'), `/data/backups/${h}`);
});

import { validatePath } from './storage.js';

test('validatePath accepts normal relative paths', () => {
  assert.doesNotThrow(() => validatePath('config/admin.ini'));
  assert.doesNotThrow(() => validatePath('data/some_file.txt'));
});

test('validatePath rejects absolute paths', () => {
  assert.throws(() => validatePath('/etc/passwd'));
});

test('validatePath rejects parent directory traversal', () => {
  assert.throws(() => validatePath('config/../../etc/passwd'));
  assert.throws(() => validatePath('../foo'));
});

test('validatePath rejects null bytes', () => {
  assert.throws(() => validatePath('config\u0000admin.ini'));
});

test('validatePath rejects empty string, null, and undefined', () => {
  assert.throws(() => validatePath(''));
  assert.throws(() => validatePath(null));
  assert.throws(() => validatePath(undefined));
});

test('validatePath rejects backslashes (defense-in-depth for cross-OS reads)', () => {
  assert.throws(() => validatePath('config\\admin.ini'));
  assert.throws(() => validatePath('config\\..\\etc\\passwd'));
});

import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join as pjoin } from 'node:path';
import { nextSequence } from './storage.js';

async function withTmp(fn) {
  const dir = await mkdtemp(pjoin(tmpdir(), 'sidecar-test-'));
  try { return await fn(dir); }
  finally { await rm(dir, { recursive: true, force: true }); }
}

test('nextSequence returns 1 when directory does not exist', async () => {
  await withTmp(async (root) => {
    assert.equal(await nextSequence(pjoin(root, 'missing')), 1);
  });
});

test('nextSequence returns 1 for an empty directory', async () => {
  await withTmp(async (root) => {
    await mkdir(pjoin(root, 'd'));
    assert.equal(await nextSequence(pjoin(root, 'd')), 1);
  });
});

test('nextSequence returns max+1 from existing files', async () => {
  await withTmp(async (root) => {
    const d = pjoin(root, 'd');
    await mkdir(d);
    await writeFile(pjoin(d, '0000000001_foo.json'), '{}');
    await writeFile(pjoin(d, '0000000005_foo.json'), '{}');
    await writeFile(pjoin(d, 'path'), 'config/admin.ini');
    assert.equal(await nextSequence(d), 6);
  });
});

test('nextSequence ignores .tmp files', async () => {
  await withTmp(async (root) => {
    const d = pjoin(root, 'd');
    await mkdir(d);
    await writeFile(pjoin(d, '0000000001_foo.json'), '{}');
    await writeFile(pjoin(d, '0000000099_foo.json.tmp'), '{}');
    assert.equal(await nextSequence(d), 2);
  });
});

test('nextSequence ignores filenames whose prefix is not a 10-digit sequence', async () => {
  await withTmp(async (root) => {
    const d = pjoin(root, 'd');
    await mkdir(d);
    // Short numeric prefix (1 digit) — must NOT be treated as sequence 1.
    await writeFile(pjoin(d, '1_foo.json'), '{}');
    // Non-numeric prefix.
    await writeFile(pjoin(d, 'abcdefghij_foo.json'), '{}');
    // Valid 10-digit name to anchor the result.
    await writeFile(pjoin(d, '0000000007_foo.json'), '{}');
    assert.equal(await nextSequence(d), 8);
  });
});
