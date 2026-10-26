import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../../deploy/', import.meta.url));

// Only copied scripts run here. Docker, git, mountpoint, flock, curl, and sleep
// are replaced so these tests cannot stop or restore the shared Docker stack.
const fakeCommand = `#!/usr/bin/env bash
set -euo pipefail
command=$(basename "$0")
printf '%s|%s|%s\\n' "$PWD" "$command" "$*" >> "$TEST_LOG"
case "$command" in
  mountpoint) [ "$SCENARIO" != unmounted ]; exit $? ;;
  flock) [ "$SCENARIO" != locked ]; exit $? ;;
  sleep) exit 0 ;;
  curl)
    case "$SCENARIO:$*" in
      unhealthy:*|update-health-failed:*api/health|update-login-failed:*login) exit 1 ;;
      update-retry:*login)
        if [ ! -e "$TEST_ROOT/retried" ]; then
          touch "$TEST_ROOT/retried"
          exit 1
        fi ;;
    esac
    exit 0 ;;
  git)
    [ "$*" = 'pull --ff-only' ] || exit 99
    [ "$SCENARIO" != update-pull-failed ]; exit $? ;;
  date) echo 2026-11-01-040000; exit 0 ;;
esac
case "$*" in
  'compose ps --status running --services')
    case "$SCENARIO" in
      update-ps-failed) exit 1 ;;
      update-stopped-*)
        for service in db api web nginx; do
          if [ "$SCENARIO" != "update-stopped-$service" ]; then echo "$service"; fi
        done
        exit 0 ;;
      update-*) printf 'db\\napi\\nweb\\nnginx\\n'; exit 0 ;;
    esac
    if [ "$SCENARIO" != stopped ]; then echo api; fi ;;
  'compose up -d --build')
    [ "$SCENARIO" != update-build-failed ] ;;
  'compose up -d --force-recreate --no-deps nginx')
    [ "$SCENARIO" != update-nginx-failed ] ;;
  'compose stop api'|'compose stop api web')
    [ "$SCENARIO" != stop-failed ] ;;
  'compose start api'|'compose up -d api web')
    [ "$SCENARIO" != start-failed ] ;;
  'compose exec -T nginx nginx -s reload')
    [ "$SCENARIO" != reload-failed ] ;;
  *pg_dump*)
    [ "$SCENARIO" != dump-failed ] || exit 7
    echo database-dump ;;
  'compose run --rm --no-deps -T api tar -czf - -C /app uploads private-uploads')
    [ "$SCENARIO" != archive-failed ] || exit 8
    cat "$TEST_ARCHIVE" ;;
  'compose exec -T db pg_restore --file=/dev/null')
    [ "$SCENARIO" != corrupt-dump ] || exit 9
    [ "$(cat)" = database-dump ] ;;
  *dropdb*)
    [ "$SCENARIO" != create-failed ] ;;
  *pg_restore*)
    cat > "$TEST_ROOT/restored.dump"
    [ "$SCENARIO" != restore-failed ] ;;
  *'tar -xzf'*)
    cat > "$TEST_ROOT/restored.tar.gz"
    [ "$SCENARIO" != extract-failed ] ;;
  *) echo "Unexpected docker command: $*" >&2; exit 99 ;;
esac
`;

const envFile = [
  'POSTGRES_DB=dogwalk',
  'JWT_ACCESS_SECRET=old-access',
  'JWT_REFRESH_SECRET=old-refresh',
  'COMPOSE_FILE=docker-compose.yml:docker-compose.https.yml',
  '',
].join('\n');

