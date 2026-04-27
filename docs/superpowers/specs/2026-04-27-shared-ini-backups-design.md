# Shared INI File Backups — Design

**Date:** 2026-04-27
**Status:** Approved (pending spec review)

## Problem

The dashboard currently snapshots INI/file edits to IndexedDB before each save (see `src/utils/backups.js`). This is per-browser: only the user who made the edit can see their own history, and history is lost when their browser cache is cleared. We want a shared edit history visible to every dashboard user, retained across container redeploys, capped at the most recent 20 versions per file, and stamped with the username of the person who saved it.

## Constraints

- No changes to the etheos game server (avoid another server restart).
- All work stays in the `etheos-dashboard` repo.
- Survives `docker compose pull && up -d --force-recreate`.
- Single-deploy story — same `./deploy.sh` flow.

## Architecture

Single dashboard container, two processes:

```
┌────────────────────────── etheos-dashboard container ──────────────────────────┐
│                                                                                │
│  nginx (port 80, public)                                                       │
│    /api/*         ─────────────────────────────►  etheos game server           │
│    /local-api/*   ─────►  Node sidecar (127.0.0.1:3001)                        │
│    everything else: SPA                                                        │
│                                                                                │
│  Node sidecar (bound to 127.0.0.1 only — not externally reachable)             │
│    reads/writes /data/backups                                                  │
│                                                                                │
│  Volume: /data/backups  ←─ named volume `etheos-dashboard-backups`             │
└────────────────────────────────────────────────────────────────────────────────┘
```

- Runtime image (`nginx:alpine`) gains `nodejs` via `apk add`. Build stage already uses Node, so no new toolchain is introduced — just an extra ~40MB in the final image.
- Sidecar is a single ~150 LOC file using only Node's built-in modules (`http`, `fs/promises`, `crypto`). No npm dependencies in the runtime stage; nothing to `npm install`.
- Sidecar binds to `127.0.0.1:3001`. Nothing outside the container can reach it — only nginx.
- Entrypoint launches the sidecar as a background child, then `exec nginx`. If the sidecar crashes, nginx (and the container) stay up; POSTs to `/local-api/*` start failing, which the frontend surfaces as a toast warning. Saves themselves continue to work — they go through `/api/*` to etheos and are unaffected.

### Auth model

