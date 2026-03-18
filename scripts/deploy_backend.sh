#!/usr/bin/env bash
set -euo pipefail

DEPLOY_ROOT="${DEPLOY_ROOT:-/home/dkmserver/Desktop/Machinity/landing}"
PROJECT_DIR="${PROJECT_DIR:-${DEPLOY_ROOT}/tusbina}"
COMPOSE_FILE="${COMPOSE_FILE:-${DEPLOY_ROOT}/tusbina-compose.yml}"
ENV_FILE="${ENV_FILE:-${DEPLOY_ROOT}/tusbina.env}"
REMOTE_NAME="${REMOTE_NAME:-origin}"
TARGET_BRANCH="${TARGET_BRANCH:-main}"
TARGET_REF="${TARGET_REF:-}"
SKIP_GIT_SYNC="${SKIP_GIT_SYNC:-0}"
HEALTHCHECK_CONTAINER="${HEALTHCHECK_CONTAINER:-tusbina_api}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-http://127.0.0.1:8000/health}"
HEALTHCHECK_TIMEOUT_SEC="${HEALTHCHECK_TIMEOUT_SEC:-180}"

log() {
  printf '[tusbina-deploy] %s\n' "$*"
}

die() {
  log "ERROR: $*"
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "missing command: $1"
}

require_file() {
  [[ -f "$1" ]] || die "missing file: $1"
}

ensure_clean_checkout() {
  cd "${PROJECT_DIR}"
  git update-index -q --refresh || true

  if ! git diff --quiet || ! git diff --cached --quiet; then
    die "tracked changes detected in ${PROJECT_DIR}; refusing to deploy"
  fi
}

sync_repo() {
  cd "${PROJECT_DIR}"

  log "fetching ${REMOTE_NAME}/${TARGET_BRANCH}"
  git fetch "${REMOTE_NAME}" "${TARGET_BRANCH}"
  git checkout "${TARGET_BRANCH}"

  if [[ -n "${TARGET_REF}" ]]; then
    git cat-file -e "${TARGET_REF}^{commit}" 2>/dev/null || die "target ref is not available: ${TARGET_REF}"
    git merge-base --is-ancestor "${TARGET_REF}" "${REMOTE_NAME}/${TARGET_BRANCH}" \
      || die "target ref is not contained in ${REMOTE_NAME}/${TARGET_BRANCH}: ${TARGET_REF}"
    log "fast-forwarding ${TARGET_BRANCH} to ${TARGET_REF}"
    git merge --ff-only "${TARGET_REF}"
  else
    log "fast-forwarding ${TARGET_BRANCH} to ${REMOTE_NAME}/${TARGET_BRANCH}"
    git pull --ff-only "${REMOTE_NAME}" "${TARGET_BRANCH}"
  fi
}

build_backend() {
  cd "${PROJECT_DIR}"
  export APP_GIT_SHA
  APP_GIT_SHA="$(git rev-parse HEAD)"
  export COMPOSE_IGNORE_ORPHANS=1

  # Ensure CORS_HANDLED_BY_PROXY is in the env file so Cloudflare's own
  # CORS headers aren't duplicated by FastAPI's CORSMiddleware.
  if ! grep -q "CORS_HANDLED_BY_PROXY" "${ENV_FILE}" 2>/dev/null; then
    log "adding CORS_HANDLED_BY_PROXY=1 to ${ENV_FILE}"
    printf '\nCORS_HANDLED_BY_PROXY=1\n' >> "${ENV_FILE}"
  fi

  log "building backend images for ${APP_GIT_SHA}"
  docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" build --pull api worker

  log "recreating api and worker containers"
  docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d --no-deps --force-recreate api worker
}

wait_for_api() {
  local deadline output

  deadline=$((SECONDS + HEALTHCHECK_TIMEOUT_SEC))
  output=""

  while (( SECONDS < deadline )); do
    if output="$(docker exec "${HEALTHCHECK_CONTAINER}" python -c "import urllib.request; print(urllib.request.urlopen('${HEALTHCHECK_URL}').read().decode())" 2>/dev/null)"; then
      log "healthcheck passed: ${output}"
      return 0
    fi

    sleep 3
  done

  die "healthcheck failed for ${HEALTHCHECK_CONTAINER} after ${HEALTHCHECK_TIMEOUT_SEC}s"
}

print_status() {
  log "container status"
  docker ps \
    --filter "name=tusbina_api" \
    --filter "name=tusbina_worker" \
    --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
}

main() {
  local before_sha after_sha

  require_command git
  require_command docker
  require_file "${COMPOSE_FILE}"
  require_file "${ENV_FILE}"
  [[ -d "${PROJECT_DIR}/.git" ]] || die "missing git checkout: ${PROJECT_DIR}"

  ensure_clean_checkout

  before_sha="$(cd "${PROJECT_DIR}" && git rev-parse HEAD)"

  if [[ "${SKIP_GIT_SYNC}" != "1" ]]; then
    sync_repo
  fi

  after_sha="$(cd "${PROJECT_DIR}" && git rev-parse HEAD)"

  if [[ -n "${TARGET_REF}" && "${SKIP_GIT_SYNC}" == "1" && "${after_sha}" != "${TARGET_REF}" ]]; then
    die "expected HEAD ${TARGET_REF}, found ${after_sha}"
  fi

  log "deploying ${before_sha} -> ${after_sha}"
  build_backend
  wait_for_api
  print_status
}

main "$@"