describe('deployment scripts', () => {
  let root: string;
  let repo: string;
  let backup: string;
  let bin: string;
  let archive: string;
  let log: string;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'dogwalk-deploy-test-')));
    repo = join(root, 'repo');
    backup = join(root, 'usb', 'dogwalk-saved');
    bin = join(root, 'bin');
    archive = join(root, 'uploads.tar.gz');
    log = join(root, 'commands.log');
    for (const dir of [
      join(repo, 'deploy'),
      backup,
      bin,
      join(root, 'uploads'),
      join(root, 'private-uploads'),
    ]) {
      mkdirSync(dir, { recursive: true });
    }
    for (const name of [
      'backup.sh',
      'restore.sh',
      'reload-nginx.sh',
      'update.sh',
    ]) {
      copyFileSync(join(source, name), join(repo, 'deploy', name));
    }
    for (const name of [
      'docker',
      'git',
      'mountpoint',
      'flock',
      'curl',
      'sleep',
      'date',
    ]) {
      writeFileSync(join(bin, name), fakeCommand, { mode: 0o755 });
    }
    writeFileSync(join(root, 'uploads', 'dog.jpg'), 'public photo');
    writeFileSync(join(root, 'private-uploads', 'diary.jpg'), 'private photo');
    const tar = spawnSync('tar', [
      '-czf',
      archive,
      '-C',
      root,
      'uploads',
      'private-uploads',
    ]);
    expect(tar.status).toBe(0);
    copyFileSync(archive, join(backup, 'uploads.tar.gz'));
    writeFileSync(join(backup, 'db.dump'), 'database-dump\n');
    writeFileSync(log, '');
    writeFileSync(join(repo, '.env'), envFile);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function run(
    name: string,
    scenario = 'success',
    args?: string[],
    cwd = root,
    input = 'restore\n',
  ) {
    return spawnSync(
      'bash',
      [
        join(repo, 'deploy', name),
        ...(args ?? [name === 'backup.sh' ? dirname(backup) : backup]),
      ],
      {
        cwd,
        input,
        encoding: 'utf8',
        timeout: 10_000,
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          SCENARIO: scenario,
          TEST_LOG: log,
          TEST_ROOT: root,
          TEST_ARCHIVE: archive,
        },
      },
    );
  }

  function commands() {
    return readFileSync(log, 'utf8');
  }

  it('backs up both archives outside the repository and restarts before checking health', () => {
    const result = run('backup.sh', 'success', ['.'], dirname(backup));
    expect(result.status, result.stderr).toBe(0);
    const completed = join(dirname(backup), 'dogwalk-2026-11-01-040000');
    expect(readdirSync(completed).sort()).toEqual([
      'db.dump',
      'uploads.tar.gz',
    ]);
    // The test process uses the usual 022 umask, so these modes come from the script.
    expect(statSync(completed).mode & 0o777).toBe(0o700);
    for (const file of ['db.dump', 'uploads.tar.gz']) {
      expect(statSync(join(completed, file)).mode & 0o777).toBe(0o600);
    }
    expect(readFileSync(join(completed, 'db.dump'), 'utf8')).toBe(
      'database-dump\n',
    );
    expect(readFileSync(join(completed, 'uploads.tar.gz'))).toEqual(
      readFileSync(archive),
    );
    expect(existsSync(join(repo, 'db.dump'))).toBe(false);
    expect(existsSync(join(repo, 'uploads.tar.gz'))).toBe(false);
    expect(existsSync(join(repo, '.maintenance.lock'))).toBe(true);
    expect(commands()).toContain(`${repo}|flock|-n 9`);
    expect(commands()).toMatch(
      /compose stop api[\s\S]*pg_dump[\s\S]*tar -czf[\s\S]*compose start api[\s\S]*nginx -s reload[\s\S]*curl/,
    );
  });

  it.each(['dump-failed', 'archive-failed'])(
    'keeps incomplete backups partial and restarts the API after %s',
    (scenario) => {
      const result = run('backup.sh', scenario);
      expect(result.status).not.toBe(0);
      expect(readdirSync(dirname(backup))).toContain(
        '.dogwalk-2026-11-01-040000.partial',
      );
      expect(readdirSync(dirname(backup))).not.toContain(
        'dogwalk-2026-11-01-040000',
      );
      expect(commands()).toContain('compose start api');
      expect(commands()).toContain('nginx -s reload');
      expect(commands()).toContain(
        'curl|-fsSLk --max-time 5 http://localhost/api/health',
      );
    },
  );

  it.each(['start-failed', 'reload-failed'])(
    'reports a failed backup if recovery fails at %s',
    (scenario) => {
      const result = run('backup.sh', scenario);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('api를 다시 켜지 못했어요');
      expect(commands()).not.toContain('|curl|');
    },
  );

  it.each(['backup.sh', 'restore.sh'])(
    '%s makes twelve bounded health checks and fails when the app stays unhealthy',
    (name) => {
      const result = run(name, 'unhealthy');
      expect(result.status).toBe(1);
      const checks = commands()
        .split('\n')
        .filter((line) => line.includes('|curl|'));
      expect(checks).toHaveLength(12);
      for (const check of checks) {
        expect(check).toContain(
          '-fsSLk --max-time 5 http://localhost/api/health',
        );
      }
      expect(result.stderr).toContain(
        name === 'backup.sh'
          ? 'api를 다시 켜지 못했어요'
          : '앱이 응답하지 않아요',
      );
    },
  );

  it('leaves a stopped API stopped and makes no backup', () => {
    const result = run('backup.sh', 'stopped');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('api가 꺼져 있어 백업하지 않아요');
    expect(commands()).not.toMatch(/compose (stop|start|run)|pg_dump/);
    expect(readdirSync(dirname(backup))).toEqual(['dogwalk-saved']);
  });

  it('rejects an unmounted USB before touching Docker', () => {
    const result = run('backup.sh', 'unmounted');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('USB가 연결돼 있지 않아요');
    expect(commands()).not.toContain('|docker|');
  });

  it.each(['backup.sh', 'restore.sh'])(
    '%s refuses a held repository lock before touching Docker',
    (name) => {
      const result = run(name, 'locked');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('다른 백업이나 복원이 진행 중이에요');
      expect(commands()).toContain(`${repo}|flock|-n 9`);
      expect(existsSync(join(repo, '.maintenance.lock'))).toBe(true);
      expect(commands()).not.toContain('|docker|');
    },
  );

  it('removes only matching backups at least fourteen days old at the USB root', () => {
    const usb = dirname(backup);
    const old = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
    for (const name of [
      'dogwalk-old',
      '.dogwalk-old.partial',
      'unrelated',
      'nested/dogwalk-old',
    ]) {
      const path = join(usb, name);
      mkdirSync(path, { recursive: true });
      utimesSync(path, old, old);
    }
    const recent = join(usb, 'dogwalk-recent');
    mkdirSync(recent);
    const thirteenDays = new Date(Date.now() - 13 * 24 * 60 * 60 * 1000);
    utimesSync(recent, thirteenDays, thirteenDays);
    expect(run('backup.sh').status).toBe(0);
    expect(existsSync(join(usb, 'dogwalk-old'))).toBe(false);
    expect(existsSync(join(usb, '.dogwalk-old.partial'))).toBe(false);
    expect(existsSync(join(usb, 'unrelated'))).toBe(true);
    expect(existsSync(join(usb, 'nested/dogwalk-old'))).toBe(true);
    expect(existsSync(recent)).toBe(true);
  });

  it('does not overwrite or nest a second backup with the same timestamp', () => {
    expect(run('backup.sh').status).toBe(0);
    const result = run('backup.sh');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('같은 시각의 백업이 이미 있어요');
    expect(
      readdirSync(join(dirname(backup), 'dogwalk-2026-11-01-040000')).sort(),
    ).toEqual(['db.dump', 'uploads.tar.gz']);
  });

  it.each(['backup.sh', 'restore.sh'])('%s requires a path', (name) => {
    const result = run(name, 'success', []);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('사용법:');
    expect(commands()).toBe('');
  });

  it.each(['missing', '.partial', 'corrupt archive', 'corrupt dump'])(
    'rejects a %s backup before stopping or deleting anything',
    (kind) => {
      let path = backup;
      if (kind === 'missing') path = join(root, 'missing');
      if (kind === '.partial') {
        path = join(root, '.dogwalk.partial');
        mkdirSync(path);
      }
      if (kind === 'corrupt archive') {
        const bytes = readFileSync(archive);
        writeFileSync(
          join(backup, 'uploads.tar.gz'),
          bytes.subarray(0, bytes.length / 2),
        );
      }
      const result = run(
        'restore.sh',
        kind === 'corrupt dump' ? 'corrupt-dump' : 'success',
        [path],
      );
      expect(result.status).not.toBe(0);
      expect(commands()).not.toMatch(/compose (stop|start|run)|dropdb/);
    },
  );

  it('does not modify data when confirmation is declined', () => {
    const result = run('restore.sh', 'success', [backup], root, 'no\n');
    expect(result.status).toBe(1);
    expect(commands()).toContain('pg_restore --file=/dev/null');
    expect(commands()).not.toMatch(/compose (stop|start|run)|dropdb/);
  });

  it('resolves a relative restore path before changing directory and restores both archives', () => {
    const result = run('restore.sh', 'success', ['.'], backup);
    expect(result.status, result.stderr).toBe(0);
    expect(commands()).toMatch(
      /pg_restore --file=\/dev\/null[\s\S]*compose stop api web[\s\S]*dropdb[\s\S]*--single-transaction --exit-on-error[\s\S]*tar -xzf[\s\S]*compose up -d api web[\s\S]*nginx -s reload[\s\S]*curl/,
    );
    const env = readFileSync(join(repo, '.env'), 'utf8').split('\n');
    expect(env[0]).toBe('POSTGRES_DB=dogwalk');
    expect(env[1]).toMatch(/^JWT_ACCESS_SECRET=[0-9a-f]{64}$/);
    expect(env[2]).toMatch(/^JWT_REFRESH_SECRET=[0-9a-f]{64}$/);
    expect(env[1].slice(18)).not.toBe(env[2].slice(19));
    expect(env.slice(3)).toEqual([
      'COMPOSE_FILE=docker-compose.yml:docker-compose.https.yml',
      '',
    ]);
    expect(statSync(join(repo, '.env')).mode & 0o777).toBe(0o600);
    expect(readFileSync(join(root, 'restored.dump'), 'utf8')).toBe(
      'database-dump\n',
    );
    expect(readFileSync(join(root, 'restored.tar.gz'))).toEqual(
      readFileSync(archive),
    );
  });

  it.each(['stop-failed', 'create-failed', 'restore-failed', 'extract-failed'])(
    'leaves the app stopped when restoring fails at %s',
    (scenario) => {
      const result = run('restore.sh', scenario);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('원인을 고친 뒤 다시 실행하세요');
      expect(commands()).not.toMatch(/compose (start|up)/);
      expect(commands()).not.toContain('nginx -s reload');
      expect(readFileSync(join(repo, '.env'), 'utf8')).toBe(envFile);
    },
  );

  it.each([
    ['missing', envFile.replace('JWT_REFRESH_SECRET=old-refresh\n', '')],
    ['duplicated', `${envFile}JWT_ACCESS_SECRET=again\n`],
  ])(
    'stops before touching data when a signing key line is %s',
    (_kind, env) => {
      writeFileSync(join(repo, '.env'), env);
      const result = run('restore.sh');
      expect(result.status).not.toBe(0);
      expect(commands()).not.toMatch(
        /pg_restore|compose (stop|start|up|run)|dropdb/,
      );
    },
  );

  it.each(['backup.sh', 'restore.sh', 'reload-nginx.sh'])(
    '%s resolves its repository through a symlink from another directory',
    (name) => {
      const link = join(root, name);
      symlinkSync(join(repo, 'deploy', name), link);
      const result = run(`../../${name}`);
      expect(result.status, result.stderr).toBe(0);
      const dockerCalls = commands()
        .split('\n')
        .filter((line) => line.includes('|docker|'));
      expect(dockerCalls.length).toBeGreaterThan(0);
      for (const call of dockerCalls)
        expect(call.startsWith(`${repo}|docker|`)).toBe(true);
    },
  );

  const curlCall = (path: string) =>
    `${repo}|curl|-fsSLk --max-time 5 -o /dev/null http://localhost${path}`;

  it.each(['repository', 'another directory'])(
    'updates from %s with every command running in the repository',
    (directory) => {
      const result = run(
        'update.sh',
        'update-success',
        [],
        directory === 'repository' ? repo : root,
      );
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('업데이트를 마쳤어요');
      expect(statSync(join(source, 'update.sh')).mode & 0o777).toBe(0o755);
      expect(existsSync(join(repo, '.maintenance.lock'))).toBe(true);
      expect(commands().trim().split('\n')).toEqual([
        `${repo}|flock|-n 9`,
        `${repo}|docker|compose ps --status running --services`,
        `${repo}|git|pull --ff-only`,
        `${repo}|docker|compose up -d --build`,
        `${repo}|docker|compose up -d --force-recreate --no-deps nginx`,
        curlCall('/api/health'),
        curlCall('/login'),
      ]);
    },
  );

  it('refuses an update with a held lock before running any other command', () => {
    const result = run('update.sh', 'locked', []);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('다른 백업이나 복원이 진행 중이에요');
    expect(commands()).toBe(`${repo}|flock|-n 9\n`);
  });

  it.each(['db', 'api', 'web', 'nginx'])(
    'refuses an update when %s is stopped before pulling or rebuilding',
    (service) => {
      const result = run('update.sh', `update-stopped-${service}`, []);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        `꺼진 서비스가 있어 업데이트하지 않아요: ${service}`,
      );
      expect(commands().trim().split('\n')).toEqual([
        `${repo}|flock|-n 9`,
        `${repo}|docker|compose ps --status running --services`,
      ]);
    },
  );

  it.each([
    ['update-ps-failed', 'compose ps --status running --services', /\|git\|/],
    ['update-pull-failed', '|git|pull --ff-only', /compose up/],
    ['update-build-failed', 'compose up -d --build', /--force-recreate/],
    [
      'update-nginx-failed',
      'compose up -d --force-recreate --no-deps nginx',
      /\|curl\|/,
    ],
  ])('stops an update at %s before the next step', (scenario, last, next) => {
    const result = run('update.sh', scenario, []);
    expect(result.status).toBe(1);
    expect(commands()).toContain(last);
    expect(commands()).not.toMatch(next);
    expect(commands()).not.toContain('|curl|');
  });

  it.each([
    ['health', 12, 0],
    ['login', 12, 12],
  ])(
    'fails an update after twelve bounded attempts when %s stays unhealthy',
    (endpoint, healthChecks, loginChecks) => {
      const result = run('update.sh', `update-${endpoint}-failed`, []);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        '응답 확인에 실패했어요. docker compose logs api web nginx를 확인하세요',
      );
      expect(result.stdout).not.toContain('업데이트를 마쳤어요');
      const lines = commands().split('\n');
      expect(lines.filter((line) => line.includes('|curl|'))).toHaveLength(
        healthChecks + loginChecks,
      );
      expect(
        lines.filter((line) => line === curlCall('/api/health')),
      ).toHaveLength(healthChecks);
      expect(lines.filter((line) => line === curlCall('/login'))).toHaveLength(
        loginChecks,
      );
      // No sleep after the last attempt.
      expect(lines.filter((line) => line.includes('|sleep|'))).toEqual(
        Array(11).fill(`${repo}|sleep|5`),
      );
    },
  );

  it('finishes an update when both endpoints respond after retrying', () => {
    const result = run('update.sh', 'update-retry', []);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('업데이트를 마쳤어요');
    expect(commands().trim().split('\n').slice(-5)).toEqual([
      curlCall('/api/health'),
      curlCall('/login'),
      `${repo}|sleep|5`,
      curlCall('/api/health'),
      curlCall('/login'),
    ]);
  });

  it('rejects update arguments before running any command', () => {
    const result = run('update.sh', 'update-success', ['unexpected']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('사용법:');
    expect(commands()).toBe('');
  });
});
