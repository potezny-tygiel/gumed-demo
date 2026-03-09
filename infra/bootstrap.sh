#!/usr/bin/env bash
# =============================================================================
# VPS Bootstrap Script
# Installs K3s, Helm, and prepares the node for the Medical Data Pipeline.
#
# Usage:
#   curl -sfL https://raw.githubusercontent.com/<owner>/<repo>/main/infra/bootstrap.sh | bash
#   or:
#   ssh user@vps 'bash -s' < infra/bootstrap.sh
# =============================================================================

set -euo pipefail

LOG_PREFIX="[medical-pipeline]"

log()  { echo "${LOG_PREFIX} $*"; }
err()  { echo "${LOG_PREFIX} ERROR: $*" >&2; }
die()  { err "$*"; exit 1; }

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
if [[ $EUID -ne 0 ]]; then
  die "This script must be run as root (or with sudo)"
fi

log "Starting VPS bootstrap..."

# ---------------------------------------------------------------------------
# 1. System packages
# ---------------------------------------------------------------------------
log "Updating system packages..."
apt-get update -qq
apt-get install -y -qq curl git open-iscsi nfs-common ufw fail2ban > /dev/null 2>&1

# ---------------------------------------------------------------------------
# 1b. Firewall (UFW)
# ---------------------------------------------------------------------------
log "Configuring firewall (UFW)..."
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh          # 22/tcp
ufw allow 80/tcp       # HTTP  (redirect → HTTPS)
ufw allow 443/tcp      # HTTPS
ufw allow 6443/tcp     # K3s API (restrict in production to your IP)
# Enable non-interactively
echo "y" | ufw enable
ufw status verbose
log "Firewall configured"

# ---------------------------------------------------------------------------
# 1c. fail2ban – brute-force SSH protection
# ---------------------------------------------------------------------------
log "Configuring fail2ban..."
cat > /etc/fail2ban/jail.local <<'F2B'
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled  = true
port     = ssh
backend  = systemd
F2B
systemctl enable fail2ban
systemctl restart fail2ban
log "fail2ban enabled (SSH jail active)"

# ---------------------------------------------------------------------------
# 1d. Kernel hardening (sysctl)
# ---------------------------------------------------------------------------
log "Applying kernel hardening..."
cat > /etc/sysctl.d/90-security.conf <<'SYSCTL'
# Disable IP source routing
net.ipv4.conf.all.accept_source_route = 0
net.ipv6.conf.all.accept_source_route = 0

# Disable ICMP redirects
net.ipv4.conf.all.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0

# Enable SYN flood protection
net.ipv4.tcp_syncookies = 1

# Log Martian packets
net.ipv4.conf.all.log_martians = 1

# Disable IP forwarding override (K3s needs this, keep default)
# net.ipv4.ip_forward is managed by K3s
SYSCTL
sysctl --system > /dev/null 2>&1
log "Kernel hardening applied"

# ---------------------------------------------------------------------------
# 1e. Automatic security updates
# ---------------------------------------------------------------------------
log "Enabling unattended security upgrades..."
apt-get install -y -qq unattended-upgrades > /dev/null 2>&1
dpkg-reconfigure -plow unattended-upgrades 2>/dev/null || true
log "Unattended upgrades enabled"

# ---------------------------------------------------------------------------
# 2. Install K3s
# ---------------------------------------------------------------------------
if command -v k3s &> /dev/null; then
  log "K3s is already installed: $(k3s --version | head -1)"
else
  log "Installing K3s..."
  curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--disable=traefik" sh -
  log "K3s installed: $(k3s --version | head -1)"
fi

# Wait for K3s to be ready
log "Waiting for K3s to be ready..."
until kubectl get nodes &> /dev/null; do
  sleep 2
done
kubectl wait --for=condition=Ready node --all --timeout=120s
log "K3s node is ready"

# ---------------------------------------------------------------------------
# 3. Set up kubeconfig for non-root user
# ---------------------------------------------------------------------------
REAL_USER="${SUDO_USER:-$USER}"
REAL_HOME=$(eval echo "~${REAL_USER}")

mkdir -p "${REAL_HOME}/.kube"
cp /etc/rancher/k3s/k3s.yaml "${REAL_HOME}/.kube/config"
chown "${REAL_USER}:${REAL_USER}" "${REAL_HOME}/.kube/config"
chmod 600 "${REAL_HOME}/.kube/config"

log "Kubeconfig written to ${REAL_HOME}/.kube/config"

# ---------------------------------------------------------------------------
# 4. Install Helm
# ---------------------------------------------------------------------------
if command -v helm &> /dev/null; then
  log "Helm is already installed: $(helm version --short)"
