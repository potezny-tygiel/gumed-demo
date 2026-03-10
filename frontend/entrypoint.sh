#!/bin/sh
set -e

# Default to the in-cluster service name
API_UPSTREAM="${API_UPSTREAM:-api:8000}"

# Extract the cluster DNS server from /etc/resolv.conf (set by kubelet)
KUBE_DNS=$(awk '/^nameserver/{print $2; exit}' /etc/resolv.conf)
KUBE_DNS="${KUBE_DNS:-10.43.0.10}"

echo "▶ Configuring API upstream → ${API_UPSTREAM}"
echo "▶ Cluster DNS resolver   → ${KUBE_DNS}"

sed -i "s|API_UPSTREAM|${API_UPSTREAM}|g" /etc/nginx/conf.d/default.conf
sed -i "s|KUBE_DNS_IP|${KUBE_DNS}|g"     /etc/nginx/conf.d/default.conf

exec nginx -g "daemon off;"
