#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "==> Git pull"
git pull origin main

echo "==> Actualizando sync-server"
cp server/sync-server.mjs sync-server.mjs
sudo systemctl restart pinturas-sync

echo "==> Build produccion"
VITE_SYNC_TOKEN="${VITE_SYNC_TOKEN:?Falta VITE_SYNC_TOKEN como variable de entorno}" npm run build

echo "==> Verificando token embebido"
if grep -l "$VITE_SYNC_TOKEN" dist/assets/*.js >/dev/null 2>&1; then
  echo "OK: token presente en el bundle"
else
  echo "ADVERTENCIA: no se encontro el token en el bundle"
fi

echo "==> Salud del API"
curl -s https://pinturas-pos.duckdns.org/health
echo

echo "==> Deploy completo."