# etheos-dashboard — Agent Instructions

## Overview

**etheos-dashboard** is a lightweight admin dashboard for the **etheos** game server. It provides a browser-based interface for server management and monitoring.

## Tech Stack

- **Language**: Vanilla JavaScript (ES modules)
- **Bundler**: Vite
- **Package Manager**: npm
- **Deployment**: Docker (nginx), served via Traefik

## Project Structure

```
src/
├── main.js          # App entry point, routing, auth flow
├── api.js           # API client (fetch wrapper with auth, retry, queue)
├── style.css        # All styles
├── tabs/            # Tab modules (one JS file per tab)
│   ├── overview.js       # Server overview / stats
│   ├── player-logs.js    # Player activity logs
│   ├── chat.js           # Chat monitoring
│   ├── commands.js       # Remote server commands
│   ├── audit.js          # Admin audit trail
│   ├── bans.js           # Ban management
│   ├── guilds.js         # Guild management
│   ├── reports.js        # Player reports
│   ├── files.js          # Server file management
│   ├── material-trader.js # Material trader config
│   └── config.js         # Server config
└── utils/           # Shared utilities (toast notifications, etc.)
```

## Key Patterns

### API Communication
All API calls go through `src/api.js` which provides:
- **Serialized request queue** (prevents race conditions)
- **Bearer token auth** (stored in localStorage)
- **Retry with exponential backoff** (3 retries, 300ms base delay)
- **Auto-logout** on 401 responses
- **Connection stability detection** (warns after 3 consecutive failures)

API calls hit `/api/*` paths which nginx reverse-proxies to the etheos server.

### Tab Architecture
Each tab is a self-contained JS module in `src/tabs/`. Tabs are loaded dynamically and render into the main content area. Each tab exports an `init()` or `render()` function.

## Local Development

```bash
# Install dependencies
npm install

# Start Vite dev server (proxies /api to localhost:8081)
npm run dev
```

The Vite dev server proxies `/api` requests to `http://localhost:8081` (configurable via `VITE_API_URL` env var), so you need the etheos server running locally or port-forwarded.

## Production

- **URL**: `dashboard.calamity-online.cloud`
- **Deploy**: `./deploy.sh` (builds Docker image → pushes to GHCR → VPS pulls and recreates)
- **API proxy**: nginx inside the container reverse-proxies `/api` to the etheos server URL (templated at deploy time)

## Related Projects

- **etheos** (`../etheos/`): The game server whose REST API this dashboard consumes
- **em-web-client** (`../em-web-client/`): The browser game client (separate project)
