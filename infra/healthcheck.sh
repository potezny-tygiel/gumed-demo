#!/usr/bin/env bash
# =============================================================================
# Medical Data Pipeline — Health Check Report
# Comprehensive verification of all services running on K3s.
#
# Checks:
#   • Cluster nodes
#   • Namespace & resource quotas
#   • Pods (phase + container readiness + restart counts)
#   • Deployments & StatefulSets (rollout status)
#   • Services & Ingresses
#   • Persistent Volume Claims (storage)
#   • Application-level endpoints (API /health, Grafana /api/health)
#   • Database connectivity (via API table count)
#   • Recent Kubernetes warning events
#   • Helm release status & history
#   • Resource usage (CPU / memory via metrics-server if available)
#
# Usage:
#   bash infra/healthcheck.sh [namespace]
#
# Exit codes:
#   0 — all checks passed
#   1 — one or more checks failed
# =============================================================================

set -euo pipefail

NAMESPACE="${1:-medical-pipeline}"
RELEASE_NAME="${2:-medical-pipeline}"
FAILED=0
WARNED=0
CHECKS_RUN=0
CHECKS_PASSED=0
START_TIME=$(date +%s)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m' # No Color

ok()   { echo -e "  ${GREEN}✓${NC} $*"; CHECKS_RUN=$((CHECKS_RUN + 1)); CHECKS_PASSED=$((CHECKS_PASSED + 1)); }
fail() { echo -e "  ${RED}✗${NC} $*"; CHECKS_RUN=$((CHECKS_RUN + 1)); FAILED=$((FAILED + 1)); }
warn() { echo -e "  ${YELLOW}!${NC} $*"; WARNED=$((WARNED + 1)); }
info() { echo -e "\n${BLUE}━━━${NC} ${BOLD}$*${NC}"; }
dim()  { echo -e "  ${DIM}$*${NC}"; }

header() {
  echo ""
  echo -e "${CYAN}╔═══════════════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║${NC}  ${BOLD}Medical Data Pipeline — Health Report${NC}                    ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC}  $(date '+%Y-%m-%d %H:%M:%S %Z')                                  ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC}  Namespace: ${NAMESPACE}                              ${CYAN}║${NC}"
  echo -e "${CYAN}╚═══════════════════════════════════════════════════════════╝${NC}"
}

# ---------------------------------------------------------------------------
# 1. Cluster Nodes
# ---------------------------------------------------------------------------
header
info "Cluster Nodes"

if kubectl get nodes &> /dev/null; then
  NODE_STATUS=$(kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name}{"|"}{.status.conditions[?(@.type=="Ready")].status}{"|"}{.status.nodeInfo.kubeletVersion}{"|"}{.status.nodeInfo.osImage}{"\n"}{end}')
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    NODE_NAME=$(echo "$line" | cut -d'|' -f1)
    NODE_READY=$(echo "$line" | cut -d'|' -f2)
    NODE_VERSION=$(echo "$line" | cut -d'|' -f3)
    NODE_OS=$(echo "$line" | cut -d'|' -f4)
    if [[ "$NODE_READY" == "True" ]]; then
      ok "Node ${NODE_NAME} — Ready (${NODE_VERSION}, ${NODE_OS})"
    else
      fail "Node ${NODE_NAME} — NOT Ready"
    fi
  done <<< "$NODE_STATUS"
else
  fail "Cannot connect to cluster"
  exit 1
fi

# ---------------------------------------------------------------------------
# 2. Namespace
# ---------------------------------------------------------------------------
info "Namespace"

if kubectl get namespace "${NAMESPACE}" &> /dev/null; then
  PHASE=$(kubectl get namespace "${NAMESPACE}" -o jsonpath='{.status.phase}')
  ok "Namespace '${NAMESPACE}' exists (${PHASE})"
else
  fail "Namespace '${NAMESPACE}' not found"
  exit 1
fi

# ---------------------------------------------------------------------------
# 3. Pods
# ---------------------------------------------------------------------------
info "Pods"

PODS=$(kubectl get pods -n "${NAMESPACE}" -o jsonpath='{range .items[*]}{.metadata.name}{"|"}{.status.phase}{"|"}{range .status.containerStatuses[*]}{.ready}{" "}{end}{"|"}{range .status.containerStatuses[*]}{.restartCount}{" "}{end}{"|"}{.metadata.creationTimestamp}{"\n"}{end}' 2>/dev/null || true)

if [[ -z "$PODS" ]]; then
  warn "No pods found in namespace '${NAMESPACE}'"
