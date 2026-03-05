#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage: ./stop_backend.sh

Stops API/worker processes for this project.

Env:
  PORT (default: 8010)

Examples:
  ./stop_backend.sh
  PORT=8011 ./stop_backend.sh
EOF
  exit 0
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="${ROOT_DIR}/apps/api"
PORT_VALUE="${PORT:-8010}"

collect_port_pids() {
  local out=""

  if command -v lsof >/dev/null 2>&1; then
    out="$(lsof -t -nP -iTCP:"${PORT_VALUE}" -sTCP:LISTEN 2>/dev/null || true)"
    if [[ -n "${out}" ]]; then
      printf '%s\n' "${out}"
      return
    fi
  fi

  if command -v ss >/dev/null 2>&1; then
    out="$(ss -ltnp "( sport = :${PORT_VALUE} )" 2>/dev/null | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' || true)"
    if [[ -n "${out}" ]]; then
      printf '%s\n' "${out}"
      return
    fi
  fi

  if command -v fuser >/dev/null 2>&1; then
    out="$(fuser -n tcp "${PORT_VALUE}" 2>/dev/null | tr ' ' '\n' | sed '/^$/d' || true)"
    if [[ -n "${out}" ]]; then
      printf '%s\n' "${out}"
    fi
  fi
}

collect_pattern_pids() {
  pgrep -u "$(id -u)" -f "${API_DIR}/\\.venv/bin/python.*-m app\\.worker|${API_DIR}/\\.venv/bin/python.*-m uvicorn app\\.main:app|${API_DIR}/\\.venv/bin/uvicorn app\\.main:app" || true
}

kill_pid_list() {
  local signal="$1"
  local pid_list="$2"
  while IFS= read -r pid; do
    [[ -z "${pid}" ]] && continue
    kill "-${signal}" "${pid}" >/dev/null 2>&1 || true
  done <<<"${pid_list}"
}

all_pids="$(printf '%s\n%s\n' "$(collect_port_pids)" "$(collect_pattern_pids)" | sed '/^$/d' | sort -u)"

if [[ -z "${all_pids}" ]]; then
  echo "Port ${PORT_VALUE} üzerinde çalışan backend bulunamadı."
  exit 0
fi

echo "Stopping backend pids: ${all_pids//$'\n'/ }"
kill_pid_list TERM "${all_pids}"
sleep 1

remaining="$(printf '%s\n%s\n' "$(collect_port_pids)" "$(collect_pattern_pids)" | sed '/^$/d' | sort -u)"
if [[ -n "${remaining}" ]]; then
  echo "Force stopping remaining pids: ${remaining//$'\n'/ }"
  kill_pid_list KILL "${remaining}"
  sleep 1
fi

final="$(printf '%s\n%s\n' "$(collect_port_pids)" "$(collect_pattern_pids)" | sed '/^$/d' | sort -u)"
if [[ -n "${final}" ]]; then
  echo "Backend süreçleri hala aktif: ${final//$'\n'/ }" >&2
  echo "Gerekirse: sudo fuser -k -n tcp ${PORT_VALUE}" >&2
  exit 1
fi

echo "Backend stopped on port ${PORT_VALUE}."
