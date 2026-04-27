#!/bin/sh
# Template the nginx config with environment variables then start nginx
sed -i "s|ETHEOS_API_URL|${ETHEOS_API_URL}|g" /etc/nginx/conf.d/default.conf
sed -i "s|ETHEOS_API_KEY|${ETHEOS_API_KEY}|g" /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'
