#!/bin/sh
set -e

# Default to the in-cluster service name
API_UPSTREAM="${API_UPSTREAM:-api:8000}"

echo "▶ Configuring API upstream → ${API_UPSTREAM}"
sed -i "s|API_UPSTREAM|${API_UPSTREAM}|g" /etc/nginx/conf.d/default.conf

exec nginx -g "daemon off;"
