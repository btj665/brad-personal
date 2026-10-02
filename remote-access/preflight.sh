#!/usr/bin/env bash
# Preflight checks for the MeshCentral + Cloudflare Tunnel stack.
# Run from the remote-access/ directory:  ./preflight.sh
# Catches the common "I forgot to fill something in" mistakes before you start.
set -uo pipefail

cd "$(dirname "$0")"
fail=0
ok()   { printf '  \033[32mOK\033[0m   %s\n' "$1"; }
warn() { printf '  \033[33mWARN\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31mFAIL\033[0m %s\n' "$1"; fail=1; }

echo "== Tooling =="
command -v docker >/dev/null && ok "docker present" || bad "docker not found"
docker compose version >/dev/null 2>&1 && ok "docker compose present" || bad "docker compose plugin not found"
docker info >/dev/null 2>&1 && ok "docker daemon reachable" || warn "docker daemon not reachable (start Docker before 'up')"

echo "== Secrets / config =="
if [ -f .env ]; then
  ok ".env exists"
  if grep -q '^CLOUDFLARE_TUNNEL_TOKEN=.\+' .env; then ok "tunnel token set"; else bad "CLOUDFLARE_TUNNEL_TOKEN is empty in .env"; fi
else
  bad ".env missing (cp .env.example .env and fill it in)"
fi

if grep -q 'REPLACE_WITH_YOUR_DOMAIN' meshcentral/config.json; then
  bad "meshcentral/config.json still has REPLACE_WITH_YOUR_DOMAIN (set your public hostname)"
else
  ok "meshcentral 'cert' domain looks set"
fi

echo "== Compose validity =="
CLOUDFLARE_TUNNEL_TOKEN="${CLOUDFLARE_TUNNEL_TOKEN:-preflight-dummy}" \
  docker compose config --quiet >/dev/null 2>&1 && ok "docker-compose.yml renders" || bad "docker-compose.yml failed to render"

echo
if [ "$fail" -eq 0 ]; then
  echo -e "\033[32mPreflight passed.\033[0m  Start with:  docker compose up -d  &&  docker compose logs -f meshcentral"
else
  echo -e "\033[31mPreflight found problems above — fix them before 'docker compose up -d'.\033[0m"
fi
exit "$fail"
