#!/usr/bin/env python3
"""Test the production template with two loopback upstreams in an isolated Linux namespace."""
import json
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
DOMAIN = "dog.example.test"

# Synthetic upstreams implement Dogwalk's HTTP, identity, and upgrade contracts.
# The client connects to the loopback-only candidate inside the same namespace.
PROBE = r"""
const assert = require('node:assert/strict');
const http = require('node:http');
const https = require('node:https');
const { once } = require('node:events');
const { createHash, randomBytes } = require('node:crypto');
const websocketAccept = key => createHash('sha1')
  .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
const { readFileSync } = require('node:fs');
const ca = readFileSync('/fixture-ca.pem');
const host = 'dog.example.test';

function request(path, secure = true, headers = {}, servername = host) {
  return new Promise((resolve, reject) => {
    const options = { hostname: '127.0.0.1', servername, ca, port: secure ? 18443 : 18080,
      path, headers: { host, ...headers }, timeout: 4000 };
    const req = (secure ? https : http).get(options, response => {
      let body = '';
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ body, code: response.statusCode, headers: response.headers }));
    });
    req.on('upgrade', (res, socket) => { socket.destroy(); resolve({code: res.statusCode, headers: res.headers}); });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('test request timed out')));
  });
}

const web = http.createServer((req, res) => {
  if (req.url === '/login') return res.end('<title>옆집 강아지</title>');
  res.writeHead(404).end('unknown page');
});
const api = http.createServer((req, res) => {
  if (req.url === '/api/health') {
    return res.end(JSON.stringify([req.headers.host, req.headers['x-forwarded-for'],
      req.headers['x-forwarded-proto']]));
  }
  res.writeHead(404).end();
});
api.on('upgrade', (req, socket) => {
  assert.equal(req.url, '/socket.io/?EIO=4&transport=websocket');
  assert.equal(req.headers.upgrade, 'websocket');
  assert.equal(req.headers['x-forwarded-for'], '127.0.0.1');
  assert.equal(req.headers['sec-websocket-version'], '13');
  const accept = websocketAccept(req.headers['sec-websocket-key']);
  socket.end('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n');
});
(async () => {
  const bound = [api, web].map(server => once(server, 'listening'));
  api.listen(14000, '127.0.0.1'); web.listen(13000, '127.0.0.1');
  await Promise.all(bound);
  try {
    let res = await request('/login', false);
    assert.equal(res.code, 301);
    assert.equal(res.headers.location, 'https://' + host + ':18443/login');
    assert.equal((await request('/.well-known/acme-challenge/probe', false)).body, 'challenge');
    assert.equal((await request('/login')).body, '<title>옆집 강아지</title>');
    res = await request('/api/health', true, {'X-Forwarded-For': '192.0.2.25'});
    assert.deepEqual(JSON.parse(res.body), [host, '127.0.0.1', 'https']);
    const key = randomBytes(16).toString('base64');
    res = await request('/socket.io/?EIO=4&transport=websocket', true, {
      Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13',
      'Sec-WebSocket-Key': key, 'X-Forwarded-For': '192.0.2.25',
    });
    assert.equal(res.code, 101);
    assert.equal(res.headers['sec-websocket-accept'], websocketAccept(key));
    assert.equal((await request('/api/upload', true, { 'content-length': 30 * 1024 * 1024 + 1 })).code, 413);
    res = await request('/uploads/example.jpg');
    assert.equal(res.body, 'public');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal((await request('/uploads/private.jpg')).code, 404);
    assert.equal((await request('/private-uploads/private.jpg')).code, 404);
    assert.equal((await request('/uploads/linked.jpg')).code >= 400, true);
    await assert.rejects(request('/api/health', true, {host: 'unknown.example.test'}));
    assert.equal((await request('/api/health', true, {}, 'second.example.test')).code, 421);
    console.log('Dogwalk candidate: TLS, redirect, ACME, pages, API, headers, WebSocket 101 and public-only photos passed');
  } finally {
    web.close(); api.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
"""


