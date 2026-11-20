#!/bin/sh
cd "$(dirname "$0")"
command -v node >/dev/null 2>&1 || { echo "Install Node.js 18+ first (https://nodejs.org)"; exit 1; }
[ -d node_modules/ws ] || npm install --omit=dev
exec node server.js
