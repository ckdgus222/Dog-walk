#!/usr/bin/env bash
set -euo pipefail

script=$(readlink -f "$0")
cd "$(dirname "$script")/.."
docker compose exec -T nginx nginx -s reload
