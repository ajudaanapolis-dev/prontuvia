#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Arquivo .env criado. Troque BOOTSTRAP_ADMIN_PASSWORD e os segredos antes de usar dados reais."
fi

npm install
docker compose up -d postgres redis minio medplum-postgres medplum-redis medplum-server medplum-console
npm run db:migrate

if [[ "${1:-}" == "--bootstrap" ]]; then
  npm run db:bootstrap
fi

echo "Base pronta. Inicie tudo com: npm run dev:integrated"
