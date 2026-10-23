#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
    echo "사용법: $0 <백업 폴더>" >&2
    exit 1
fi
B=$(readlink -f "$1")
if [[ "$B" == *.partial ]]; then
    echo "다 끝나지 않은 백업이에요" >&2
    exit 1
fi

script=$(readlink -f "$0")
cd "$(dirname "$script")/.."
exec 9>.maintenance.lock
if ! flock -n 9; then
    echo "다른 백업이나 복원이 진행 중이에요" >&2
    exit 1
fi

report_failure() {
    local status=$?
    if [ "$status" -ne 0 ]; then
        echo "복원하지 못했어요. 원인을 고친 뒤 다시 실행하세요" >&2
    fi
}
trap report_failure EXIT

# The signing keys are replaced after the restore, so check they can be found
# before deleting anything.
for key in JWT_ACCESS_SECRET JWT_REFRESH_SECRET; do
    if [ "$(grep -c "^$key=" .env)" -ne 1 ]; then
        echo ".env에 $key 줄이 하나 있어야 해요" >&2
        exit 1
    fi
done

# Read both complete archives before stopping the app or deleting any data.
tar -tzf "$B/uploads.tar.gz" > /dev/null
docker compose exec -T db pg_restore --file=/dev/null < "$B/db.dump"
echo "현재 데이터가 지워져요. 계속하려면 restore를 입력하세요"
read -r confirmation
if [ "$confirmation" != restore ]; then
    exit 1
fi

docker compose stop api web
docker compose exec -T db sh -c 'dropdb -U "$POSTGRES_USER" "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --single-transaction --exit-on-error' < "$B/db.dump"
docker compose run --rm --no-deps -T api sh -c 'rm -rf /app/uploads/* /app/private-uploads/* && tar -xzf - -C /app' < "$B/uploads.tar.gz"

# The restored database hands out user ids again, so a token issued before the
# restore could sign in as someone else. New signing keys log everyone out.
umask 077
awk -v access="$(openssl rand -hex 32)" -v refresh="$(openssl rand -hex 32)" '
    /^JWT_ACCESS_SECRET=/ { print "JWT_ACCESS_SECRET=" access; next }
    /^JWT_REFRESH_SECRET=/ { print "JWT_REFRESH_SECRET=" refresh; next }
    { print }
' .env > .env.new
mv .env.new .env
# up -d recreates api so it reads the new keys; start would keep the old ones.
docker compose up -d api web
deploy/reload-nginx.sh
for ((attempt = 1; attempt <= 12; attempt++)); do
    if curl -fsSLk --max-time 5 http://localhost/api/health; then
        exit 0
    fi
    sleep 2
done
echo "앱이 응답하지 않아요" >&2
exit 1
