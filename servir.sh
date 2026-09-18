#!/usr/bin/env bash
# Sirve el proyecto por HTTP. Es imprescindible: abierto como file:// o content://
# el navegador bloquea las llamadas a la API de traducción.
#
#   ./servir.sh          → http://localhost:8000/lector-bilingue.html
#   ./servir.sh 3000     → otro puerto
#
# Para probarlo desde el celular en la misma red wifi, usa la IP que imprime abajo.

set -e
PUERTO="${1:-8000}"
cd "$(dirname "$0")"

IP=$(hostname -I 2>/dev/null | awk '{print $1}' || ipconfig getifaddr en0 2>/dev/null || echo "")

echo "Lector bilingüe"
echo "  local:  http://localhost:${PUERTO}/lector-bilingue.html"
[ -n "$IP" ] && echo "  wifi:   http://${IP}:${PUERTO}/lector-bilingue.html"
echo
echo "Ctrl+C para parar."
echo

python3 -m http.server "$PUERTO"