else
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    POD_NAME=$(echo "$line" | cut -d'|' -f1)
    POD_PHASE=$(echo "$line" | cut -d'|' -f2)
    CONTAINERS_READY=$(echo "$line" | cut -d'|' -f3)
    RESTART_COUNTS=$(echo "$line" | cut -d'|' -f4 | tr -s ' ')
    CREATED=$(echo "$line" | cut -d'|' -f5)

    # Sum restart counts
    TOTAL_RESTARTS=0
    for rc in $RESTART_COUNTS; do
      TOTAL_RESTARTS=$((TOTAL_RESTARTS + rc))
    done

    # Build detail string
    DETAIL="${POD_PHASE}"
    if [[ $TOTAL_RESTARTS -gt 0 ]]; then
      DETAIL="${DETAIL}, ${TOTAL_RESTARTS} restart(s)"
    fi
    if [[ -n "$CREATED" ]]; then
      DETAIL="${DETAIL}, since ${CREATED}"
    fi

    if [[ "$POD_PHASE" == "Running" ]] || [[ "$POD_PHASE" == "Succeeded" ]]; then
      if [[ "$POD_PHASE" == "Running" ]] && echo "$CONTAINERS_READY" | grep -q "false"; then
        fail "Pod ${POD_NAME} — ${DETAIL} (containers not ready)"
      elif [[ $TOTAL_RESTARTS -gt 5 ]]; then
        ok "Pod ${POD_NAME} — ${DETAIL}"
        warn "  ↳ High restart count — investigate logs"
      else
        ok "Pod ${POD_NAME} — ${DETAIL}"
      fi
    else
      fail "Pod ${POD_NAME} — ${DETAIL}"
    fi
  done <<< "$PODS"
fi

# ---------------------------------------------------------------------------
# 4. Deployments
# ---------------------------------------------------------------------------
info "Deployments"

DEPLOYMENTS=$(kubectl get deployments -n "${NAMESPACE}" -o jsonpath='{range .items[*]}{.metadata.name}{"|"}{.status.readyReplicas}{"|"}{.spec.replicas}{"|"}{.status.updatedReplicas}{"\n"}{end}' 2>/dev/null || true)

if [[ -n "$DEPLOYMENTS" ]]; then
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    DEP_NAME=$(echo "$line" | cut -d'|' -f1)
    READY=$(echo "$line" | cut -d'|' -f2)
    DESIRED=$(echo "$line" | cut -d'|' -f3)
    UPDATED=$(echo "$line" | cut -d'|' -f4)
    READY="${READY:-0}"
    UPDATED="${UPDATED:-0}"

    if [[ "$READY" == "$DESIRED" ]] && [[ "$READY" -gt 0 ]]; then
      ok "Deployment ${DEP_NAME} — ${READY}/${DESIRED} ready, ${UPDATED} up-to-date"
    else
      fail "Deployment ${DEP_NAME} — ${READY}/${DESIRED} ready (expected ${DESIRED})"
    fi
  done <<< "$DEPLOYMENTS"
else
  warn "No deployments found"
fi

# ---------------------------------------------------------------------------
# 5. StatefulSets
# ---------------------------------------------------------------------------
info "StatefulSets"

STATEFULSETS=$(kubectl get statefulsets -n "${NAMESPACE}" -o jsonpath='{range .items[*]}{.metadata.name}{"|"}{.status.readyReplicas}{"|"}{.spec.replicas}{"\n"}{end}' 2>/dev/null || true)

if [[ -n "$STATEFULSETS" ]]; then
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    SS_NAME=$(echo "$line" | cut -d'|' -f1)
    READY=$(echo "$line" | cut -d'|' -f2)
    DESIRED=$(echo "$line" | cut -d'|' -f3)
    READY="${READY:-0}"

    if [[ "$READY" == "$DESIRED" ]] && [[ "$READY" -gt 0 ]]; then
      ok "StatefulSet ${SS_NAME} — ${READY}/${DESIRED} ready"
    else
      fail "StatefulSet ${SS_NAME} — ${READY}/${DESIRED} ready"
    fi
  done <<< "$STATEFULSETS"
else
  warn "No statefulsets found"
fi

# ---------------------------------------------------------------------------
# 6. Services
# ---------------------------------------------------------------------------
info "Services"

SVC_OUTPUT=$(kubectl get services -n "${NAMESPACE}" -o custom-columns='NAME:.metadata.name,TYPE:.spec.type,CLUSTER-IP:.spec.clusterIP,PORT(S):.spec.ports[*].port' --no-headers 2>/dev/null || true)

