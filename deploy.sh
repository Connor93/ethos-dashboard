#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────
# Etheos Dashboard — Local Deploy Script
# Replaces the GHA workflow: builds locally, pushes to GHCR,
# and deploys to the Hostinger VPS via SSH.
# ─────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env.deploy"

# Load config
if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ Missing $ENV_FILE — copy .env.deploy.example and fill in your values"
  exit 1
fi
source "$ENV_FILE"

# Validate required vars
for var in VPS_HOST VPS_USER GHCR_USER GHCR_PAT ETHEOS_API_URL ETHEOS_API_KEY; do
  if [[ -z "${!var:-}" ]]; then
    echo "❌ $var is not set in $ENV_FILE"
    exit 1
  fi
done

IMAGE="ghcr.io/${GHCR_USER}/etheos-dashboard:latest"
DASHBOARD_DOMAIN="${DASHBOARD_DOMAIN:-dashboard.calamity-online.cloud}"
SSH_PORT="${SSH_PORT:-2222}"

echo "═══════════════════════════════════════════"
echo " Etheos Dashboard Deploy"
echo "═══════════════════════════════════════════"
echo " Image:  $IMAGE"
echo " VPS:    $VPS_USER@$VPS_HOST"
echo " Domain: $DASHBOARD_DOMAIN"
echo " API:    $ETHEOS_API_URL"
echo "═══════════════════════════════════════════"
echo ""

# ── Step 1: Build ──────────────────────────────────────────
echo "📦 Building Docker image..."
docker build --platform linux/amd64 -t "$IMAGE" "$SCRIPT_DIR"
echo ""

# ── Step 2: Push to GHCR ──────────────────────────────────
echo "🚀 Pushing to GHCR..."
echo "$GHCR_PAT" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
docker push "$IMAGE"
echo ""

# ── Step 3: Deploy to VPS ─────────────────────────────────
echo "🔧 Deploying to $VPS_HOST..."

ssh -p "${SSH_PORT}" "${VPS_USER}@${VPS_HOST}" bash -s -- \
  "$IMAGE" "$GHCR_USER" "$GHCR_PAT" "$ETHEOS_API_URL" "$ETHEOS_API_KEY" "$DASHBOARD_DOMAIN" \
  <<'REMOTE_SCRIPT'
set -euo pipefail

IMAGE="$1"
GHCR_USER="$2"
GHCR_PAT="$3"
ETHEOS_API_URL="$4"
ETHEOS_API_KEY="$5"
DASHBOARD_DOMAIN="$6"

# Login to GHCR
echo "$GHCR_PAT" | docker login ghcr.io -u "$GHCR_USER" --password-stdin

# Ensure Traefik dynamic router config exists
mkdir -p ~/traefik/dynamic
cat > ~/traefik/dynamic/etheos-dashboard.yml << TRAEFIK_EOF
http:
  routers:
    etheos-dashboard:
      rule: "Host(\`${DASHBOARD_DOMAIN}\`)"
      service: etheos-dashboard
      entryPoints:
        - websecure
      tls:
        certResolver: letsencrypt
  services:
    etheos-dashboard:
      loadBalancer:
        servers:
          - url: "http://etheos-dashboard:80"
TRAEFIK_EOF

# Create/update docker-compose
mkdir -p ~/etheos-dashboard
cat > ~/etheos-dashboard/docker-compose.yml << COMPOSE_EOF
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
COMPOSE_EOF

# Pull and recreate
cd ~/etheos-dashboard
docker compose pull
docker compose up -d --force-recreate

echo ""
echo "✅ Etheos Dashboard deployed to https://${DASHBOARD_DOMAIN}"
REMOTE_SCRIPT

echo ""
echo "✅ Done! Visit https://$DASHBOARD_DOMAIN"
