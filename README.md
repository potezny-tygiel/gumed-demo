# 🏥 Medical Data Pipeline

> A production-ready| If you want to see… | Look at… |
|---|---|
| The REST API in action | `api/app/routes.py` — 4 endpoints, clean and readable |
| How data gets ingested | `ingestion/ingest.py` — downloads from Kaggle, cleans columns, loads into PostgreSQL |
| The frontend + 3D scene | `frontend/` — glassmorphism UI over a PS1-style WebGPU medical lab |
| The CI/CD pipelines | `.github/workflows/` — 6 YAML files, each one a pipeline stage |
| The security setup | `.github/workflows/security.yml` — 5 scanners in one workflow |
| Infrastructure as Code | `helm/` — the entire Kubernetes deployment described as config files (5 subcharts) |
| Server hardening | `infra/bootstrap.sh` — firewall, intrusion detection, kernel hardening, auto-updates |f concept: automated data ingestio| Component | Technology |
|---|---|
| **Language** | Python 3.12 |
| **API** | FastAPI + Uvicorn |
| **Frontend** | Vanilla JS + WebGPU (PS1-style 3D scene) + nginx |
| **Database** | PostgreSQL 16 (alpine) |
| **Visualization** | Grafana 11.4 |
| **Orchestration** | K3s (lightweight Kubernetes) |
| **Packaging** | Helm charts (umbrella + 5 subcharts) |
| **Container Registry** | GitHub Container Registry (ghcr.io) |
| **CI/CD** | GitHub Actions (6 workflows) |
| **TLS** | cert-manager + Let's Encrypt (auto-provisioned) |
| **Security Scanning** | Bandit · pip-audit · Trivy · Gitleaks |
| **VPS Hardening** | UFW · fail2ban · sysctl · unattended-upgrades |boards, and deployment — from an empty server to a running system with one push.

---

## 📋 Executive Overview

This project demonstrates a **complete, end-to-end data platform** — Everything is automated: the infrastructure, the deployment, the testing, the security scanning, and the monitoring.

### What does it do?

1. **Pulls** a medical dataset from Kaggle (an open data platform)
2. **Stores** it in a PostgreSQL database
3. **Serves** it through a REST API (for applications to consume)
4. **Visualizes** it in Grafana dashboards (for humans to explore)
5. **Deploys** everything to a cloud server automatically when code is pushed

There are **zero manual steps** in the production workflow. A developer pushes code → tests run → images build → the system deploys → a health check confirms everything is working. If anything fails, the deployment rolls back automatically.

### What makes it impressive?

| | Capability | Why it matters |
|---|---|---|
| � | **Fully automated CI/CD** | 6 interconnected pipelines handle testing, building, deploying, security scanning, and monitoring — no human intervention needed |
| 🔒 | **Security at every layer** | 5 automated security scanners, firewall, brute-force protection, encrypted traffic, zero-trust networking, non-root containers |
| � | **Instant dashboards** | Grafana spins up pre-configured with the database connection and a healthcare dashboard — zero setup |
| 🧪 | **40 automated tests** | Both services have comprehensive test suites that run on every code change |
| ❤️ | **Self-monitoring** | A 12-section health check runs every 6 hours and validates every component end-to-end, including actual HTTP requests to the API |
| 🎯 | **One-command server setup** | A single script takes a blank Ubuntu server and installs everything: Kubernetes, package manager, firewall, intrusion detection, auto-patching |
| ♻️ | **Safe to re-run** | Every operation is idempotent — running it twice doesn't break anything |
| � | **Production patterns** | Helm charts, multi-stage Docker builds, atomic rollbacks, namespace isolation — the same patterns used at scale in industry |

### Where to look around

