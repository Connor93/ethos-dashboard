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

import { readFile, readdir as readDir2 } from 'node:fs/promises';
import { writeBackup } from './storage.js';

test('writeBackup creates one JSON file with the right shape', async () => {
  await withTmp(async (root) => {
    const result = await writeBackup({
      root,
      path: 'config/admin.ini',
      content: 'hello world',
      username: 'alice',
    });
    assert.match(result.id, /^\d{10}_/);
    assert.equal(typeof result.ts, 'number');

    const dir = dirFor(root, 'config/admin.ini');
    const files = await readDir2(dir);
    const jsons = files.filter(f => f.endsWith('.json'));
    assert.equal(jsons.length, 1);

    const rec = JSON.parse(await readFile(pjoin(dir, jsons[0]), 'utf8'));
    assert.equal(rec.path, 'config/admin.ini');
    assert.equal(rec.content, 'hello world');
    assert.equal(rec.username, 'alice');
    assert.equal(rec.size, 'hello world'.length);
    assert.match(rec.sha, /^[0-9a-f]{40}$/);
    assert.equal(rec.id, result.id);
    assert.equal(rec.ts, result.ts);
  });
});

test('writeBackup writes a path file for human inspection', async () => {
  await withTmp(async (root) => {
    await writeBackup({ root, path: 'data/notes.txt', content: 'x', username: 'bob' });
    const dir = dirFor(root, 'data/notes.txt');
    const pathFile = await readFile(pjoin(dir, 'path'), 'utf8');
    assert.equal(pathFile, 'data/notes.txt');
  });
});

test('writeBackup leaves no .tmp file behind on success', async () => {
  await withTmp(async (root) => {
    await writeBackup({ root, path: 'data/notes.txt', content: 'x', username: 'bob' });
    const files = await readDir2(dirFor(root, 'data/notes.txt'));
    assert.equal(files.filter(f => f.endsWith('.tmp')).length, 0);
  });
});

test('writeBackup records size in UTF-8 bytes, not UTF-16 code units', async () => {
  await withTmp(async (root) => {
    // 'café' is 4 chars but 5 bytes in UTF-8 ('é' = 2 bytes).
    await writeBackup({ root, path: 'config/u.ini', content: 'café', username: 'alice' });
    const dir = dirFor(root, 'config/u.ini');
    const files = (await readDir2(dir)).filter(f => f.endsWith('.json'));
    const rec = JSON.parse(await readFile(pjoin(dir, files[0]), 'utf8'));
    assert.equal(rec.size, 5);
  });
});

test('writeBackup does not rewrite the path file on subsequent saves', async () => {
  await withTmp(async (root) => {
    await writeBackup({ root, path: 'config/p.ini', content: 'one', username: 'alice' });
    const dir = dirFor(root, 'config/p.ini');
    const pathFile = pjoin(dir, 'path');
    const { stat } = await import('node:fs/promises');
    const first = await stat(pathFile);
    await new Promise(r => setTimeout(r, 20));   // ensure mtime would differ if rewritten
    await writeBackup({ root, path: 'config/p.ini', content: 'two', username: 'alice' });
    const second = await stat(pathFile);
    assert.equal(first.mtimeMs, second.mtimeMs);
  });
});

test('writeBackup dedups identical successive content', async () => {
  await withTmp(async (root) => {
    const a = await writeBackup({ root, path: 'config/x.ini', content: 'same', username: 'alice' });
    const b = await writeBackup({ root, path: 'config/x.ini', content: 'same', username: 'bob' });
    assert.equal(a.id, b.id);
    const files = await readDir2(dirFor(root, 'config/x.ini'));
    assert.equal(files.filter(f => f.endsWith('.json')).length, 1);
  });
});

test('writeBackup writes a new record when content changes', async () => {
  await withTmp(async (root) => {
    await writeBackup({ root, path: 'config/x.ini', content: 'one', username: 'alice' });
    await writeBackup({ root, path: 'config/x.ini', content: 'two', username: 'alice' });
    const files = await readDir2(dirFor(root, 'config/x.ini'));
    assert.equal(files.filter(f => f.endsWith('.json')).length, 2);
  });
});
