# Development Notes

## Architecture

### Tab-Based UI

The dashboard uses a tab-based single-page architecture. Each tab is a self-contained JavaScript module in `src/tabs/` that handles its own rendering and data fetching.

Available tabs:
| Tab | File | Description |
|---|---|---|
| Overview | `overview.js` | Server stats, online players, real-time monitoring |
| Player Logs | `player-logs.js` | Filterable player activity logs |
| Chat | `chat.js` | Chat message monitoring |
| Commands | `commands.js` | Remote server command execution |
| Audit | `audit.js` | Admin action audit trail |
| Bans | `bans.js` | Ban management |
| Guilds | `guilds.js` | Guild administration |
| Reports | `reports.js` | Player report handling |
| Files | `files.js` | Server file browser/editor |
| Material Trader | `material-trader.js` | Material trader NPC configuration |
| Config | `config.js` | Server settings |

### API Client (`src/api.js`)

All API communication uses a centralized client with:
- **Request serialization** — queued to prevent race conditions
- **Bearer token auth** — stored in `localStorage`
- **Retry + backoff** — 3 retries, exponential backoff from 300ms
- **Auto-logout** — redirects to login on 401
- **Connection monitoring** — toasts on repeated failures / recovery

Requests go to `/api/*` paths, which are reverse-proxied to the etheos game server.

---

## Local Development

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- etheos server running locally (or SSH tunnel to VPS)

### Setup

```bash
# Install dependencies
npm install

# Start Vite dev server
npm run dev
```

The dev server starts on `http://localhost:5173` and proxies `/api` requests to `http://localhost:8081` (the etheos server).

### Pointing to a Different API

Set the `VITE_API_URL` environment variable:

```bash
VITE_API_URL=http://localhost:9090 npm run dev
```

Or SSH tunnel to the production server:

```bash
ssh -p 2222 -L 8081:localhost:8078 root@76.13.119.40
```

---

## Deployment

### Quick Deploy

```bash
./deploy.sh
```

This script:
1. Builds a Docker image locally
2. Pushes to GitHub Container Registry (GHCR)
3. SSHs into the VPS and pulls + recreates the container
4. Templates nginx config with the production API URL and key

### Configuration

Copy `.env.deploy.example` to `.env.deploy` and fill in:
- `VPS_HOST` / `VPS_USER` — SSH target
- `GHCR_USER` / `GHCR_PAT` — Container registry credentials
- `ETHEOS_API_URL` — Production etheos API URL
- `ETHEOS_API_KEY` — API authentication key

### Container Architecture

The Docker image contains:
- **Nginx** — serves static Vite build from `/usr/share/nginx/html` on port 80
- **nginx.conf** — reverse-proxies `/api` to the etheos server (URL templated at deploy time)
- **Traefik** — handles TLS and routes `dashboard.calamity-online.cloud` to the container

### Production URLs

- **Dashboard**: `https://dashboard.calamity-online.cloud`
- **API**: Proxied through nginx to the etheos server