None at the sidecar layer. The sidecar binds to localhost so the only path in is via nginx, and any client reaching nginx already has dashboard access. The username is sent in the request body and trusted; spoofing it would only mislabel a backup row, not exfiltrate or modify game data (those still go through etheos's bearer-token-protected `/api/*`).

## Storage layout

```
/data/backups/
  <sha1(path)[:16]>/                        # one directory per file path
    path                                    # text file: original path, for debugging
    0000000001_2026-04-27T17-20-00-000Z.json
    0000000002_2026-04-27T17-25-13-841Z.json
    ...
```

- The directory name is the first 16 hex chars of `sha1(path)`. Avoids problems with `/` in paths like `config/admin.ini` and is collision-safe at our scale (~hundreds of files at most).
- A sibling `path` text file holds the original path, for human inspection and to support rebuilding the index by scan if ever needed.
- Backup filenames are `<10-digit-zero-padded-sequence>_<iso-timestamp-with-dashes>.json`. Sortable lexicographically → directory listing is the index, no separate state. Sequence handles same-millisecond saves; the ISO timestamp uses `-` instead of `:` so it is filesystem-safe.

### Backup record JSON

```json
{
  "id": "0000000002_2026-04-27T17-25-13-841Z",
  "path": "config/admin.ini",
  "ts": 1745773513841,
  "username": "alice",
  "size": 4321,
  "sha": "abc123...",
  "content": "..."
}
```

### Atomicity

Each backup is written to `<id>.json.tmp` and then `rename()`d into place. POSIX `rename` is atomic on the same filesystem, so a crash mid-write leaves at most a stray `.tmp` file. The list endpoint ignores `.tmp` files; the next write opportunistically deletes any stale ones it finds.

### Retention

After a successful insert, the sidecar lists the directory, sorts by sequence number, and deletes everything beyond the newest 20. No global byte cap for v1 — at 100KB × 20 versions × 50 files ≈ 100MB, we have headroom. Revisit if it ever balloons.

### Dedup

If the most recent existing backup for the path has the same SHA as the incoming content, the sidecar returns the existing id without writing a new file. Matches the current IndexedDB behavior — no point burning storage on identical successive saves.

## API contract (sidecar)

All paths under `/local-api/backups/...` from the browser. Nginx strips `/local-api`, so the sidecar sees `/backups/...`.

### `POST /backups`
Record a snapshot.

```
Request:  { "path": "config/admin.ini", "username": "alice", "content": "..." }
Response: 200 { "id": "0000000002_2026-04-27T17-25-13-841Z", "ts": 1745773513841 }
          400 { "error": "missing path" | "missing content" | "missing username" }
          500 { "error": "..." }
```

Side effects: write the JSON, run retention, return the id. Dedup: if the previous backup for this path has the same SHA, return the existing id and skip the write.

### `GET /backups?path=<urlencoded>`
List newest-first, max 20.

```
Response: 200 { "backups": [
  { "id": "...", "ts": 1745773513841, "username": "alice", "size": 4321, "sha": "abc..." },
  ...
]}
```

Reads only the metadata fields from each record (the sidecar uses a streaming JSON parser or simply reads a metadata-only header — see Implementation Notes), so listing is cheap even with 20 large records.

### `GET /backups/<id>?path=<urlencoded>`
Fetch one full record.

```
Response: 200 { "id": "...", "path": "...", "ts": ..., "username": "...", "size": ..., "sha": "...", "content": "..." }
          400 { "error": "missing path" }
          404 { "error": "not found" }
```

The `path` query parameter lets the sidecar locate the directory in O(1). Without it, finding the id requires scanning every directory; we make `path` required for v1 and reject the request with 400 if it's missing.

### No DELETE endpoint
Retention handles cleanup automatically. Users don't need manual purge. YAGNI.

## Frontend changes

Replace the internals of `src/utils/backups.js` with HTTP calls to `/local-api/backups/...`. Keep the same exported names so call sites barely change:

- `saveBackup(path, content, username)` → `POST /local-api/backups`
- `listBackups(path)` → `GET /local-api/backups?path=...`
- `getBackup(id, path)` → `GET /local-api/backups/<id>?path=<path>`

`files.js` changes:

1. `saveCurrentFile()` already calls `saveBackup(currentFilePath, pre.content)` with the pre-save content. Add `getUsername()` as a third argument.
2. The existing "backup failed (continuing save)" toast path stays — same behavior, just a different transport underneath.
3. `restoreBackup(id)` becomes `restoreBackup(id, path)` so we can pass the current path through to `getBackup` for O(1) lookup.
4. The history panel renders an extra "by `<username>`" element on each row.

Drop the IndexedDB code entirely. Single source of truth from now on. The shared store provides the same "recover from a bad save" safety as the IndexedDB version did (it still snapshots the pre-save on-disk content), with the added benefit of being shared and persistent.

## Nginx config

Add to `nginx.conf`:

```nginx
location /local-api/ {
    proxy_pass http://127.0.0.1:3001/;
    proxy_set_header Host $host;
    client_body_buffer_size 1m;     # same INI-safety reason as the /api/ block
    proxy_read_timeout 30s;
}
```

The `client_body_buffer_size 1m` mirrors the existing `/api/` block — INI saves can exceed nginx's default 16KB body buffer, and we want them held in memory rather than spooled to disk where the truncation bug bit us once before.

## Container & deploy changes

### `Dockerfile` (runtime stage)

```dockerfile
FROM nginx:alpine
RUN apk add --no-cache nodejs
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY backups-server.js /app/backups-server.js
COPY docker-entrypoint.sh /docker-entrypoint-custom.sh
RUN chmod +x /docker-entrypoint-custom.sh
EXPOSE 80
CMD ["/docker-entrypoint-custom.sh"]
```

### `docker-entrypoint.sh`

Existing script templates the nginx config at startup. Add the sidecar launch:

```sh
# (existing nginx config templating goes here)

# Ensure the volume directory exists and is writable
mkdir -p /data/backups

# Launch sidecar in the background; if it dies the container stays up
node /app/backups-server.js &

exec nginx -g 'daemon off;'
```

### `docker-compose.yml` (local)

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

### `deploy.sh`

The remote `docker-compose.yml` heredoc gets the same `volumes:` block and top-level `volumes:` declaration. The volume persists across `pull && up -d --force-recreate` because Docker Compose only recreates volumes that are explicitly removed.

## Failure modes

| Scenario | Behavior |
|---|---|
| Sidecar dies after startup | Nginx and container stay up. `POST /local-api/backups` returns 502. Frontend toasts "Backup failed (continuing save)" — main save still proceeds via `/api/*`. |
| Volume not mounted | Sidecar starts but every write fails. Same surface behavior as above (5xx from sidecar, toast on frontend). The first sidecar write attempt logs a clear error so the operator can spot it. |
| Crash during write | Atomic rename means at most one stray `.tmp` file. Cleaned up opportunistically by the next write. |
| Two simultaneous saves of the same file | Each gets its own sequence number from a per-directory counter (sequence = max existing seq + 1, computed inside an in-process mutex per path). Both backups land. |
| User clears browser cache | No effect — backups live on the server volume. |

## Testing plan

Manual smoke tests after `docker compose up` locally:

1. Save a file through the dashboard. Verify a JSON appears under `/data/backups/<hash>/` (via `docker compose exec`).
2. Open the History panel; the entry shows the timestamp, size, and "by `<username>`".
3. Click Restore — editor populates with the old content.
4. Save the same file twice with no edits → verify only one record exists (dedup).
5. Save 22 times with distinct content → verify exactly 20 records remain.
6. Run `docker compose down && docker compose up` → verify history still appears.
7. `docker compose exec etheos-dashboard pkill node` to kill the sidecar mid-session → verify the dashboard save still succeeds and a "backup failed" toast appears.

## Implementation notes

- Per-directory sequence counter: read the directory, find the max numeric prefix among existing files, add 1. Wrap the read-then-write in an in-process `Map<path, Promise>` mutex chain so two concurrent POSTs for the same path serialize. Cross-process concurrency isn't a concern (single sidecar process).
- Listing without loading content: rather than streaming JSON, the simplest correct approach is to read each file fully (max 20 × ~hundreds-of-KB = a few MB) and pick metadata fields. Optimize only if listing latency becomes visible.
- Path validation: reject paths containing `..`, leading `/`, or null bytes. The actual file write is safe (we hash the path), but storing garbage paths in the JSON is pointless.

## Out of scope (v1)

- Manual delete / "purge history" UI.
- Diff view between backup versions.
- Global byte cap across all paths.
- Importing existing IndexedDB history into the new store.
- Backup deduplication across files (content-addressable storage).
