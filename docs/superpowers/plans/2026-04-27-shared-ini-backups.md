# Shared INI Backups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move per-browser IndexedDB INI-edit history into a shared, container-volume-backed store served by a tiny Node sidecar inside the dashboard container, so all dashboard users see the same history (timestamp, username, content) for each file, capped at 20 versions per file, surviving container redeploys.

**Architecture:** Single dashboard container runs both nginx (existing) and a new Node sidecar bound to `127.0.0.1:3001`. Nginx proxies `/local-api/*` to the sidecar. The sidecar reads/writes JSON backup records on a Docker named volume mounted at `/data/backups`. The frontend's existing `src/utils/backups.js` keeps the same exported names but its internals become HTTP calls to the sidecar instead of IndexedDB.

**Tech Stack:**
- Sidecar: Node 20 (ESM), zero npm deps, native modules only (`node:http`, `node:fs/promises`, `node:crypto`)
- Tests: `node --test` (built-in, no devDependency)
- Container: `nginx:alpine` runtime + `apk add nodejs`
- Frontend: vanilla JS modules (existing)

**Spec:** `docs/superpowers/specs/2026-04-27-shared-ini-backups-design.md`

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `sidecar/package.json` | Create | Marks sidecar as ESM (`"type": "module"`); no deps |
| `sidecar/storage.js` | Create | Filesystem layer: pathHash, write/list/get, dedup, retention, atomic rename |
| `sidecar/storage.test.js` | Create | Unit tests for storage |
| `sidecar/handlers.js` | Create | HTTP request → storage operation; routing & validation |
| `sidecar/handlers.test.js` | Create | Unit tests for handlers (with stub storage) |
| `sidecar/server.js` | Create | Entry point: builds storage, wires handlers, starts http server |
| `sidecar/server.test.js` | Create | Integration test: starts the server on a random port and hits it over real HTTP |
| `Dockerfile` | Modify | Install nodejs in runtime stage; copy `sidecar/` |
| `docker-entrypoint.sh` | Modify | Ensure `/data/backups` exists, launch sidecar in background, then `exec nginx` |
| `nginx.conf` | Modify | Add `location /local-api/` block that proxies to `127.0.0.1:3001` |
| `docker-compose.yml` | Modify | Add `etheos-dashboard-backups` named volume, mount it at `/data/backups` |
| `deploy.sh` | Modify | Same volume additions in the remote `docker-compose.yml` heredoc |
| `src/utils/backups.js` | Replace contents | Same exports (`saveBackup`, `listBackups`, `getBackup`), HTTP transport instead of IndexedDB |
| `src/tabs/files.js` | Modify | Pass `getUsername()` to `saveBackup`; render username in history rows; pass `path` to `getBackup` for O(1) lookup |

---

## Task 1: Sidecar skeleton & test runner

**Files:**
- Create: `sidecar/package.json`
- Create: `sidecar/storage.js`
- Create: `sidecar/storage.test.js`
- Create: `sidecar/handlers.js`
- Create: `sidecar/handlers.test.js`
- Create: `sidecar/server.js`
- Create: `sidecar/server.test.js`

- [ ] **Step 1: Create sidecar/package.json**

```json
{
  "name": "etheos-dashboard-sidecar",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: Create empty placeholder source files**

`sidecar/storage.js`:
```js
// Storage layer for backup records on the filesystem.
```

`sidecar/handlers.js`:
```js
// HTTP request handlers for the backup sidecar.
```

`sidecar/server.js`:
```js
// Sidecar entry point.
```

- [ ] **Step 3: Create a single placeholder test in each test file**

`sidecar/storage.test.js`:
```js
import { test } from 'node:test';

test('storage skeleton compiles', () => {
  // Replaced by real tests in later tasks.
});
```

`sidecar/handlers.test.js`:
```js
import { test } from 'node:test';

test('handlers skeleton compiles', () => {
  // Replaced by real tests in later tasks.
});
```

`sidecar/server.test.js`:
```js
import { test } from 'node:test';

test('server skeleton compiles', () => {
  // Replaced by real tests in later tasks.
});
```

- [ ] **Step 4: Run the test runner to verify the skeleton works**

Run: `cd sidecar && npm test`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add sidecar/
git commit -m "feat(sidecar): add skeleton and node --test runner"
```

---

## Task 2: Storage — `pathHash` and `dirFor`

**Files:**
- Modify: `sidecar/storage.js`
- Modify: `sidecar/storage.test.js`

- [ ] **Step 1: Write the failing tests**

Replace the contents of `sidecar/storage.test.js` with:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd sidecar && npm test`
Expected: FAIL with `SyntaxError: The requested module './storage.js' does not provide an export named 'pathHash'` (or similar).

- [ ] **Step 3: Implement**

Replace `sidecar/storage.js` with:

```js
import { createHash } from 'node:crypto';
import { join } from 'node:path';

export function pathHash(path) {
  return createHash('sha1').update(path).digest('hex').slice(0, 16);
}

