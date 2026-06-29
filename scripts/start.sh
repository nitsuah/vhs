#!/usr/bin/env bash
# start.sh — port-adaptive launcher for VHS Shelf Scanner
# Skips 3000, 7000, and any port already in use; tries 8080+ by default.
#
# GPU mode (native Windows Ollama with AMD DirectML or NVIDIA):
#   Install Ollama, pull the model, then:
#   OLLAMA_UPSTREAM=http://host.docker.internal:11434 ./start.sh --profile gpu --scale ollama=0 --scale ollama-pull=0
#   or simply:  docker compose --profile gpu up web-gpu --build
set -e

# Guard: .env must exist and contain DATABASE_URL
if [ ! -f .env ]; then
  echo "  ✗ .env file not found."
  echo "    Copy .env.example to .env and fill in your Neon DATABASE_URL."
  exit 1
fi
if ! grep -qE '^DATABASE_URL=postgresql://' .env; then
  echo "  ✗ DATABASE_URL not set in .env (must start with postgresql://)."
  echo "    Get your connection string from https://console.neon.tech"
  exit 1
fi

MODEL="${OLLAMA_MODEL:-llava:7b}"

find_port() {
  python3 - <<'PY'
import socket, sys
skip = {3000, 7000}
for port in range(8080, 9000):
    if port in skip:
        continue
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(0.05)
        s.connect(("localhost", port))
        s.close()
    except OSError:
        print(port)
        sys.exit(0)
sys.exit(1)
PY
}

PORT=$(find_port 2>/dev/null) || PORT=8095
export APP_PORT="$PORT"
export OLLAMA_MODEL="$MODEL"

echo ""
echo "  ██╗   ██╗██╗  ██╗███████╗"
echo "  ██║   ██║██║  ██║██╔════╝"
echo "  ██║   ██║███████║███████╗"
echo "  ╚██╗ ██╔╝██╔══██║╚════██║"
echo "   ╚████╔╝ ██║  ██║███████║"
echo "    ╚═══╝  ╚═╝  ╚═╝╚══════╝  Shelf Scanner"
echo ""
echo "  ▶ App port:    $APP_PORT"
echo "  ▶ AI model:    $OLLAMA_MODEL"
echo ""
echo "  First run: Ollama will download ~4.7 GB for llava:7b"
echo "  Subsequent runs: model is cached, starts instantly."
echo ""

docker compose --env-file .env up --build --force-recreate "$@"

echo ""
echo "  ✓ Running at http://localhost:$APP_PORT"
