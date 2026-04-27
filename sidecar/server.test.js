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