else
  log "Installing Helm..."
  curl -sfL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
  log "Helm installed: $(helm version --short)"
fi

# ---------------------------------------------------------------------------
# 5. Install NGINX Ingress Controller
# ---------------------------------------------------------------------------
if helm list -n ingress-nginx 2>/dev/null | grep -q ingress-nginx; then
  log "NGINX Ingress Controller is already installed"
else
  log "Installing NGINX Ingress Controller..."
  helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx --force-update
  helm repo update
  helm install ingress-nginx ingress-nginx/ingress-nginx \
    --namespace ingress-nginx --create-namespace \
    --set controller.hostPort.enabled=true \
    --set controller.service.type=ClusterIP \
    --wait --timeout=120s
  log "NGINX Ingress Controller installed"
fi

# ---------------------------------------------------------------------------
# 6. Install cert-manager (automatic TLS via Let's Encrypt)
# ---------------------------------------------------------------------------
CERTMANAGER_EMAIL="${CERTMANAGER_EMAIL:-}"

if helm list -n cert-manager 2>/dev/null | grep -q cert-manager; then
  log "cert-manager is already installed"
else
  log "Installing cert-manager..."
  helm repo add jetstack https://charts.jetstack.io --force-update
  helm repo update
  helm install cert-manager jetstack/cert-manager \
    --namespace cert-manager --create-namespace \
    --set crds.enabled=true \
    --wait --timeout=120s
  log "cert-manager installed"
fi

# Create ClusterIssuer for Let's Encrypt (production)
if kubectl get clusterissuer letsencrypt-prod &>/dev/null; then
  log "ClusterIssuer 'letsencrypt-prod' already exists"
else
  if [[ -z "${CERTMANAGER_EMAIL}" ]]; then
    log "WARNING: CERTMANAGER_EMAIL not set — skipping ClusterIssuer creation."
    log "  To create it later, run:"
    log "    CERTMANAGER_EMAIL=you@example.com bash -c 'cat <<EOF | kubectl apply -f -"
    log "    apiVersion: cert-manager.io/v1"
    log "    kind: ClusterIssuer"
    log "    metadata:"
    log "      name: letsencrypt-prod"
    log "    spec:"
    log "      acme:"
    log "        server: https://acme-v02.api.letsencrypt.org/directory"
    log "        email: \$CERTMANAGER_EMAIL"
    log "        privateKeySecretRef:"
    log "          name: letsencrypt-prod"
    log "        solvers:"
    log "          - http01:"
    log "              ingress:"
    log "                class: nginx"
    log "    EOF'"
  else
    log "Creating ClusterIssuer 'letsencrypt-prod' with email ${CERTMANAGER_EMAIL}..."
    cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: ${CERTMANAGER_EMAIL}
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            class: nginx
EOF
    log "ClusterIssuer created"
  fi
fi

# ---------------------------------------------------------------------------
# 7. Clone / update the repo
# ---------------------------------------------------------------------------
REPO_DIR="/opt/medical-pipeline"

if [[ -n "${REPO_URL:-}" ]]; then
  if [[ -d "${REPO_DIR}/.git" ]]; then
    log "Updating repo at ${REPO_DIR}..."
    cd "${REPO_DIR}"
    git fetch origin main
    git reset --hard origin/main
  else
    log "Cloning repo to ${REPO_DIR}..."
    git clone "${REPO_URL}" "${REPO_DIR}"
  fi
  chown -R "${REAL_USER}:${REAL_USER}" "${REPO_DIR}"
else
  log "REPO_URL not set — skipping repo clone. Set REPO_URL env var to auto-clone."
fi

# ---------------------------------------------------------------------------
# 8. Create namespace
# ---------------------------------------------------------------------------
NAMESPACE="medical-pipeline"
kubectl create namespace "${NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -
log "Namespace '${NAMESPACE}' ready"

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
log "=========================================="
log " VPS bootstrap complete!"
log "=========================================="
log ""
log " K3s:   $(k3s --version | head -1)"
log " Helm:  $(helm version --short)"
log " Node:  $(kubectl get nodes -o name | head -1)"
log ""
log " Next steps:"
log "   1. Point DNS to this VPS: A records for your domain, api.domain, grafana.domain"
log "   2. If you skipped CERTMANAGER_EMAIL, create the ClusterIssuer (see above)"
log "   3. Deploy:  cd ${REPO_DIR}/helm && helm upgrade --install medical-pipeline . -n ${NAMESPACE}"
log ""