export function dirFor(root, path) {
  return join(root, pathHash(path));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd sidecar && npm test`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add sidecar/
git commit -m "feat(sidecar): add pathHash and dirFor"
```

---

## Task 3: Storage — `validatePath`

**Files:**
- Modify: `sidecar/storage.js`
- Modify: `sidecar/storage.test.js`

- [ ] **Step 1: Add failing tests**

Append to `sidecar/storage.test.js`:

```js
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

test('validatePath rejects empty string', () => {
  assert.throws(() => validatePath(''));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd sidecar && npm test`
Expected: FAIL — no `validatePath` export.

- [ ] **Step 3: Implement**

Append to `sidecar/storage.js`:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd sidecar && npm test`
Expected: 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add sidecar/
git commit -m "feat(sidecar): add validatePath"
```

---

## Task 4: Storage — `nextSequence`

**Files:**
- Modify: `sidecar/storage.js`
- Modify: `sidecar/storage.test.js`

- [ ] **Step 1: Add failing tests**

Append to `sidecar/storage.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd sidecar && npm test`
Expected: FAIL — no `nextSequence` export.

- [ ] **Step 3: Implement**

Append to `sidecar/storage.js`:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd sidecar && npm test`
Expected: 13 tests pass.

- [ ] **Step 5: Commit**

```bash
git add sidecar/
git commit -m "feat(sidecar): add nextSequence directory scan"
```

---

## Task 5: Storage — `writeBackup` happy path (atomic, no dedup/retention yet)

**Files:**
- Modify: `sidecar/storage.js`
- Modify: `sidecar/storage.test.js`

- [ ] **Step 1: Add failing tests**

Append to `sidecar/storage.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd sidecar && npm test`
Expected: FAIL — no `writeBackup` export.

- [ ] **Step 3: Implement**

Append to `sidecar/storage.js`:

```js
import { writeFile, rename, mkdir } from 'node:fs/promises';

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd sidecar && npm test`
Expected: 16 tests pass.

- [ ] **Step 5: Commit**

```bash
git add sidecar/
git commit -m "feat(sidecar): add writeBackup with atomic rename"
```

---

## Task 6: Storage — `writeBackup` dedup

**Files:**
- Modify: `sidecar/storage.js`
- Modify: `sidecar/storage.test.js`

- [ ] **Step 1: Add failing tests**

Append to `sidecar/storage.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd sidecar && npm test`
Expected: FAIL — `writeBackup dedups identical successive content` fails because two files exist.

- [ ] **Step 3: Implement**

Add a helper at the bottom of `sidecar/storage.js`:

```js
async function newestRecord(dir) {
  let entries;
  try { entries = await readdir(dir); } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
  const jsons = entries.filter(f => f.endsWith('.json')).sort();
  if (!jsons.length) return null;
  const newest = jsons[jsons.length - 1];
  const text = await (await import('node:fs/promises')).readFile(join(dir, newest), 'utf8');
  return JSON.parse(text);
}
```

Then modify `writeBackup` (insert just after `await writeFile(join(dir, 'path'), path);`):

```js
const newest = await newestRecord(dir);
const incomingSha = sha1Hex(content);
if (newest && newest.sha === incomingSha) {
  return { id: newest.id, ts: newest.ts };
}
```

…and reuse `incomingSha` in place of the later `sha1Hex(content)` call so we don't hash twice. The final `writeBackup` body should look like:

```js
export async function writeBackup({ root, path, content, username }) {
  validatePath(path);
  if (typeof content !== 'string') throw new Error('content must be a string');
  if (typeof username !== 'string' || username.length === 0) {
    throw new Error('username must be a non-empty string');
  }

  const dir = dirFor(root, path);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'path'), path);

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
    size: content.length,
    sha: incomingSha,
    content,
  };

  const finalPath = join(dir, `${id}.json`);
  const tmpPath = `${finalPath}.tmp`;
  await writeFile(tmpPath, JSON.stringify(record));
  await rename(tmpPath, finalPath);

  return { id, ts };
}
```

Also, change the top imports of `storage.js` to import `readFile` directly (cleaner than the dynamic import):

```js
import { writeFile, rename, mkdir, readdir, readFile } from 'node:fs/promises';
```

…and rewrite `newestRecord` to use it:

```js
async function newestRecord(dir) {
  let entries;
  try { entries = await readdir(dir); } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
  const jsons = entries.filter(f => f.endsWith('.json')).sort();
  if (!jsons.length) return null;
  const newest = jsons[jsons.length - 1];
  return JSON.parse(await readFile(join(dir, newest), 'utf8'));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd sidecar && npm test`
Expected: 18 tests pass.

- [ ] **Step 5: Commit**

```bash
git add sidecar/
git commit -m "feat(sidecar): dedup identical successive backups by SHA"
```

---

## Task 7: Storage — retention cap (20 per file)

**Files:**
- Modify: `sidecar/storage.js`
- Modify: `sidecar/storage.test.js`

- [ ] **Step 1: Add failing test**

Append to `sidecar/storage.test.js`:

```js
test('writeBackup caps retention at 20 newest per file', async () => {
  await withTmp(async (root) => {
    for (let i = 0; i < 22; i++) {
      await writeBackup({ root, path: 'config/r.ini', content: `v${i}`, username: 'alice' });
    }
    const dir = dirFor(root, 'config/r.ini');
    const files = (await readDir2(dir)).filter(f => f.endsWith('.json')).sort();
    assert.equal(files.length, 20);
    // Oldest two were v0 and v1 (sequence 1 and 2). They should be gone.
    assert.equal(files[0].startsWith('0000000003_'), true);
    assert.equal(files[19].startsWith('0000000022_'), true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd sidecar && npm test`
Expected: FAIL — `files.length` will be 22.

- [ ] **Step 3: Implement**

Add at the bottom of `sidecar/storage.js`:

```js
import { unlink } from 'node:fs/promises';

const MAX_PER_PATH = 20;

async function enforceRetention(dir) {
  let entries;
  try { entries = await readdir(dir); } catch (e) {
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
```

Hoist `unlink` into the existing import line at the top:

```js
import { writeFile, rename, mkdir, readdir, readFile, unlink } from 'node:fs/promises';
```

…and remove the duplicate `import { unlink }` you just added.

In `writeBackup`, after the `rename`, call `enforceRetention(dir)`:

```js
await rename(tmpPath, finalPath);
await enforceRetention(dir);

return { id, ts };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd sidecar && npm test`
Expected: 19 tests pass.

- [ ] **Step 5: Commit**

```bash
git add sidecar/
git commit -m "feat(sidecar): cap backup retention at 20 newest per file"
```

---

## Task 8: Storage — `listBackups`

**Files:**
- Modify: `sidecar/storage.js`
- Modify: `sidecar/storage.test.js`

- [ ] **Step 1: Add failing tests**

Append to `sidecar/storage.test.js`:

```js
import { listBackups as listB } from './storage.js';

test('listBackups returns [] for an unknown path', async () => {
  await withTmp(async (root) => {
    const out = await listB({ root, path: 'config/unknown.ini' });
    assert.deepEqual(out, []);
  });
});

test('listBackups returns metadata only, newest first', async () => {
  await withTmp(async (root) => {
    await writeBackup({ root, path: 'config/l.ini', content: 'v1', username: 'alice' });
    await writeBackup({ root, path: 'config/l.ini', content: 'v2', username: 'bob' });
    const out = await listB({ root, path: 'config/l.ini' });
    assert.equal(out.length, 2);
    assert.equal(out[0].username, 'bob');             // newest first
    assert.equal(out[1].username, 'alice');
    assert.equal(out[0].content, undefined);          // metadata only
    assert.equal(typeof out[0].id, 'string');
    assert.equal(typeof out[0].ts, 'number');
    assert.equal(typeof out[0].size, 'number');
    assert.equal(typeof out[0].sha, 'string');
  });
});

test('listBackups ignores .tmp and the path file', async () => {
  await withTmp(async (root) => {
    await writeBackup({ root, path: 'config/l.ini', content: 'v1', username: 'alice' });
    const dir = dirFor(root, 'config/l.ini');
    await writeFile(pjoin(dir, '0000000099_x.json.tmp'), 'garbage');
    const out = await listB({ root, path: 'config/l.ini' });
    assert.equal(out.length, 1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd sidecar && npm test`
Expected: FAIL — no `listBackups` export.

- [ ] **Step 3: Implement**

Append to `sidecar/storage.js`:

```js
export async function listBackups({ root, path }) {
  validatePath(path);
  const dir = dirFor(root, path);
  let entries;
  try { entries = await readdir(dir); } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  const jsons = entries.filter(f => f.endsWith('.json')).sort().reverse();   // newest first
  const out = [];
  for (const name of jsons.slice(0, MAX_PER_PATH)) {
    try {
      const rec = JSON.parse(await readFile(join(dir, name), 'utf8'));
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd sidecar && npm test`
Expected: 22 tests pass.

- [ ] **Step 5: Commit**

```bash
git add sidecar/
git commit -m "feat(sidecar): add listBackups (metadata, newest-first)"
```

---

## Task 9: Storage — `getBackup`

**Files:**
- Modify: `sidecar/storage.js`
- Modify: `sidecar/storage.test.js`

- [ ] **Step 1: Add failing tests**

Append to `sidecar/storage.test.js`:

```js
import { getBackup as getB } from './storage.js';

test('getBackup returns the full record including content', async () => {
  await withTmp(async (root) => {
    const w = await writeBackup({ root, path: 'config/g.ini', content: 'payload', username: 'alice' });
    const rec = await getB({ root, path: 'config/g.ini', id: w.id });
    assert.equal(rec.content, 'payload');
    assert.equal(rec.id, w.id);
    assert.equal(rec.username, 'alice');
  });
});

test('getBackup returns null for a missing id', async () => {
  await withTmp(async (root) => {
    await writeBackup({ root, path: 'config/g.ini', content: 'x', username: 'alice' });
    const rec = await getB({ root, path: 'config/g.ini', id: '0000000099_does-not-exist' });
    assert.equal(rec, null);
  });
});

test('getBackup rejects an id that contains a path separator', async () => {
  await withTmp(async (root) => {
    await assert.rejects(
      () => getB({ root, path: 'config/g.ini', id: '../other/0000000001_x' }),
      /invalid id/i
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd sidecar && npm test`
Expected: FAIL — no `getBackup` export.

- [ ] **Step 3: Implement**

Append to `sidecar/storage.js`:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd sidecar && npm test`
Expected: 25 tests pass.

- [ ] **Step 5: Commit**

```bash
git add sidecar/
git commit -m "feat(sidecar): add getBackup with id validation"
```

---

## Task 10: Storage — opportunistic stale `.tmp` cleanup

**Files:**
- Modify: `sidecar/storage.js`
- Modify: `sidecar/storage.test.js`

- [ ] **Step 1: Add failing test**

Append to `sidecar/storage.test.js`:

```js
test('writeBackup cleans up stale .tmp files in the dir', async () => {
  await withTmp(async (root) => {
    const dir = dirFor(root, 'config/c.ini');
    await mkdir(dir, { recursive: true });
    await writeFile(pjoin(dir, '0000000099_zombie.json.tmp'), 'leftover');

    await writeBackup({ root, path: 'config/c.ini', content: 'fresh', username: 'alice' });

    const files = await readDir2(dir);
    assert.equal(files.filter(f => f.endsWith('.tmp')).length, 0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd sidecar && npm test`
Expected: FAIL — the zombie `.tmp` file is still there.

- [ ] **Step 3: Implement**

Add a helper to `sidecar/storage.js`:

```js
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
```

In `writeBackup`, call `cleanupTmp(dir)` immediately after `await mkdir(dir, { recursive: true });`:

```js
await mkdir(dir, { recursive: true });
await cleanupTmp(dir);
await writeFile(join(dir, 'path'), path);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd sidecar && npm test`
Expected: 26 tests pass.

- [ ] **Step 5: Commit**

```bash
git add sidecar/
git commit -m "feat(sidecar): clean up stale .tmp files on write"
```

---

## Task 11: Handlers — POST /backups

**Files:**
- Modify: `sidecar/handlers.js`
- Modify: `sidecar/handlers.test.js`

- [ ] **Step 1: Write the failing tests**

Replace `sidecar/handlers.test.js` with:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from './handlers.js';

function fakeStorage() {
  const calls = [];
  return {
    calls,
    async writeBackup(args) { calls.push(['write', args]); return { id: 'fake-id', ts: 123 }; },
    async listBackups(args) { calls.push(['list', args]); return [{ id: 'a', ts: 1, username: 'u', size: 1, sha: 'x' }]; },
    async getBackup(args) {
      calls.push(['get', args]);
      if (args.id === 'missing') return null;
      return { id: args.id, path: args.path, ts: 1, username: 'u', size: 1, sha: 'x', content: 'hi' };
    },
  };
}

function fakeReq({ method, url, body }) {
  return {
    method,
    url,
    headers: {},
    [Symbol.asyncIterator]: async function* () {
      if (body) yield Buffer.from(body);
    },
  };
}

function fakeRes() {
  const res = { statusCode: 200, headers: {}, body: '' };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.writeHead = (code, headers) => { res.statusCode = code; if (headers) Object.assign(res.headers, headers); };
  res.end = (data) => { res.body = data ?? ''; res.ended = true; };
  return res;
}

test('POST /backups writes and returns 200 with id, ts', async () => {
  const storage = fakeStorage();
  const res = fakeRes();
  await handleRequest({ storage }, fakeReq({
    method: 'POST',
    url: '/backups',
    body: JSON.stringify({ path: 'config/admin.ini', content: 'hi', username: 'alice' }),
  }), res);
  assert.equal(res.statusCode, 200);
  const out = JSON.parse(res.body);
  assert.equal(out.id, 'fake-id');
  assert.equal(out.ts, 123);
  assert.deepEqual(storage.calls[0], ['write', { root: undefined, path: 'config/admin.ini', content: 'hi', username: 'alice' }]);
});

test('POST /backups returns 400 when fields are missing', async () => {
  const storage = fakeStorage();
  const res = fakeRes();
  await handleRequest({ storage }, fakeReq({
    method: 'POST',
    url: '/backups',
    body: JSON.stringify({ path: 'config/admin.ini' }),
  }), res);
  assert.equal(res.statusCode, 400);
});

test('POST /backups returns 400 on invalid JSON', async () => {
  const storage = fakeStorage();
  const res = fakeRes();
  await handleRequest({ storage }, fakeReq({
    method: 'POST',
    url: '/backups',
    body: '{not json',
  }), res);
  assert.equal(res.statusCode, 400);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd sidecar && npm test`
Expected: FAIL — no `handleRequest` export.

- [ ] **Step 3: Implement**

Replace `sidecar/handlers.js` with:

```js
async function readBody(req) {
  let total = 0;
  const chunks = [];
  for await (const chunk of req) {
    total += chunk.length;
    if (total > 16 * 1024 * 1024) throw new Error('request body too large');   // 16MB cap
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function send(res, status, body) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(text);
}

function parseUrl(url) {
  const u = new URL(url, 'http://x');
  return { pathname: u.pathname, params: u.searchParams };
}

export async function handleRequest({ storage, root }, req, res) {
  const { pathname, params } = parseUrl(req.url);

  if (req.method === 'POST' && pathname === '/backups') {
    let body;
    try { body = JSON.parse(await readBody(req)); }
    catch { return send(res, 400, { error: 'invalid JSON body' }); }

    const { path, content, username } = body || {};
    if (typeof path !== 'string' || !path) return send(res, 400, { error: 'missing path' });
    if (typeof content !== 'string')        return send(res, 400, { error: 'missing content' });
    if (typeof username !== 'string' || !username) return send(res, 400, { error: 'missing username' });

    try {
      const result = await storage.writeBackup({ root, path, content, username });
      return send(res, 200, result);
    } catch (e) {
      return send(res, 500, { error: e.message });
    }
  }

  return send(res, 404, { error: 'not found' });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd sidecar && npm test`
Expected: 29 tests pass.

- [ ] **Step 5: Commit**

```bash
git add sidecar/
git commit -m "feat(sidecar): add POST /backups handler"
```

---

## Task 12: Handlers — GET /backups (list)

**Files:**
- Modify: `sidecar/handlers.js`
- Modify: `sidecar/handlers.test.js`

- [ ] **Step 1: Add failing tests**

Append to `sidecar/handlers.test.js`:

```js
test('GET /backups?path=… returns the list', async () => {
  const storage = fakeStorage();
  const res = fakeRes();
  await handleRequest({ storage }, fakeReq({
    method: 'GET',
    url: '/backups?path=' + encodeURIComponent('config/admin.ini'),
  }), res);
  assert.equal(res.statusCode, 200);
  const out = JSON.parse(res.body);
  assert.equal(Array.isArray(out.backups), true);
  assert.equal(out.backups.length, 1);
  assert.deepEqual(storage.calls[0], ['list', { root: undefined, path: 'config/admin.ini' }]);
});

test('GET /backups returns 400 when path is missing', async () => {
  const storage = fakeStorage();
  const res = fakeRes();
  await handleRequest({ storage }, fakeReq({ method: 'GET', url: '/backups' }), res);
  assert.equal(res.statusCode, 400);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd sidecar && npm test`
Expected: FAIL — current handler returns 404 for these.

- [ ] **Step 3: Implement**

In `sidecar/handlers.js`, add this branch *before* the trailing `return send(res, 404, ...)`:

```js
  if (req.method === 'GET' && pathname === '/backups') {
    const path = params.get('path');
    if (!path) return send(res, 400, { error: 'missing path' });
    try {
      const backups = await storage.listBackups({ root, path });
      return send(res, 200, { backups });
    } catch (e) {
      return send(res, 500, { error: e.message });
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd sidecar && npm test`
Expected: 31 tests pass.

- [ ] **Step 5: Commit**

```bash
git add sidecar/
git commit -m "feat(sidecar): add GET /backups list handler"
```

---

## Task 13: Handlers — GET /backups/:id (fetch one)

**Files:**
- Modify: `sidecar/handlers.js`
- Modify: `sidecar/handlers.test.js`

- [ ] **Step 1: Add failing tests**

Append to `sidecar/handlers.test.js`:

```js
test('GET /backups/:id?path=… returns the full record', async () => {
  const storage = fakeStorage();
  const res = fakeRes();
  await handleRequest({ storage }, fakeReq({
    method: 'GET',
    url: '/backups/0000000001_xyz?path=' + encodeURIComponent('config/admin.ini'),
  }), res);
  assert.equal(res.statusCode, 200);
  const out = JSON.parse(res.body);
  assert.equal(out.content, 'hi');
  assert.equal(out.id, '0000000001_xyz');
  assert.deepEqual(storage.calls[0], ['get', { root: undefined, path: 'config/admin.ini', id: '0000000001_xyz' }]);
});

test('GET /backups/:id returns 400 when path is missing', async () => {
  const storage = fakeStorage();
  const res = fakeRes();
  await handleRequest({ storage }, fakeReq({ method: 'GET', url: '/backups/0000000001_xyz' }), res);
  assert.equal(res.statusCode, 400);
});

test('GET /backups/:id returns 404 when not found', async () => {
  const storage = fakeStorage();
  const res = fakeRes();
  await handleRequest({ storage }, fakeReq({
    method: 'GET',
    url: '/backups/missing?path=' + encodeURIComponent('config/admin.ini'),
  }), res);
  assert.equal(res.statusCode, 404);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd sidecar && npm test`
Expected: FAIL — current handler doesn't match `/backups/<id>`.

- [ ] **Step 3: Implement**

In `sidecar/handlers.js`, add this branch *before* the trailing `return send(res, 404, ...)`:

```js
  if (req.method === 'GET' && pathname.startsWith('/backups/')) {
    const id = pathname.slice('/backups/'.length);
    if (!id) return send(res, 404, { error: 'not found' });
    const path = params.get('path');
    if (!path) return send(res, 400, { error: 'missing path' });
    try {
      const rec = await storage.getBackup({ root, path, id });
      if (!rec) return send(res, 404, { error: 'not found' });
      return send(res, 200, rec);
    } catch (e) {
      return send(res, 500, { error: e.message });
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd sidecar && npm test`
Expected: 34 tests pass.

- [ ] **Step 5: Commit**

```bash
git add sidecar/
git commit -m "feat(sidecar): add GET /backups/:id handler"
```

---

## Task 14: Handlers — per-path mutex around POST

**Files:**
- Modify: `sidecar/handlers.js`
- Modify: `sidecar/handlers.test.js`

- [ ] **Step 1: Add failing test**

Append to `sidecar/handlers.test.js`:

```js
test('Concurrent POSTs to the same path serialize', async () => {
  let active = 0, maxActive = 0;
  const storage = {
    async writeBackup() {
      active++; maxActive = Math.max(maxActive, active);
      await new Promise(r => setTimeout(r, 20));
      active--;
      return { id: 'x', ts: 0 };
    },
  };
  const make = () => handleRequest({ storage }, fakeReq({
    method: 'POST',
    url: '/backups',
    body: JSON.stringify({ path: 'p.ini', content: 'c', username: 'u' }),
  }), fakeRes());

  await Promise.all([make(), make(), make()]);
  assert.equal(maxActive, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd sidecar && npm test`
Expected: FAIL — `maxActive` will be 3.

- [ ] **Step 3: Implement**

At the top of `sidecar/handlers.js` (above `handleRequest`), add a per-path lock:

```js
const pathLocks = new Map();

async function withPathLock(path, fn) {
  const prev = pathLocks.get(path) || Promise.resolve();
  let release;
  const next = new Promise(r => { release = r; });
  pathLocks.set(path, prev.then(() => next));
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (pathLocks.get(path) === prev.then(() => next)) {
      // best-effort cleanup; not strictly required
    }
  }
}
```

In the POST branch, wrap the storage call:

```js
    try {
      const result = await withPathLock(path, () => storage.writeBackup({ root, path, content, username }));
      return send(res, 200, result);
    } catch (e) {
      return send(res, 500, { error: e.message });
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd sidecar && npm test`
Expected: 35 tests pass.

- [ ] **Step 5: Commit**

```bash
git add sidecar/
git commit -m "feat(sidecar): serialize concurrent POSTs per path"
```

---

## Task 15: Server entry point + integration test

**Files:**
- Modify: `sidecar/server.js`
- Modify: `sidecar/server.test.js`

- [ ] **Step 1: Write the failing integration test**

Replace `sidecar/server.test.js` with:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from './server.js';

test('end-to-end: POST then GET then GET-by-id over real HTTP', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sidecar-int-'));
  const { server, port } = await startServer({ root, host: '127.0.0.1', port: 0 });
  try {
    const base = `http://127.0.0.1:${port}`;

    const post = await fetch(`${base}/backups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'config/admin.ini', content: 'hello', username: 'alice' }),
    });
    assert.equal(post.status, 200);
    const { id } = await post.json();
    assert.match(id, /^\d{10}_/);

    const list = await fetch(`${base}/backups?path=${encodeURIComponent('config/admin.ini')}`);
    assert.equal(list.status, 200);
    const { backups } = await list.json();
    assert.equal(backups.length, 1);
    assert.equal(backups[0].username, 'alice');

    const one = await fetch(`${base}/backups/${id}?path=${encodeURIComponent('config/admin.ini')}`);
    assert.equal(one.status, 200);
    const rec = await one.json();
    assert.equal(rec.content, 'hello');
  } finally {
    await new Promise(r => server.close(r));
    await rm(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd sidecar && npm test`
Expected: FAIL — no `startServer` export.

- [ ] **Step 3: Implement**

Replace `sidecar/server.js` with:

```js
import { createServer } from 'node:http';
import * as storageModule from './storage.js';
import { handleRequest } from './handlers.js';

export async function startServer({ root, host = '127.0.0.1', port = 3001 }) {
  const storage = {
    writeBackup: storageModule.writeBackup,
    listBackups: storageModule.listBackups,
    getBackup: storageModule.getBackup,
  };

  const server = createServer((req, res) => {
    handleRequest({ storage, root }, req, res).catch((err) => {
      console.error('sidecar request error:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'internal error' }));
      }
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  return { server, port: server.address().port };
}

// Allow `node server.js` to start with env-driven config.
if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.env.BACKUP_ROOT || '/data/backups';
  const port = parseInt(process.env.BACKUP_PORT || '3001', 10);
  startServer({ root, host: '127.0.0.1', port }).then(({ port }) => {
    console.log(`sidecar listening on 127.0.0.1:${port}, root=${root}`);
  }).catch((err) => {
    console.error('sidecar failed to start:', err);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd sidecar && npm test`
Expected: 36 tests pass.

- [ ] **Step 5: Commit**

```bash
git add sidecar/
git commit -m "feat(sidecar): wire up HTTP server entry point"
```

---

## Task 16: Dockerfile — install nodejs, copy sidecar

**Files:**
- Modify: `Dockerfile`

- [ ] **Step 1: Edit Dockerfile**

Replace `Dockerfile` with:

```dockerfile
# syntax=docker/dockerfile:1

# ===========================================
# Stage 1: Build the Vite application
# ===========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# ===========================================
# Stage 2: Serve with Nginx + run sidecar
# ===========================================
FROM nginx:alpine

# Add Node.js for the backups sidecar
RUN apk add --no-cache nodejs

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx configuration (templated at deploy time)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy backups sidecar
COPY sidecar /app/sidecar

# Copy entrypoint script that templates nginx config and starts sidecar + nginx
COPY docker-entrypoint.sh /docker-entrypoint-custom.sh
RUN chmod +x /docker-entrypoint-custom.sh

EXPOSE 80

CMD ["/docker-entrypoint-custom.sh"]
```

- [ ] **Step 2: Build the image to verify it succeeds**

Run: `docker build --platform linux/amd64 -t etheos-dashboard:plan-test .`
Expected: build succeeds; the final image lists `nodejs` and includes `/app/sidecar/server.js`.

- [ ] **Step 3: Spot-check that node is present and the sidecar code copied**

Run: `docker run --rm etheos-dashboard:plan-test sh -c 'node --version && ls /app/sidecar'`
Expected: a `v20.x` (or whatever Alpine ships) line and a directory listing including `server.js`, `storage.js`, `handlers.js`, `package.json`.

- [ ] **Step 4: Commit**

```bash
git add Dockerfile
git commit -m "build(docker): install nodejs and bundle backup sidecar"
```

---

## Task 17: docker-entrypoint.sh — launch sidecar in background

**Files:**
- Modify: `docker-entrypoint.sh`

- [ ] **Step 1: Edit docker-entrypoint.sh**

Replace contents with:

```sh
#!/bin/sh
# Template the nginx config with environment variables, start the backup
# sidecar, then run nginx in the foreground.
set -eu

sed -i "s|ETHEOS_API_URL|${ETHEOS_API_URL}|g" /etc/nginx/conf.d/default.conf
sed -i "s|ETHEOS_API_KEY|${ETHEOS_API_KEY}|g" /etc/nginx/conf.d/default.conf

# Ensure the volume directory exists and is writable
mkdir -p /data/backups

# Launch the backup sidecar in the background. If it dies, nginx (and the
# container) keep running; POSTs to /local-api/* will start failing and the
# frontend will surface a "backup failed" toast — saves themselves go through
# /api/* and are unaffected.
node /app/sidecar/server.js &

exec nginx -g 'daemon off;'
```

- [ ] **Step 2: Rebuild the image and verify both processes start**

Run:
```bash
docker build --platform linux/amd64 -t etheos-dashboard:plan-test .
docker run --rm -d --name etheos-dashboard-test \
  -e ETHEOS_API_URL=http://example/ \
  -e ETHEOS_API_KEY=test \
  -p 18080:80 \
  etheos-dashboard:plan-test
sleep 2
docker exec etheos-dashboard-test sh -c 'pgrep -a nginx && pgrep -a node'
```
Expected: both `nginx` and `node /app/sidecar/server.js` show up in the process list.

- [ ] **Step 3: Verify the sidecar is reachable from inside the container**

Run: `docker exec etheos-dashboard-test wget -qO- http://127.0.0.1:3001/backups?path=foo`
Expected: `{"backups":[]}` (empty list — no backups yet).

- [ ] **Step 4: Tear down**

Run: `docker rm -f etheos-dashboard-test`

- [ ] **Step 5: Commit**

```bash
git add docker-entrypoint.sh
git commit -m "build(docker): launch backup sidecar from entrypoint"
```

---

## Task 18: nginx.conf — proxy /local-api/ to the sidecar

**Files:**
- Modify: `nginx.conf`

- [ ] **Step 1: Edit nginx.conf**

Add the following `location` block immediately after the existing `location /api/` block (before `location /`):

```nginx
    # Reverse proxy /local-api/* to the backup sidecar that runs alongside nginx
    # in this container. The sidecar binds to 127.0.0.1, so it is only
    # reachable through nginx — we don't enforce auth at the sidecar layer
    # because anyone able to hit nginx already has dashboard access.
    location /local-api/ {
        proxy_pass http://127.0.0.1:3001/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;
        # Same INI-safety reason as the /api/ block — keep large bodies
        # (a full INI file save) in memory rather than spilling to a temp file.
        client_body_buffer_size 1m;
    }
```

- [ ] **Step 2: Rebuild the image and verify routing works end-to-end through nginx**

Run:
```bash
docker build --platform linux/amd64 -t etheos-dashboard:plan-test .
docker run --rm -d --name etheos-dashboard-test \
  -e ETHEOS_API_URL=http://example/ \
  -e ETHEOS_API_KEY=test \
  -p 18080:80 \
  etheos-dashboard:plan-test
sleep 2
curl -fsS -X POST http://127.0.0.1:18080/local-api/backups \
  -H 'Content-Type: application/json' \
  -d '{"path":"config/admin.ini","content":"hello","username":"alice"}'
echo
curl -fsS "http://127.0.0.1:18080/local-api/backups?path=config%2Fadmin.ini"
echo
docker rm -f etheos-dashboard-test
```
Expected: first curl prints `{"id":"...","ts":...}`. Second curl prints `{"backups":[{...}]}` with one entry whose `username` is `alice`.

- [ ] **Step 3: Commit**

```bash
git add nginx.conf
git commit -m "feat(nginx): proxy /local-api/ to backup sidecar"
```

---

## Task 19: docker-compose.yml — named volume for backups

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Edit docker-compose.yml**

Replace contents with:

```yaml
services:
  etheos-dashboard:
    image: ghcr.io/connor93/etheos-dashboard:latest
    container_name: etheos-dashboard
    restart: unless-stopped
    networks:
      - web
    volumes:
      - etheos-dashboard-backups:/data/backups

networks:
  web:
    external: true

volumes:
  etheos-dashboard-backups:
```

- [ ] **Step 2: Verify by bringing the stack up locally and writing+restarting**

Run from a temporary scratch dir (so we don't depend on the production GHCR image being available):
```bash
docker tag etheos-dashboard:plan-test ghcr.io/connor93/etheos-dashboard:latest
mkdir -p /tmp/dashtest && cd /tmp/dashtest
cat > docker-compose.yml <<'EOF'
services:
  etheos-dashboard:
    image: ghcr.io/connor93/etheos-dashboard:latest
    container_name: etheos-dashboard-volcheck
    restart: unless-stopped
    environment:
      - ETHEOS_API_URL=http://example/
      - ETHEOS_API_KEY=test
    volumes:
      - etheos-dashboard-backups:/data/backups
    ports:
      - "18080:80"
volumes:
  etheos-dashboard-backups:
EOF
docker compose up -d
sleep 2
curl -fsS -X POST http://127.0.0.1:18080/local-api/backups \
  -H 'Content-Type: application/json' \
  -d '{"path":"config/admin.ini","content":"persisted","username":"alice"}'
docker compose down
docker compose up -d
sleep 2
curl -fsS "http://127.0.0.1:18080/local-api/backups?path=config%2Fadmin.ini"
docker compose down -v
cd - && rm -rf /tmp/dashtest
```
Expected: the second `curl` (after a full down+up) still returns the backup with `username:"alice"`. The volume survived container recreation.

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "build(compose): add etheos-dashboard-backups named volume"
```

---

## Task 20: deploy.sh — same volume in the remote compose template

**Files:**
- Modify: `deploy.sh`

- [ ] **Step 1: Edit deploy.sh**

Find the heredoc that writes `~/etheos-dashboard/docker-compose.yml` on the VPS (currently `cat > ~/etheos-dashboard/docker-compose.yml << COMPOSE_EOF`). Replace its body with:

```yaml
services:
  etheos-dashboard:
    image: ${IMAGE}
    container_name: etheos-dashboard
    restart: unless-stopped
    environment:
      - ETHEOS_API_URL=${ETHEOS_API_URL}
      - ETHEOS_API_KEY=${ETHEOS_API_KEY}
    networks:
      - web
    volumes:
      - etheos-dashboard-backups:/data/backups
networks:
  web:
    external: true
volumes:
  etheos-dashboard-backups:
```

(Keep the surrounding `cat > ... << COMPOSE_EOF` … `COMPOSE_EOF` markers and the `cd ~/etheos-dashboard && docker compose pull && docker compose up -d --force-recreate` lines that follow.)

- [ ] **Step 2: Smoke-check by rendering the script's heredoc locally**

Run:
```bash
sh -n deploy.sh        # syntax check only, doesn't execute
grep -A 20 'COMPOSE_EOF' deploy.sh | head -25
```
Expected: `sh -n` produces no errors; the grep shows the new `volumes:` block under the service and the top-level `volumes:` declaration.

- [ ] **Step 3: Commit**

```bash
git add deploy.sh
git commit -m "build(deploy): add backups volume to remote compose template"
```

---

## Task 21: Frontend — replace `src/utils/backups.js` with HTTP transport

**Files:**
- Replace contents of: `src/utils/backups.js`

- [ ] **Step 1: Replace the file**

Replace the entire contents of `src/utils/backups.js` with:

```js
// Backup history transport. Talks to the dashboard sidecar via /local-api/backups/*.
// The sidecar persists records on a Docker volume so history is shared across
// users and survives container redeploys.
//
// Exports keep the same names that files.js was using when this was IndexedDB-backed,
// so the migration to the server is a small change at the call site.

const BASE = '/local-api/backups';

async function jsonOrThrow(res) {
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error || ''; } catch {}
    throw new Error(`HTTP ${res.status}${detail ? ': ' + detail : ''}`);
  }
  return res.json();
}

/** Save a backup snapshot. Returns the new record id. */
export async function saveBackup(path, content, username) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content, username }),
  });
  const out = await jsonOrThrow(res);
  return out.id;
}

/** List backups for a path, newest first. */
export async function listBackups(path) {
  const res = await fetch(`${BASE}?path=${encodeURIComponent(path)}`);
  const out = await jsonOrThrow(res);
  return out.backups;
}

/** Fetch a single backup record by id (path is required for O(1) lookup). */
export async function getBackup(id, path) {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}?path=${encodeURIComponent(path)}`);
  return jsonOrThrow(res);
}
```

- [ ] **Step 2: Verify the file builds cleanly with the rest of the app**

Run: `npm run build`
Expected: build succeeds with no errors. Vite warns nothing about the file.

- [ ] **Step 3: Commit**

```bash
git add src/utils/backups.js
git commit -m "feat(frontend): switch backups.js to /local-api transport"
```

---

## Task 22: Frontend — `files.js` username pass-through and history rendering

**Files:**
- Modify: `src/tabs/files.js`

- [ ] **Step 1: Add `getUsername` to the api import**

In `src/tabs/files.js`, change line 1 from:
```js
import { api } from '../api.js';
```
to:
```js
import { api, getUsername } from '../api.js';
```

- [ ] **Step 2: Pass `getUsername()` into `saveBackup`**

In `saveCurrentFile()`, change the call from:
```js
      await saveBackup(currentFilePath, pre.content);
```
to:
```js
      await saveBackup(currentFilePath, pre.content, getUsername());
```

- [ ] **Step 3: Render the username in each history row**

In `renderHistoryPanel()`, inside the `for (const b of backups)` loop, change:
```js
    html += '<div class="file-history-meta">';
    html += '<span class="file-history-when">' + esc(when) + '</span>';
    html += '<span class="file-history-size">' + b.size + ' bytes</span>';
    html += '</div>';
```
to:
```js
    const who = b.username ? esc(b.username) : 'unknown';
    html += '<div class="file-history-meta">';
    html += '<span class="file-history-when">' + esc(when) + '</span>';
    html += '<span class="file-history-who">by ' + who + '</span>';
    html += '<span class="file-history-size">' + b.size + ' bytes</span>';
    html += '</div>';
```

- [ ] **Step 4: Pass `path` through to `getBackup`**

The current click handler is:
```js
  panel.querySelectorAll('.file-history-restore').forEach(btn => {
    btn.addEventListener('click', () => restoreBackup(parseInt(btn.dataset.id, 10)));
  });
```

Two changes:

1. The new ids are strings (e.g. `0000000001_2026-04-27T17-20-00-000Z`), not integers. Drop the `parseInt`.
2. Capture `currentFilePath` at the time of the render so the closure holds the right path:

Replace the loop body with:
```js
    btn.addEventListener('click', () => restoreBackup(btn.dataset.id, currentFilePath));
```

Then change `restoreBackup`:
```js
async function restoreBackup(id) {
  const editor = document.getElementById('fileEditor');
  if (!editor) {
    showToast('Open a file first', 'error');
    return;
  }
  const rec = await getBackup(id);
```
to:
```js
async function restoreBackup(id, path) {
  const editor = document.getElementById('fileEditor');
  if (!editor) {
    showToast('Open a file first', 'error');
    return;
  }
  const rec = await getBackup(id, path);
```

Also update the history row markup that holds the id. The current row uses `data-id="' + b.id + '"` and the restore button uses the same; both should keep the string id (no parseInt anywhere). Verify the relevant lines look like:

```js
    html += '<li class="file-history-item" data-id="' + esc(b.id) + '">';
    ...
    html += '<button class="file-history-restore" data-id="' + esc(b.id) + '">Restore into editor</button>';
```

(Use `esc(b.id)` since id is now a string with characters that should be HTML-attribute-safe; the existing `esc` helper handles this.)

- [ ] **Step 5: Add a tiny CSS rule for the new `.file-history-who` element**

In `src/style.css`, find the `.file-history-when` selector (or similar) — there should be styling for the existing meta elements. Append a sibling rule:

```css
.file-history-who {
  color: var(--text-secondary);
  font-size: .85rem;
}
```

If `--text-secondary` doesn't exist, fall back to the value used by `.file-history-when` in the same area (just match its color).

- [ ] **Step 6: Build to verify nothing is broken**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/tabs/files.js src/style.css
git commit -m "feat(frontend): show username in file history and pass path to restore"
```

---

## Task 23: End-to-end smoke test through the full stack

**Files:** none (verification only)

This task does no code writing — it exercises the spec's testing plan against a full local build.

- [ ] **Step 1: Build the image and bring up the stack**

Run:
```bash
docker build --platform linux/amd64 -t ghcr.io/connor93/etheos-dashboard:latest .
docker compose up -d
```

Note: the production-style stack proxies `/api/*` to a real etheos server. For local smoke testing of just the backups feature, point `ETHEOS_API_URL` at any reachable target (or a non-existent one — the backups feature itself doesn't depend on `/api/*`). Open the dashboard at the configured port and log in if your local etheos is reachable; otherwise drive the sidecar directly via curl in the next step.

- [ ] **Step 2: Drive the API directly to verify retention and dedup**

Run (replace the port if you've changed it):
```bash
PORT=18080
PATHQ=$(printf '%s' 'config/admin.ini' | python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.stdin.read(), safe=""))')

# 22 distinct contents
for i in $(seq 1 22); do
  curl -fsS -X POST "http://127.0.0.1:$PORT/local-api/backups" \
    -H 'Content-Type: application/json' \
    -d "{\"path\":\"config/admin.ini\",\"content\":\"v$i\",\"username\":\"alice\"}" >/dev/null
done

# Two identical writes (dedup)
curl -fsS -X POST "http://127.0.0.1:$PORT/local-api/backups" \
  -H 'Content-Type: application/json' \
  -d '{"path":"config/admin.ini","content":"dedup","username":"bob"}'
curl -fsS -X POST "http://127.0.0.1:$PORT/local-api/backups" \
  -H 'Content-Type: application/json' \
  -d '{"path":"config/admin.ini","content":"dedup","username":"bob"}'

curl -fsS "http://127.0.0.1:$PORT/local-api/backups?path=$PATHQ" | python3 -m json.tool
```

Expected: the listing shows exactly 20 entries, newest first, ending with the `dedup` entry. The dedup write returned the same id as its predecessor.

- [ ] **Step 3: Verify volume persistence across `down && up`**

Run:
```bash
docker compose down
docker compose up -d
sleep 2
curl -fsS "http://127.0.0.1:$PORT/local-api/backups?path=$PATHQ" | python3 -m json.tool | head -40
```
Expected: same 20 entries are still there.

- [ ] **Step 4: Verify save-still-works when the sidecar is killed**

Run:
```bash
docker compose exec etheos-dashboard pkill node
sleep 1
docker compose exec etheos-dashboard pgrep -a node || echo 'sidecar is down (expected)'
docker compose exec etheos-dashboard pgrep -a nginx
curl -fsS -X POST "http://127.0.0.1:$PORT/local-api/backups" \
  -H 'Content-Type: application/json' \
  -d '{"path":"config/admin.ini","content":"oops","username":"alice"}' \
  -o /dev/null -w '%{http_code}\n'
```
Expected: nginx is still alive; the POST returns `502` or similar. (In the real dashboard UI this surfaces as a "backup failed" toast; the actual file save through `/api/*` is unaffected because it doesn't touch the sidecar.)

- [ ] **Step 5: Drive through the dashboard UI (if the local etheos is reachable)**

If `ETHEOS_API_URL` points at a real etheos instance:

1. Open the dashboard, log in, go to Files.
2. Open `config/admin.ini`, change a character, click Save, confirm.
3. Click History — the new row appears with "by `<your-username>`".
4. Edit again, save again, verify a second row appears.
5. Click Restore — editor populates with the older content.

If a real etheos isn't available locally, mark this step as deferred to first deploy.

- [ ] **Step 6: Tear down**

Run: `docker compose down`

- [ ] **Step 7: Commit a tiny note (optional)**

If anything in this verification surfaced a bug requiring a fix, commit the fix. Otherwise no commit is needed for this task.

---

## Self-Review

Cross-checked the plan against the spec:

- **Storage layout** (spec §"Storage layout"): Tasks 2 (pathHash/dirFor), 5 (write + path file), 8 (list), 9 (get).
- **Filename format `<seq>_<iso>`** (spec): Task 5 implements `pad10` + `isoFsSafe`.
- **Atomic rename** (spec): Task 5.
- **Stale `.tmp` cleanup** (spec): Task 10.
- **Dedup on equal SHA** (spec §"Dedup"): Task 6.
- **Retention 20** (spec §"Retention"): Task 7.
- **API contract POST/GET/GET-by-id** (spec §"API contract"): Tasks 11, 12, 13.
- **400 on missing path / username / content** (spec): Tasks 11, 12, 13.
- **404 on missing id** (spec): Task 13.
- **Per-path concurrency** (spec §"Failure modes" — "Two simultaneous saves of the same file"): Task 14.
- **Auth model: trusted, localhost-only** (spec): Task 15 binds `127.0.0.1` by default; Task 18 nginx proxies via `127.0.0.1:3001`.
- **Frontend: replace IndexedDB internals, keep exported names** (spec §"Frontend changes"): Task 21.
- **Frontend: pass username, render username, restore takes path** (spec): Task 22.
- **Dockerfile: install nodejs, copy sidecar** (spec §"Dockerfile"): Task 16.
- **Entrypoint launches sidecar in background, then exec nginx** (spec): Task 17.
- **nginx /local-api/ block with 1m client_body_buffer_size** (spec §"Nginx config"): Task 18.
- **docker-compose.yml + deploy.sh add named volume** (spec §"Container & deploy changes"): Tasks 19, 20.
- **Smoke tests from the spec's testing plan**: Task 23 covers all five spec items (write→appear, history shows username, restore, dedup, 22-saves-leave-20, restart persists, sidecar-down behavior).

No placeholders. Type/name consistency: `pathHash`, `dirFor`, `validatePath`, `nextSequence`, `writeBackup`, `listBackups`, `getBackup`, `cleanupTmp`, `enforceRetention`, `newestRecord`, `handleRequest`, `withPathLock`, `startServer` — all defined where first used. Frontend exports `saveBackup(path, content, username)`, `listBackups(path)`, `getBackup(id, path)` match the new sidecar API.
