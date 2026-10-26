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

running_services=$(docker compose ps --status running --services)
missing_services=()
for service in db api web nginx; do
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
docker compose up -d --force-recreate --no-deps nginx

for ((attempt = 1; attempt <= 12; attempt++)); do
    if curl -fsSLk --max-time 5 -o /dev/null http://localhost/api/health &&
        curl -fsSLk --max-time 5 -o /dev/null http://localhost/login; then
        echo "업데이트를 마쳤어요"
        exit 0
    fi
    if [ "$attempt" -lt 12 ]; then
        sleep 5
    fi
done
echo "응답 확인에 실패했어요. docker compose logs api web nginx를 확인하세요" >&2
exit 1
