#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "==> Git pull"
git checkout -- '.' 2>/dev/null || true
git pull origin main

echo "==> Actualizando sync-server"
# Copia los archivos del servidor al directorio de trabajo del servicio
cp server/sync-server.mjs server/sync-core.mjs /home/ubuntu/puntoVenta_pinturas/
sudo systemctl restart pinturas-sync

echo "==> Build produccion"
# Ya no se usa VITE_SYNC_TOKEN — la auth usa el hash del PIN.
# Si tienes un SYNC_TOKEN maestro en el servidor, configúralo en el
# entorno del servicio systemd, NO aquí.
npm run build

echo "==> Salud del API"
curl -s https://pinturas-pos.duckdns.org/health
echo

echo "==> Deploy completo."