if [[ -n "$SVC_OUTPUT" ]]; then
  while IFS= read -r line; do
    ok "$line"
  done <<< "$SVC_OUTPUT"
else
  warn "No services found"
fi

# ---------------------------------------------------------------------------
# 7. Ingresses
# ---------------------------------------------------------------------------
info "Ingresses"

INGRESSES=$(kubectl get ingress -n "${NAMESPACE}" -o jsonpath='{range .items[*]}{.metadata.name}{"|"}{.spec.rules[0].host}{"|"}{.spec.rules[0].http.paths[0].path}{"\n"}{end}' 2>/dev/null || true)

if [[ -n "$INGRESSES" ]]; then
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    ING_NAME=$(echo "$line" | cut -d'|' -f1)
    ING_HOST=$(echo "$line" | cut -d'|' -f2)
    ING_PATH=$(echo "$line" | cut -d'|' -f3)
    ok "Ingress ${ING_NAME} → ${ING_HOST}${ING_PATH}"
  done <<< "$INGRESSES"
else
  warn "No ingresses configured"
fi

# ---------------------------------------------------------------------------
# 8. Persistent Volume Claims
# ---------------------------------------------------------------------------
info "Storage (PVCs)"

PVCS=$(kubectl get pvc -n "${NAMESPACE}" -o jsonpath='{range .items[*]}{.metadata.name}{"|"}{.status.phase}{"|"}{.spec.resources.requests.storage}{"|"}{.spec.storageClassName}{"\n"}{end}' 2>/dev/null || true)

if [[ -n "$PVCS" ]]; then
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    PVC_NAME=$(echo "$line" | cut -d'|' -f1)
    PVC_PHASE=$(echo "$line" | cut -d'|' -f2)
    PVC_SIZE=$(echo "$line" | cut -d'|' -f3)
    PVC_CLASS=$(echo "$line" | cut -d'|' -f4)

    if [[ "$PVC_PHASE" == "Bound" ]]; then
      ok "PVC ${PVC_NAME} — ${PVC_PHASE} (${PVC_SIZE}, ${PVC_CLASS})"
    else
      fail "PVC ${PVC_NAME} — ${PVC_PHASE} (expected Bound)"
    fi
  done <<< "$PVCS"
else
  warn "No PVCs found"
fi

# ---------------------------------------------------------------------------
# 9. Application-Level Health (API)
# ---------------------------------------------------------------------------
info "Application Health"

# Get the API service ClusterIP and port
API_SVC=$(kubectl get svc -n "${NAMESPACE}" -l "app.kubernetes.io/name=api" -o jsonpath='{.items[0].spec.clusterIP}:{.items[0].spec.ports[0].port}' 2>/dev/null || true)

