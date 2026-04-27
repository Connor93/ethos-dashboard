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
