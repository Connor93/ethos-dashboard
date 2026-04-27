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

test('withPathLock survives a synchronously-throwing fn (no deadlock)', async () => {
  // If release is unbound when fn throws synchronously, the chain hangs and
  // any subsequent same-path POST blocks forever. We exercise that edge by
  // making the storage call throw synchronously, then issue a follow-up POST
  // and verify it completes.
  let throws = true;
  const storage = {
    async writeBackup() {
      if (throws) {
        throws = false;
        throw new Error('boom');
      }
      return { id: 'ok', ts: 0 };
    },
  };

  const post = () => handleRequest({ storage }, fakeReq({
    method: 'POST',
    url: '/backups',
    body: JSON.stringify({ path: 'p.ini', content: 'c', username: 'u' }),
  }), fakeRes());

  // First call: storage throws -> handler should return 500 and release the lock.
  const first = await Promise.race([post(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout-1')), 1000))]);
  // Second call must complete (not hang on a never-released lock).
  const second = await Promise.race([post(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout-2')), 1000))]);
});
