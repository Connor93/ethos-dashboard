// IndexedDB-backed file backups. Snapshots the on-disk version of a file
// before a save attempt so the user can revert if a save corrupts the file.
//
// Schema: store "backups", keyPath "id" (auto-increment), index "by_path".
// Each record: { id, path, content, size, sha, ts }.
//
// Retention: last MAX_PER_PATH versions per file path, capped at MAX_TOTAL_BYTES
// across the whole store (LRU eviction by ts).

const DB_NAME = 'etheos-dashboard';
const DB_VERSION = 1;
const STORE = 'backups';
const MAX_PER_PATH = 10;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('by_path', 'path', { unique: false });
        store.createIndex('by_ts', 'ts', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function sha1(text) {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-1', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function tx(db, mode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Save a backup snapshot. Returns the new record id. */
export async function saveBackup(path, content) {
  const db = await openDb();
  const sha = await sha1(content);

  // Skip if the most recent backup for this path is identical (no point
  // burning storage on duplicates if the user saves twice with no change).
  const recent = await listBackups(path, 1);
  if (recent.length && recent[0].sha === sha) return recent[0].id;

  const record = { path, content, size: content.length, sha, ts: Date.now() };
  const id = await reqToPromise(tx(db, 'readwrite').add(record));
  await enforceRetention(path);
  return id;
}

/** List backups for a path, newest first. Limit is optional. */
export async function listBackups(path, limit = MAX_PER_PATH) {
  const db = await openDb();
  const idx = tx(db, 'readonly').index('by_path');
  const out = [];
  return new Promise((resolve, reject) => {
    const req = idx.openCursor(IDBKeyRange.only(path), 'prev');
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur || out.length >= limit) { resolve(out); return; }
      // The by_path index isn't ordered by ts within a path key, so collect
      // all then sort. limit is applied after sort below.
      out.push(cur.value);
      cur.continue();
    };
    req.onerror = () => reject(req.error);
  }).then(rows => rows.sort((a, b) => b.ts - a.ts).slice(0, limit));
}

/** Fetch a single backup record by id. */
export async function getBackup(id) {
  const db = await openDb();
  return reqToPromise(tx(db, 'readonly').get(id));
}

/** Delete a single backup by id. */
export async function deleteBackup(id) {
  const db = await openDb();
  await reqToPromise(tx(db, 'readwrite').delete(id));
}

async function enforceRetention(path) {
  const db = await openDb();

  // Per-path cap: drop oldest beyond MAX_PER_PATH.
  const all = await listBackups(path, Number.MAX_SAFE_INTEGER);
  if (all.length > MAX_PER_PATH) {
    const store = tx(db, 'readwrite');
    for (const rec of all.slice(MAX_PER_PATH)) {
      store.delete(rec.id);
    }
  }

  // Global byte cap: drop oldest across all paths until under cap.
  const everything = await new Promise((resolve, reject) => {
    const out = [];
    const req = tx(db, 'readonly').openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) { resolve(out); return; }
      out.push(cur.value);
      cur.continue();
    };
    req.onerror = () => reject(req.error);
  });
  let totalBytes = everything.reduce((s, r) => s + (r.size || 0), 0);
  if (totalBytes > MAX_TOTAL_BYTES) {
    const store = tx(db, 'readwrite');
    const sorted = [...everything].sort((a, b) => a.ts - b.ts);
    for (const rec of sorted) {
      if (totalBytes <= MAX_TOTAL_BYTES) break;
      store.delete(rec.id);
      totalBytes -= rec.size || 0;
    }
  }
}
