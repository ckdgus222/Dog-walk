#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
    echo "사용법: $0 <USB 마운트 폴더>" >&2
    exit 1
fi

status=0
if ! dest=$(readlink -f "$1"); then
    status=1
fi

script=$(readlink -f "$0")
cd "$(dirname "$script")/.."

echo "앱 준비 확인 시작"
for ((attempt = 1; attempt <= 60; attempt++)); do
    if curl -fsSLk --max-time 5 http://localhost/api/health; then
        break
    fi
    if [ "$attempt" -lt 60 ]; then
        sleep 5
    fi
done
if [ "$attempt" -gt 60 ]; then
    echo "앱이 준비되지 않아 백업과 초기화를 하지 않아요" >&2
    exit 1
fi
echo "앱 준비 확인 성공"

echo "백업 시작"
backup_result="USB 경로를 확인하지 못해 백업 실패: 백업을 건너뛰어요"
if [ "$status" -eq 0 ]; then
    backup_result="백업 성공"
    if ! deploy/backup.sh "$dest"; then
        backup_result="백업 실패: 데모 초기화는 계속해요"
        status=1
    fi
fi
echo "$backup_result"

echo "데모 초기화 시작"
exec 9>.maintenance.lock
if ! flock -n 9; then
    echo "다른 백업이나 복원이 진행 중이라 초기화하지 않아요" >&2
    exit 1
fi
if ! docker compose exec -T api node dist/demo/reset-demo.main.js; then
    echo "데모 초기화 실패" >&2
    exit 1
fi
echo "데모 초기화 성공"
exit "$status"
