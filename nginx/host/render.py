#!/usr/bin/env python3
"""Render one Dogwalk site to stdout without accessing certificates or live settings."""
import argparse
import re
from pathlib import Path, PurePosixPath


def domain(value):
    labels = value.split(".")
    if len(value) > 253 or len(labels) < 2 or not all(
        re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label)
        for label in labels
    ):
        raise argparse.ArgumentTypeError("expected a lowercase DNS name")
    return value


def certificate_name(value):
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9.-]{0,126}", value):
        raise argparse.ArgumentTypeError("expected a Certbot certificate name")
    return value


def public_directory(value):
    path = PurePosixPath(value)
    if (len(path.parts) < 4 or path.parts[:2] != ("/", "srv")
            or str(path) != value or ".." in path.parts
            or not re.fullmatch(r"/[a-zA-Z0-9/_-]+", value)):
        raise argparse.ArgumentTypeError("expected a dedicated directory under /srv/<site>/")
    return value


def port(value):
    if not re.fullmatch(r"[0-9]{1,5}", value) or not 1024 <= int(value) <= 65535:
        raise argparse.ArgumentTypeError("expected a port from 1024 to 65535")
    return str(int(value))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--domain", required=True, type=domain)
    parser.add_argument("--cert-name", required=True, type=certificate_name)
    parser.add_argument("--acme-root", required=True, type=public_directory)
    parser.add_argument("--uploads-root", required=True, type=public_directory)
    parser.add_argument("--api-port", required=True, type=port)
    parser.add_argument("--web-port", required=True, type=port)
    parser.add_argument("--candidate", nargs=2, type=port, metavar=("HTTP_PORT", "HTTPS_PORT"),
                        help="bind both listeners exclusively to loopback for rehearsal")
    args = parser.parse_args()
    ports = [args.api_port, args.web_port, *(args.candidate or ())]
    if len(ports) != len(set(ports)):
        parser.error("API, web and candidate ports must be distinct")
    acme, uploads = (PurePosixPath(p) for p in (args.acme_root, args.uploads_root))
    if acme == uploads or acme in uploads.parents or uploads in acme.parents:
        parser.error("ACME and public uploads must be separate directories")

    if args.candidate:
        http, https = args.candidate
        listeners = (f"listen 127.0.0.1:{http};", f"listen 127.0.0.1:{https} ssl;")
    else:
        listeners = ("listen 80;\n    listen [::]:80;", "listen 443 ssl;\n    listen [::]:443 ssl;")
    redirect_host = f"{args.domain}:{args.candidate[1]}" if args.candidate else args.domain
    values = dict(DOMAIN=args.domain, REDIRECT_HOST=redirect_host, CERT_NAME=args.cert_name, ACME_ROOT=args.acme_root,
                  UPLOADS_ROOT=args.uploads_root, API_PORT=args.api_port, WEB_PORT=args.web_port,
                  HTTP_LISTEN=listeners[0], HTTPS_LISTEN=listeners[1])
    source = Path(__file__).with_name("site.conf.in").read_text(encoding="utf-8")
    rendered = re.sub(r"@([A-Z_]+)@", lambda match: values[match.group(1)], source)
    if "@" in rendered:
        parser.error("unresolved template value")
    print(rendered, end="")


if __name__ == "__main__":
    main()
