#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage: ./start_backend.sh [uvicorn_args...]

Starts API and worker from apps/api.

Env:
  PORT (default: 8010)
  HOST (default: 0.0.0.0)
  RUN_WORKER (default: 1)
  APP_CORS_ORIGINS (default: *)
  PUBLIC_UPLOAD_BASE_URL (default: /static/uploads)

Examples:
  ./start_backend.sh
  PORT=8011 ./start_backend.sh
  RUN_WORKER=0 ./start_backend.sh --reload
EOF
  exit 0
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="${ROOT_DIR}/apps/api"
VENV_PY="${API_DIR}/.venv/bin/python"

# Load root .env so backend picks up project-level runtime config.
# Parse as plain KEY=VALUE to avoid shell-evaluating placeholders like "<accountid>".
if [[ -f "${ROOT_DIR}/.env" ]]; then
  while IFS= read -r line || [[ -n "${line}" ]]; do
    [[ -z "${line}" || "${line}" =~ ^[[:space:]]*# ]] && continue
    [[ "${line}" != *"="* ]] && continue

    key="${line%%=*}"
    value="${line#*=}"
    key="${key%"${key##*[![:space:]]}"}"
    key="${key#"${key%%[![:space:]]*}"}"

    if [[ ! "${key}" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
      continue
    fi

    case "${key}" in
      # Keep local launcher isolated from machine-wide/shared services by default.
      DATABASE_URL|REDIS_URL|PUBLIC_UPLOAD_BASE_URL|APP_CORS_ORIGINS)
        continue
        ;;
    esac

    if [[ "${value}" == \"*\" && "${value}" == *\" ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "${value}" == \'*\' && "${value}" == *\' ]]; then
      value="${value:1:${#value}-2}"
    fi

    if [[ "${key}" == "OPENROUTER_API_KEY" ]]; then
      case "${value}" in
        ""|your-*|YOUR-*|placeholder*|PLACEHOLDER*)
          continue
          ;;
      esac
    fi

    export "${key}=${value}"
  done < "${ROOT_DIR}/.env"
fi

PORT_VALUE="${PORT:-8010}"
HOST_VALUE="${HOST:-0.0.0.0}"
RUN_WORKER_VALUE="${RUN_WORKER:-1}"

can_bind_port() {
  if ! command -v python3 >/dev/null 2>&1; then
    return 0
  fi

  python3 - "${HOST_VALUE}" "${PORT_VALUE}" <<'PY'
import socket
import sys

host = sys.argv[1]
port = int(sys.argv[2])

s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
try:
    s.bind((host, port))
except OSError:
    sys.exit(1)
finally:
    s.close()
PY
}

if ! can_bind_port; then
  echo "Port ${PORT_VALUE} zaten kullanımda." >&2
  echo "Kapatmak için: PORT=${PORT_VALUE} ./stop_backend.sh" >&2
  exit 1
fi

cd "${API_DIR}"

PYTHON_BIN=""

if [[ -x "${VENV_PY}" ]] && "${VENV_PY}" -c "import uvicorn" >/dev/null 2>&1; then
  PYTHON_BIN="${VENV_PY}"
elif command -v python3 >/dev/null 2>&1 && python3 -c "import uvicorn" >/dev/null 2>&1; then
  PYTHON_BIN="$(command -v python3)"
elif command -v uv >/dev/null 2>&1; then
  echo "Preparing apps/api/.venv with requirements..."
  if [[ ! -x "${VENV_PY}" ]]; then
    uv venv "${API_DIR}/.venv"
  fi
  uv pip install --python "${VENV_PY}" -r requirements.txt
  PYTHON_BIN="${VENV_PY}"
else
  echo "Error: uvicorn not found. Install dependencies first." >&2
  exit 1
fi

export APP_HOST="${APP_HOST:-${HOST_VALUE}}"
export APP_PORT="${APP_PORT:-${PORT_VALUE}}"
# Force permissive CORS for local device testing unless explicitly overridden.
export APP_CORS_ORIGINS="${APP_CORS_ORIGINS_OVERRIDE:-*}"
export DATABASE_URL="${DATABASE_URL:-sqlite:///./data/tusbina.db}"
export DB_SCHEMA_MODE="${DB_SCHEMA_MODE:-create_all}"
export PUBLIC_UPLOAD_BASE_URL="${PUBLIC_UPLOAD_BASE_URL:-/static/uploads}"

if [[ -d "${API_DIR}/.venv/bin" ]]; then
  export PATH="${API_DIR}/.venv/bin:${PATH}"
fi

if [[ -x "${API_DIR}/.venv/bin/piper" ]]; then
  if [[ -z "${PIPER_BINARY_PATH:-}" ]] || ! command -v "${PIPER_BINARY_PATH}" >/dev/null 2>&1; then
    export PIPER_BINARY_PATH="${API_DIR}/.venv/bin/piper"
  fi
fi

WORKER_PID=""
cleanup() {
  if [[ -n "${WORKER_PID}" ]] && kill -0 "${WORKER_PID}" >/dev/null 2>&1; then
    kill "${WORKER_PID}" >/dev/null 2>&1 || true
    wait "${WORKER_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

if [[ "${RUN_WORKER_VALUE}" != "0" ]]; then
  "${PYTHON_BIN}" -m app.worker &
  WORKER_PID=$!
  sleep 1
  if ! kill -0 "${WORKER_PID}" >/dev/null 2>&1; then
    echo "Worker başlatılamadı." >&2
    exit 1
  fi
  echo "Worker started (pid=${WORKER_PID})"
fi

"${PYTHON_BIN}" -m uvicorn app.main:app --host "${HOST_VALUE}" --port "${PORT_VALUE}" --proxy-headers --forwarded-allow-ips "*" "$@"
