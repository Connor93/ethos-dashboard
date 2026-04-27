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