if [[ -n "$API_SVC" ]] && [[ "$API_SVC" != ":" ]]; then
  # Use kubectl exec on a running pod to curl the API (works inside the cluster)
  API_POD=$(kubectl get pods -n "${NAMESPACE}" -l "app.kubernetes.io/name=api" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)

  if [[ -n "$API_POD" ]]; then
    # Test /health endpoint
    HEALTH_RESPONSE=$(kubectl exec -n "${NAMESPACE}" "${API_POD}" -- python -c "
import urllib.request, json, sys
try:
    resp = urllib.request.urlopen('http://localhost:8000/health', timeout=5)
    data = json.loads(resp.read())
    print(data.get('status', 'unknown'))
except Exception as e:
    print(f'error:{e}', file=sys.stderr)
    sys.exit(1)
" 2>/dev/null || true)

    if [[ "$HEALTH_RESPONSE" == "healthy" ]]; then
      ok "API /health → healthy"
    elif [[ -n "$HEALTH_RESPONSE" ]]; then
      fail "API /health → ${HEALTH_RESPONSE}"
    else
      fail "API /health — no response"
    fi

    # Test /api/v1/tables to verify DB connectivity
    TABLES_RESPONSE=$(kubectl exec -n "${NAMESPACE}" "${API_POD}" -- python -c "
import urllib.request, json, sys
try:
    resp = urllib.request.urlopen('http://localhost:8000/api/v1/tables', timeout=5)
    data = json.loads(resp.read())
    tables = data.get('tables', [])
    print(len(tables))
except Exception as e:
    print(f'error:{e}', file=sys.stderr)
    sys.exit(1)
" 2>/dev/null || true)

    if [[ -n "$TABLES_RESPONSE" ]] && [[ "$TABLES_RESPONSE" =~ ^[0-9]+$ ]]; then
      if [[ "$TABLES_RESPONSE" -gt 0 ]]; then
        ok "API /api/v1/tables → ${TABLES_RESPONSE} table(s) found (DB connected)"
      else
        warn "API /api/v1/tables → 0 tables (ingestion may not have run yet)"
      fi
    else
      fail "API /api/v1/tables — could not reach database"
    fi
  else
    warn "No API pod found — skipping application health checks"
  fi
else
  warn "API service not found — skipping application health checks"
fi

# Test Grafana health
GRAFANA_POD=$(kubectl get pods -n "${NAMESPACE}" -l "app.kubernetes.io/name=grafana" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)

if [[ -n "$GRAFANA_POD" ]]; then
  GF_HEALTH=$(kubectl exec -n "${NAMESPACE}" "${GRAFANA_POD}" -- wget -qO- "http://localhost:3000/api/health" 2>/dev/null || true)
  if echo "$GF_HEALTH" | grep -q '"database": "ok"' 2>/dev/null; then
    ok "Grafana /api/health → ok (database connected)"
  elif [[ -n "$GF_HEALTH" ]]; then
    warn "Grafana /api/health → responded but database status unclear"
  else
    fail "Grafana /api/health — no response"
  fi
else
  warn "No Grafana pod found — skipping Grafana health check"
fi

# ---------------------------------------------------------------------------
# 10. Recent Events (warnings only)
# ---------------------------------------------------------------------------
info "Recent Warning Events"

WARNINGS=$(kubectl get events -n "${NAMESPACE}" --field-selector type=Warning --sort-by=.lastTimestamp 2>/dev/null | tail -5 || true)

if [[ -n "$WARNINGS" ]] && [[ "$WARNINGS" != *"No resources found"* ]]; then
  echo "$WARNINGS" | while IFS= read -r line; do
    warn "$line"
  done
else
  ok "No recent warning events"
fi

# ---------------------------------------------------------------------------
# 11. Helm Release
# ---------------------------------------------------------------------------
info "Helm Release"

HELM_STATUS=$(helm status "${RELEASE_NAME}" -n "${NAMESPACE}" -o json 2>/dev/null || true)

if [[ -n "$HELM_STATUS" ]]; then
  RELEASE_STATUS=$(echo "$HELM_STATUS" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
  REVISION=$(echo "$HELM_STATUS" | grep -o '"revision":[0-9]*' | head -1 | cut -d: -f2)
  LAST_DEPLOYED=$(echo "$HELM_STATUS" | grep -o '"last_deployed":"[^"]*"' | head -1 | cut -d'"' -f4 || true)

  if [[ "$RELEASE_STATUS" == "deployed" ]]; then
    ok "Release: ${RELEASE_NAME} | Status: ${RELEASE_STATUS} | Revision: ${REVISION}"
  else
    fail "Release: ${RELEASE_NAME} | Status: ${RELEASE_STATUS} | Revision: ${REVISION}"
  fi
  if [[ -n "$LAST_DEPLOYED" ]]; then
    dim "Last deployed: ${LAST_DEPLOYED}"
  fi

  # Show last 3 revisions
  HISTORY=$(helm history "${RELEASE_NAME}" -n "${NAMESPACE}" --max 3 -o table 2>/dev/null || true)
  if [[ -n "$HISTORY" ]]; then
    dim ""
    dim "Recent history:"
    echo "$HISTORY" | while IFS= read -r line; do
      dim "  $line"
    done
  fi
else
  warn "No Helm release '${RELEASE_NAME}' found"
fi

# ---------------------------------------------------------------------------
# 12. Resource Usage (if metrics-server is available)
# ---------------------------------------------------------------------------
info "Resource Usage"

if kubectl top nodes &> /dev/null; then
  dim "Node resources:"
  kubectl top nodes 2>/dev/null | while IFS= read -r line; do
    dim "  $line"
  done

  dim ""
  dim "Pod resources in ${NAMESPACE}:"
  kubectl top pods -n "${NAMESPACE}" 2>/dev/null | while IFS= read -r line; do
    dim "  $line"
  done
  ok "Metrics collected"
else
  dim "metrics-server not available — skipping resource usage"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [[ $FAILED -eq 0 ]]; then
  echo -e "${GREEN}  ✓ ALL CHECKS PASSED${NC}  (${CHECKS_PASSED}/${CHECKS_RUN} passed, ${WARNED} warning(s), ${DURATION}s)"
else
  echo -e "${RED}  ✗ ${FAILED} CHECK(S) FAILED${NC}  (${CHECKS_PASSED}/${CHECKS_RUN} passed, ${WARNED} warning(s), ${DURATION}s)"
fi

echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [[ $FAILED -gt 0 ]]; then
  exit 1
fi
