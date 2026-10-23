#!/usr/bin/env bash
set -euo pipefail
# Backups hold password hashes, locations and private diaries: owner-only.
umask 077

if [ "$#" -ne 1 ]; then
    echo "사용법: $0 <USB 마운트 폴더>" >&2
    exit 1
fi
dest=$(readlink -f "$1")
if ! mountpoint -q "$dest"; then
    echo "USB가 연결돼 있지 않아요" >&2
    exit 1
fi

script=$(readlink -f "$0")
cd "$(dirname "$script")/.."
exec 9>.maintenance.lock
if ! flock -n 9; then
    echo "다른 백업이나 복원이 진행 중이에요" >&2
    exit 1
fi
if ! docker compose ps --status running --services | grep -qx api; then
    echo "api가 꺼져 있어 백업하지 않아요" >&2
    exit 1
fi

restart_api() {
    local status=$?
    if ! docker compose start api || ! deploy/reload-nginx.sh; then
        echo "api를 다시 켜지 못했어요" >&2
        exit 1
    fi
    for ((attempt = 1; attempt <= 12; attempt++)); do
        if curl -fsSLk --max-time 5 http://localhost/api/health; then
            exit "$status"
        fi
        sleep 2
    done
    echo "api를 다시 켜지 못했어요" >&2
    exit 1
}
trap restart_api EXIT
docker compose stop api

stamp=$(date +%Y-%m-%d-%H%M%S)
partial="$dest/.dogwalk-$stamp.partial"
completed="$dest/dogwalk-$stamp"
if [ -e "$completed" ]; then
    echo "같은 시각의 백업이 이미 있어요" >&2
    exit 1
fi
mkdir "$partial"
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$partial/db.dump"
docker compose run --rm --no-deps -T api tar -czf - -C /app uploads private-uploads > "$partial/uploads.tar.gz"
mv "$partial" "$completed"
find "$dest" -mindepth 1 -maxdepth 1 -type d \( -name 'dogwalk-*' -o -name '.dogwalk-*.partial' \) -mtime +13 -exec rm -rf -- {} +
