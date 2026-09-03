#!/bin/bash
cd "$(dirname "$0")"
echo "========================================================"
echo " Starting Eternity Valley..."
echo " Opening in your default browser: http://localhost:8000/"
echo "========================================================"

PORT=8000
if command -v python3 &>/dev/null; then
  python3 -m http.server $PORT &
  SERVER_PID=$!
elif command -v python &>/dev/null; then
  python -m SimpleHTTPServer $PORT &
  SERVER_PID=$!
elif command -v node &>/dev/null; then
  PORT=$PORT node server/server.js &
  SERVER_PID=$!
fi

sleep 1.2
open "http://localhost:$PORT/" 2>/dev/null || xdg-open "http://localhost:$PORT/" 2>/dev/null

wait $SERVER_PID
