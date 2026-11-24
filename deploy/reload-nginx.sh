#!/usr/bin/env bash
set -euo pipefail

script=$(readlink -f "$0")
cd "$(dirname "$script")/.."
source deploy/ingress.sh
load_ingress
reload_app_proxy
