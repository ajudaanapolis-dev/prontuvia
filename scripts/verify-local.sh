#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
npm run typecheck
npm test
npm run build

if command -v docker >/dev/null 2>&1; then
  docker compose config --quiet
  docker compose ps
fi

echo "Verificação local concluída."