def command(*args, **options):
    return subprocess.run(args, check=True, **options)


def main():
    renderer = [sys.executable, str(ROOT / 'nginx/host/render.py')]
    options = {'--domain': DOMAIN, '--cert-name': 'fixture', '--acme-root': '/srv/test/acme',
               '--uploads-root': '/srv/test/photos', '--api-port': '14000', '--web-port': '13000'}
    def render(values, *extra, check=True):
        args = [item for pair in values.items() for item in pair]
        return subprocess.run(renderer + args + list(extra), capture_output=True, check=check)
    for key, value in [('--domain', 'dog.example.test\n'), ('--api-port','80'),
                       ('--uploads-root','/etc'), ('--acme-root','/srv/test/../private'),
                       ('--web-port','14000'), ('--cert-name','../other')]:
        bad = render({**options, key: value}, check=False)
        assert bad.returncode and not bad.stdout
    normal = render(options).stdout
    assert b'listen [::]:443 ssl;' in normal and b'return 301 https://dog.example.test$request_uri' in normal
    config = command('docker','compose','--env-file','.env.example','-f','docker-compose.yml','-f',
                     'docker-compose.host.yml','config','--format','json', cwd=ROOT,
                     env={**os.environ, 'COMPOSE_PROFILES':'', 'SITE_URL':'https://'+DOMAIN,
                          'DOGWALK_API_PORT':'14000','DOGWALK_WEB_PORT':'13000'},
                     stdout=subprocess.PIPE).stdout
    services = json.loads(config)['services']
    assert 'nginx' not in services and services['api']['environment']['COOKIE_SECURE']=='true'
    for service, port in [('api',14000),('web',13000)]:
        ports=services[service]['ports']
        assert len(ports)==1 and ports[0]['host_ip']=='127.0.0.1' and int(ports[0]['published'])==port
    assert {v['source'] for v in services['api']['volumes']}=={'public-uploads','private-uploads'}
    name = 'dw-ingress-'+uuid4().hex[:10]
    with TemporaryDirectory() as temp:
        d = Path(temp)
        certs = d/'certs'
        certs.mkdir()
        cert = certs/'fullchain.pem'
        key = certs/'privkey.pem'
        cfg = d/'cert.cfg'
        cfg.write_text('[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=ext\n[dn]\nCN='
                       +DOMAIN+'\n[ext]\nsubjectAltName=DNS:'+DOMAIN+',DNS:second.example.test\n')
        command('openssl','req','-new','-x509','-newkey','rsa:2048','-nodes','-config',str(cfg),
                '-days','1','-keyout',str(key),'-out',str(cert),stderr=subprocess.DEVNULL)
        fixture=d/'public'
        challenge=fixture/'acme/.well-known/acme-challenge'
        challenge.mkdir(parents=True)
        (challenge/'probe').write_text('challenge')
        photos=fixture/'photos'
        photos.mkdir()
        private = fixture/'private-uploads'
        private.mkdir()
        (private/'private.jpg').write_text('private fixture')
        (photos/'example.jpg').write_text('public')
        (photos/'linked.jpg').symlink_to('/srv/test/acme/.well-known/acme-challenge/probe')
        conf=d/'site.conf'
        conf.write_bytes(render(options,'--candidate','18080','18443').stdout)
        command('docker','run','-d','--rm','--name',name,'--network','none','-v',
                str(conf)+':/etc/nginx/conf.d/default.conf:ro','-v',str(certs)+':/etc/letsencrypt/live/fixture:ro',
                '-v',str(fixture)+':/srv/test:ro','nginx:stable-alpine',stdout=subprocess.DEVNULL)
        try:
            command('docker','exec',name,'nginx','-t')
            command('docker','run','--rm','-i','--network','container:'+name,'-v',str(cert)+':/fixture-ca.pem:ro',
                    'node:24-bookworm-slim','node','-',input=PROBE.encode(),timeout=30)
        finally:
            command('docker','rm','-f',name,stdout=subprocess.DEVNULL)


if __name__ == '__main__':
    main()
