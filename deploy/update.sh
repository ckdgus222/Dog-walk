#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 0 ]; then
    echo "사용법: $0" >&2
    exit 1
fi

script=$(readlink -f "$0")
cd "$(dirname "$script")/.."
exec 9>.maintenance.lock
if ! flock -n 9; then
    echo "다른 백업이나 복원이 진행 중이에요" >&2
    exit 1
fi
source deploy/ingress.sh
load_ingress

running_services=$(docker compose ps --status running --services)
missing_services=()
services=(db api web)
if [[ "$INGRESS_HOST" == container ]]; then
    services+=(nginx)
fi
for service in "${services[@]}"; do
    if ! grep -qx "$service" <<< "$running_services"; then
        missing_services+=("$service")
    fi
done
if [ "${#missing_services[@]}" -ne 0 ]; then
    echo "꺼진 서비스가 있어 업데이트하지 않아요: ${missing_services[*]}" >&2
    exit 1
fi

git pull --ff-only
docker compose up -d --build
# Recreate rather than reload: nginx configs are single-file mounts, so after
# git pull replaces them a running container (and its reload) keeps the old
# files. A new container also picks up the new api and web addresses.
if [[ "$INGRESS_HOST" == container ]]; then
    docker compose up -d --force-recreate --no-deps nginx
fi

for ((attempt = 1; attempt <= 12; attempt++)); do
    if check_site; then
        echo "업데이트를 마쳤어요"
        exit 0
    fi
    if [ "$attempt" -lt 12 ]; then
        sleep 5
    fi
done
echo "응답 확인에 실패했어요. docker compose logs ${services[*]:1}를 확인하세요" >&2
exit 1
