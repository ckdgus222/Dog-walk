// e2e wipes every table, so both run-e2e.mjs (before migrating) and
// vitest.config.e2e.ts (direct runs) refuse a database not named *_test.
// The check targets mistakes, not crafted URLs (docs/predeploy-safety.md).
const invalidAddressMessage =
  'e2e DB 주소를 읽을 수 없어요. postgresql://<사용자>:<비밀번호>@<호스트>:<포트>/<이름>_test 형식으로 적어 주세요.';

export function assertE2eDatabaseUrl(url) {
  let address;
  try {
    address = new URL(url);
  } catch {
    throw new Error(invalidAddressMessage);
  }

  if (address.protocol !== 'postgres:' && address.protocol !== 'postgresql:') {
    throw new Error(invalidAddressMessage);
  }
  if (!address.host) {
    throw new Error(invalidAddressMessage);
  }

  let databaseName;
  try {
    databaseName = decodeURIComponent(address.pathname.slice(1));
  } catch {
    throw new Error(invalidAddressMessage);
  }
  if (!databaseName || databaseName.includes('/')) {
    throw new Error(invalidAddressMessage);
  }
  if (!databaseName.endsWith('_test')) {
    throw new Error(
      `e2e는 이름이 _test로 끝나는 DB에서만 실행해요: ${databaseName}`,
    );
  }
}
