#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage: ./start_expo.sh [expo_start_args...]

Starts Expo from apps/mobile with cache clear enabled.
All extra args are forwarded to: npx expo start

Examples:
  ./start_expo.sh
  ./start_expo.sh --tunnel
  ./start_expo.sh --ios
  ./start_expo.sh --port 19007
EOF
  exit 0
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="${ROOT_DIR}/apps/mobile"

cd "${MOBILE_DIR}"

EXTRA_ARGS=("$@")
HAS_CONNECTION_MODE=0
for arg in "${EXTRA_ARGS[@]}"; do
  case "${arg}" in
    --lan|--localhost|--tunnel)
      HAS_CONNECTION_MODE=1
      break
      ;;
  esac
done

if [[ "${HAS_CONNECTION_MODE}" -eq 0 ]]; then
  EXTRA_ARGS=(--lan "${EXTRA_ARGS[@]}")
fi

API_URL=""
if [[ -f ".env" ]]; then
  API_URL="$(grep -E '^EXPO_PUBLIC_API_URL=' .env | tail -n 1 | cut -d'=' -f2-)"
fi

if [[ -n "${API_URL}" ]]; then
  echo "Using EXPO_PUBLIC_API_URL=${API_URL}"
  HEALTH_URL="${API_URL%/api/v1}/health"
  if command -v curl >/dev/null 2>&1; then
    if curl -fsS --max-time 2 "${HEALTH_URL}" >/dev/null 2>&1; then
      echo "Backend reachable: ${HEALTH_URL}"
    else
      echo "Warning: Backend not reachable: ${HEALTH_URL}" >&2
    fi
  fi
fi

exec npx expo start -c "${EXTRA_ARGS[@]}"
