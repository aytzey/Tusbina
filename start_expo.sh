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
ROOT_NODE_MODULES="${ROOT_DIR}/node_modules"
MOBILE_NODE_MODULES="${MOBILE_DIR}/node_modules"

clean_stale_mobile_node_modules() {
  if [[ ! -d "${MOBILE_NODE_MODULES}" || ! -d "${ROOT_NODE_MODULES}" ]]; then
    return
  fi

  local mismatches
  mismatches="$(
    node - "${ROOT_DIR}" "${MOBILE_DIR}" <<'NODE'
const fs = require('fs');
const path = require('path');

const rootDir = process.argv[2];
const mobileDir = process.argv[3];
const packages = [
  'expo-apple-authentication',
  'expo-auth-session',
  'expo-crypto',
  'expo-web-browser',
];

const mismatches = [];

for (const pkg of packages) {
  const rootPkgPath = path.join(rootDir, 'node_modules', pkg, 'package.json');
  const mobilePkgPath = path.join(mobileDir, 'node_modules', pkg, 'package.json');

  if (!fs.existsSync(rootPkgPath) || !fs.existsSync(mobilePkgPath)) {
    continue;
  }

  const rootVersion = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8')).version;
  const mobileVersion = JSON.parse(fs.readFileSync(mobilePkgPath, 'utf8')).version;

  if (rootVersion !== mobileVersion) {
    mismatches.push(`${pkg}\t${mobileVersion}\t${rootVersion}`);
  }
}

if (mismatches.length > 0) {
  process.stdout.write(mismatches.join('\n'));
}
NODE
  )"

  if [[ -n "${mismatches}" ]]; then
    echo "Detected stale Expo modules under apps/mobile/node_modules:"

    while IFS=$'\t' read -r package_name mobile_version root_version; do
      [[ -n "${package_name}" ]] || continue
      echo "${package_name}: mobile=${mobile_version}, root=${root_version}"
      rm -rf "${MOBILE_NODE_MODULES}/${package_name}"
      echo "Removed ${MOBILE_NODE_MODULES}/${package_name}; Expo will resolve ${package_name} from ${ROOT_NODE_MODULES}."
    done <<< "${mismatches}"
  fi
}

clean_stale_mobile_node_modules

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
