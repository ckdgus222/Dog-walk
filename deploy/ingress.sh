#!/usr/bin/env bash
# Called from the project root. Compose resolves .env, shell overrides, and the
# selected files; only the public hostname leaves the command pipeline.
load_ingress() {
    local origin
    origin=$(docker compose config --format json | python3 -c '
import json, re, sys
config = json.load(sys.stdin)
label = config["services"]["api"].get("labels", {}).get("io.dogwalk.ingress-origin")
if label is None:
    print("container")
else:
    if "nginx" in config["services"]:
        sys.exit("Disable the legacy nginx profile in host ingress mode.")
    match = re.fullmatch(r"https://(([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)/?", label)
    if not match or len(match[1]) > 253:
        sys.exit("Host ingress requires an HTTPS SITE_URL with a lowercase DNS name.")
    print(match[1])
') || return 1
    INGRESS_HOST=$origin
}

# Legacy deployment uses the Docker proxy. Host ingress uses fixed loopback
# ports, so API restarts do not require a privileged nginx reload.
reload_app_proxy() {
    if [[ "$INGRESS_HOST" == container ]]; then
        docker compose exec -T nginx nginx -s reload
    fi
}

host_get() {
    curl --disable --noproxy '*' --proto '=https' --fail --silent --show-error --location --max-redirs 0 \
        --max-time 5 --resolve "$INGRESS_HOST:443:127.0.0.1" "https://$INGRESS_HOST$1"
}

check_api() {
    if [[ "$INGRESS_HOST" == container ]]; then
        curl -fsSLk --max-time 5 http://localhost/api/health
        return
    fi
    host_get /api/health | python3 -c '
import json, sys
try:
    ok = json.load(sys.stdin) == {"status": "ok", "db": "up"}
except (ValueError, UnicodeError):
    ok = False
sys.exit(0 if ok else 1)
'
}

check_site() {
    if [[ "$INGRESS_HOST" == container ]]; then
        curl -fsSLk --max-time 5 -o /dev/null http://localhost/api/health &&
            curl -fsSLk --max-time 5 -o /dev/null http://localhost/login
        return
    fi
    check_api && host_get /login | grep -F '<title>옆집 강아지</title>' > /dev/null
}

check_restored_service() {
    if [[ "$INGRESS_HOST" == container ]]; then
        check_api
    else
        check_site
    fi
}

check_boot_service() {
    if [[ "$INGRESS_HOST" != container ]]; then
        host_get /uploads/dogwalk-volume-v1.png | cmp -s deploy/dogwalk-volume-v1.png - || return 1
    fi
    check_restored_service
}
