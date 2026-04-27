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