| If you want to see… | Look at… |
|---|---|
| The REST API in action | `api/app/routes.py` — 4 endpoints, clean and readable |
| How data gets ingested | `ingestion/ingest.py` — downloads from Kaggle, cleans columns, loads into PostgreSQL |
| The CI/CD pipelines | `.github/workflows/` — 6 YAML files, each one a pipeline stage |
| The security setup | `.github/workflows/security.yml` — 5 scanners in one workflow |
| Infrastructure as Code | `helm/` — the entire Kubernetes deployment described as config files (5 subcharts) |
| Server hardening | `infra/bootstrap.sh` — firewall, intrusion detection, kernel hardening, auto-updates |
| The health check report | `infra/healthcheck.sh` — 430 lines, checks 12 categories, color-coded output |
| Test suites | `api/tests/test_api.py` (18 tests) and `ingestion/tests/test_ingest.py` (22 tests) |
| The Grafana dashboard | `grafana/dashboards/healthcare_overview.json` — 5 panels: bar chart, pie chart, stats, data table |
| Network security rules | `helm/templates/netpol-*.yaml` — 6 policies implementing zero-trust networking |

### Technology summary

| Layer | Technologies |
|---|---|
| **Application** | Python 3.12 · FastAPI · SQLAlchemy · Pandas |
| **Data** | PostgreSQL 16 · Grafana 11.4 |
| **Infrastructure** | K3s (Kubernetes) · Helm · Docker |
| **CI/CD** | GitHub Actions · GitHub Container Registry |
| **Security** | Bandit · pip-audit · Trivy · Gitleaks · UFW · fail2ban |
| **Testing** | pytest (40 tests) · ruff (linting) · mypy (type checking) |

---

## Architecture

```
                         ┌─────────────────────────────────────────────────────────┐
                         │                    K3s Cluster (VPS)                    │
                         │                                                         │
  ┌──────────────┐       │  ┌──────────────┐     ┌──────────────┐                  │
  │   Kaggle     │──HTTPS──▶│  Ingestion   │────▶│  PostgreSQL  │                  │
  │   Dataset    │       │  │  (K8s Job)   │     │ (StatefulSet)│                  │
  └──────────────┘       │  └──────────────┘     └──────┬───────┘                  │
                         │                              │                          │
                         │                    ┌─────────┼─────────┐                │
                         │                    ▼                   ▼                 │
  ┌──────────────┐       │  ┌──────────────┐         ┌──────────────┐              │
  │              │──────────▶│  Frontend   │────────▶│   FastAPI    │              │
  │   Users      │  HTTPS │  │  (nginx)    │  /api/  │ (Deployment) │              │
  │              │──────────▶│  WebGPU 3D  │         └──────────────┘              │
  │              │  HTTPS │  └──────────────┘               :8000                  │
  │              │──────────▶┌──────────────┐                                      │
  └──────────────┘  HTTPS │  │   Grafana    │                                      │
                         │  │ (Deployment) │                                      │
                         │  └──────────────┘                                      │
                         │       :3000                                             │
                         └─────────────────────────────────────────────────────────┘
                              Helm umbrella chart • cert-manager TLS • GitHub Actions
```

## Tech Stack

| Component | Technology |
|---|---|
| **Language** | Python 3.12 |
| **API** | FastAPI + Uvicorn |
| **Frontend** | Vanilla JS + WebGPU (PS1-style 3D scene) + nginx |
| **Database** | PostgreSQL 16 (alpine) |
| **Visualization** | Grafana 11.4 |
| **Orchestration** | K3s (lightweight Kubernetes) |
| **Packaging** | Helm charts (umbrella + 5 subcharts) |
| **Container Registry** | GitHub Container Registry (ghcr.io) |
| **CI/CD** | GitHub Actions (6 workflows) |
| **TLS** | cert-manager + Let's Encrypt (auto-provisioned) |
| **Security Scanning** | Bandit · pip-audit · Trivy · Gitleaks |
| **VPS Hardening** | UFW · fail2ban · sysctl · unattended-upgrades |

---

## Quick Start

### Prerequisites

- A VPS (Ubuntu 22.04+) with SSH access
- A [Kaggle account](https://www.kaggle.com/) with API credentials
- A GitHub repository with the required [secrets](#required-github-secrets) configured

### 1. Bootstrap the VPS

```bash
# Option A: Run directly on the VPS
sudo REPO_URL=https://github.com/<owner>/<repo>.git bash infra/bootstrap.sh

# Option B: Run remotely via SSH
ssh root@your-vps 'REPO_URL=https://github.com/<owner>/<repo>.git bash -s' < infra/bootstrap.sh

# Option C: Use the GitHub Actions workflow
# Go to Actions → "Bootstrap VPS" → Run workflow
```

This single script installs K3s, Helm, NGINX Ingress Controller, cert-manager (for automatic Let's Encrypt TLS certificates), configures the UFW firewall, enables fail2ban, applies kernel hardening, and sets up automatic security updates.

> **Tip:** Pass `CERTMANAGER_EMAIL` to auto-create the Let's Encrypt ClusterIssuer:
> ```bash
> sudo REPO_URL=https://github.com/<owner>/<repo>.git CERTMANAGER_EMAIL=you@example.com bash infra/bootstrap.sh
> ```

### 2. Configure DNS

Point your domain to the VPS by creating **3 A records** at your registrar:

| Type | Name | Value |
|------|------|-------|
| A | `@` (root) | `<VPS_IP>` |
| A | `api` | `<VPS_IP>` |
| A | `grafana` | `<VPS_IP>` |

Verify propagation:
```bash
dig +short yourdomain.com api.yourdomain.com grafana.yourdomain.com
```

> **TLS certificates** are provisioned automatically by cert-manager once DNS resolves to your VPS. No manual certificate management required.

### 3. Deploy the pipeline

```bash
# On the VPS (or let GitHub Actions handle it automatically)
cd /opt/medical-pipeline/helm

helm upgrade --install medical-pipeline . \
  --namespace medical-pipeline --create-namespace \
  --set api.image.repository=ghcr.io/<owner>/<repo>/api \
  --set api.image.tag=latest \
  --set ingestion.image.repository=ghcr.io/<owner>/<repo>/ingestion \
  --set ingestion.image.tag=latest \
  --set ingestion.kaggle.username=<your-kaggle-user> \
  --set ingestion.kaggle.key=<your-kaggle-key> \
  --set postgresql.auth.password=<db-password> \
  --wait --atomic
```

### 4. Verify

```bash
# Quick check
kubectl get pods -n medical-pipeline

# Full health report (12-section diagnostic)
bash infra/healthcheck.sh
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/api/v1/tables` | List all available tables |
| `GET` | `/api/v1/tables/{name}` | Get table metadata (columns, row count) |
| `GET` | `/api/v1/tables/{name}/rows` | Fetch rows with pagination |

**Pagination parameters** for `/rows`:
- `limit` — 1 to 1000 (default: 100)
- `offset` — 0+ (default: 0)

---

## CI/CD — How It Works

The project uses **6 GitHub Actions workflows** that chain together to form a fully automated pipeline from code push to production deployment.

### The Pipelines

```
  Push / PR to main
        │
        ▼
  ┌───────────┐     ┌──────────────┐
  │    CI      │     │   Security   │     ← run in parallel
  │ lint+test  │     │  5 scanners  │
  │ build+helm │     │  + weekly    │
  └─────┬─────┘     └──────────────┘
        │
        ▼  (main branch only)
  ┌───────────┐
  │   Build   │  ← selective: only changed services
  │ Push GHCR │
  └─────┬─────┘
        │
        ▼  (auto-triggered on success)
  ┌───────────┐
  │  Deploy   │  ← SSH → helm upgrade --atomic
  │  to K3s   │  ← post-deploy health check
  └───────────┘

  Scheduled (every 6h):    Health Check
  Manual (workflow_dispatch): Bootstrap VPS
```

### 1️⃣ CI — `ci.yml`

**Triggers:** Every push and PR to `main`

| Step | What it does |
|---|---|
| **Lint & Type Check** | Runs `ruff` and `mypy` on both `api/` and `ingestion/` |
| **Unit Tests** | Runs `pytest` for both services (40 tests), uploads JUnit XML artifacts |
| **Docker Build** | Verifies images build successfully (does not push) |
| **Helm Lint** | Lints all 5 subcharts + the umbrella chart |

The build step only runs after lint and tests pass.

### 2️⃣ Security — `security.yml`

**Triggers:** Every push, PR, and weekly cron (Monday 06:00 UTC)

| Scanner | What it checks |
|---|---|
| **Bandit** (SAST) | Python source code for common security issues (medium+ severity) |
| **pip-audit** | Known CVEs in Python dependencies |
| **Trivy** (container) | Docker image vulnerabilities (CRITICAL + HIGH) — results uploaded to GitHub Security tab as SARIF |
| **Gitleaks** | Leaked secrets in the entire git history |
| **Trivy** (config) | K8s manifest misconfigurations (renders Helm templates first) |

Each scanner reports results in the GitHub Actions **Step Summary** for easy review.

### 3️⃣ Build & Push — `build.yml`

**Triggers:** Push to `main` when `api/`, `ingestion/`, or `frontend/` files change

- **Selective builds** — detects which services changed via `git diff` and only rebuilds those
- Pushes to GitHub Container Registry (`ghcr.io`)
- Tags with both `latest` and the commit SHA
- Manual override: `workflow_dispatch` with "Force rebuild all" option
- Produces a build summary table showing which services were built/skipped

### 4️⃣ Deploy — `deploy.yml`

**Triggers:** Automatically after a successful Build workflow, or manual `workflow_dispatch`

1. SSHs into the VPS
2. Pulls the latest repo (`git fetch + reset`)
3. Creates/updates the GHCR pull secret
4. Runs a `helm upgrade --install` dry-run (shows what will change)
5. Applies the release with `--wait --atomic` (auto-rollback on failure)
6. Runs the full health check post-deploy
7. **If the build workflow failed**, the deploy is **automatically skipped** with a warning

### 5️⃣ Health Check — `healthcheck.yml`

**Triggers:** Every 6 hours (cron) + manual `workflow_dispatch`

SSHs into the VPS and runs `infra/healthcheck.sh` — a 430-line diagnostic that checks:

> Nodes → Namespace → Pods → Deployments → StatefulSets → Services → Ingresses → PVCs → App endpoints (API + Grafana) → DB connectivity → Warning events → Helm release status → Resource usage

Exits with code 1 if any check fails, making the workflow go red for visibility.

### 6️⃣ Bootstrap — `bootstrap.yml`

**Triggers:** Manual `workflow_dispatch` only

One-time setup: SSHs into a fresh VPS and runs `bootstrap.sh` to install K3s, Helm, and all security hardening. Verifies the cluster is ready afterwards.

---

## Security

This project implements **defense-in-depth** across all layers:

### 🐳 Container Level
- **Multi-stage Docker builds** — minimal runtime images, no build tooling
- **Non-root user** — all containers run as `appuser` (UID 1000) or `grafana` (UID 472)
- **`.dockerignore`** — tests, caches, and secrets excluded from images

### ☸️ Kubernetes Level
- **Pod Security Contexts** — `runAsNonRoot`, `runAsUser`, `runAsGroup`, `fsGroup`
- **Container Security Contexts** — `allowPrivilegeEscalation: false`, `readOnlyRootFilesystem`, `capabilities.drop: ["ALL"]`
- **Zero-trust NetworkPolicies** — default-deny-all baseline + explicit allow rules per service:
  - API: ingress on 8000, egress to PostgreSQL + DNS
  - Grafana: ingress on 3000, egress to PostgreSQL + DNS
  - PostgreSQL: ingress only from API/Grafana/Ingestion on 5432
  - Ingestion: no ingress, egress to PostgreSQL + Kaggle HTTPS + DNS

### 🌐 Ingress Level
- **Automatic TLS** via cert-manager + Let's Encrypt (free, auto-renewed)
- **TLS termination** with automatic redirect
- **Rate limiting** — API: 20 req/s, Frontend: 30 req/s, Grafana: 15 req/s
- **Security headers** — `X-Frame-Options`, `X-Content-Type-Options`, `X-XSS-Protection`, `Referrer-Policy`

### 🖥️ VPS Level
- **UFW firewall** — deny all incoming, allow only SSH, HTTP, HTTPS, K3s API
- **fail2ban** — SSH brute-force protection (ban after 5 failures for 1 hour)
- **Kernel hardening** — disable source routing & ICMP redirects, enable SYN cookies, log Martian packets
- **Unattended upgrades** — automatic security patching

---

## Project Structure

```
.
├── .github/
│   ├── copilot-instructions.md          # Copilot workspace context
│   └── workflows/
│       ├── ci.yml                       # Lint, test, build, Helm lint
│       ├── build.yml                    # Selective build & push to GHCR
│       ├── deploy.yml                   # Deploy to K3s via Helm (atomic)
│       ├── security.yml                 # 5-tool security scan pipeline
│       ├── healthcheck.yml              # Scheduled cluster health report
│       └── bootstrap.yml                # One-time VPS provisioning
├── api/
│   ├── app/
│   │   ├── __init__.py                  # FastAPI app factory + lifespan
│   │   ├── main.py                      # Uvicorn entrypoint
│   │   ├── database.py                  # SQLAlchemy engine & queries
│   │   └── routes.py                    # API route handlers
│   ├── tests/
│   │   ├── conftest.py                  # Early-patching fixtures (no DB needed)
│   │   └── test_api.py                  # 18 tests across 5 test classes
│   ├── Dockerfile                       # Multi-stage, non-root
│   ├── .dockerignore
│   └── requirements.txt
├── ingestion/
│   ├── ingest.py                        # Kaggle download & CSV → PostgreSQL
│   ├── tests/
│   │   ├── conftest.py                  # Mocked Kaggle SDK
│   │   └── test_ingest.py               # 21 tests across 6 test classes
│   ├── Dockerfile                       # Multi-stage, non-root
│   ├── .dockerignore
│   └── requirements.txt
├── frontend/
│   ├── index.html                       # Dashboard UI (glassmorphism over WebGPU)
│   ├── style.css                        # Responsive styles + glassmorphism
│   ├── app.js                           # API client + data grid + pagination
│   ├── lab-scene.js                     # PS1-style 3D medical lab (WebGPU)
│   ├── Dockerfile                       # nginx + entrypoint for API proxy
│   ├── nginx.conf                       # Static files + /api/ reverse proxy
│   ├── entrypoint.sh                    # Runtime API_UPSTREAM substitution
│   └── .dockerignore
├── infra/
│   ├── bootstrap.sh                     # VPS setup (K3s + Helm + security)
│   └── healthcheck.sh                   # 12-section cluster diagnostic
├── helm/                                # Umbrella Helm chart
│   ├── Chart.yaml                       # Dependencies on 5 subcharts
│   ├── values.yaml                      # Global + subchart overrides
│   ├── templates/
│   │   ├── netpol-default-deny.yaml     # Zero-trust baseline
│   │   ├── netpol-api.yaml              # API network rules
│   │   ├── netpol-frontend.yaml         # Frontend network rules
│   │   ├── netpol-grafana.yaml          # Grafana network rules
│   │   ├── netpol-postgresql.yaml       # PostgreSQL network rules
│   │   └── netpol-ingestion.yaml        # Ingestion network rules
│   └── charts/
│       ├── postgresql/                  # StatefulSet + PVC + Secret
│       ├── api/                         # Deployment + Service + Ingress
│       ├── ingestion/                   # Job (Helm hook: post-install/upgrade)
│       ├── grafana/                     # Deployment + ConfigMaps + Ingress
│       └── frontend/                    # Deployment + Service + Ingress (nginx + WebGPU)
├── docker-compose.yml                   # Local development stack
├── .env.example
├── .gitignore
└── README.md
```

---

## Required GitHub Secrets

| Secret | Used by | Description |
|---|---|---|
| `VPS_HOST` | Deploy, Health, Bootstrap | VPS IP address or hostname |
| `VPS_USER` | Deploy, Health, Bootstrap | SSH username on the VPS |
| `VPS_SSH_KEY` | Deploy, Health, Bootstrap | SSH private key for the VPS |
| `GHCR_PAT` | Deploy | GitHub PAT with `read:packages` scope |
| `KAGGLE_USERNAME` | Deploy | Kaggle API username |
| `KAGGLE_KEY` | Deploy | Kaggle API key |
| `POSTGRES_USER` | Deploy | Database username (production) |
| `POSTGRES_PASSWORD` | Deploy | Database password (production) |
| `GF_ADMIN_PASSWORD` | Deploy | Grafana admin password (production) |

---

## Dataset

Default: [Healthcare Dataset](https://www.kaggle.com/datasets/prasad22/healthcare-dataset) by prasad22

Change the dataset by setting `ingestion.kaggle.dataset` in Helm values. The ingestion script automatically discovers and loads all CSV files from the dataset.

---

## License

MIT
