# 강아지 산책

강아지 산책 매칭 서비스. 포트폴리오·학습용 MVP이며 Docker로 운영한다.
Node.js 24와 Docker Compose가 필요하다. 처음 한 번 `npm --prefix api ci`와 `npm --prefix web ci`로 각 앱의 패키지를 설치한다.

## 로컬 개발

지도 사용을 위해 `web/.env.local`에 `NEXT_PUBLIC_KAKAO_MAP_KEY`를 설정한다. Docker는 루트 `.env`의 같은 이름 값을 빌드 인자로 사용한다.

저장소 루트에서 처음 한 번 실행한다.

```sh
cp .env.example .env
cp api/.env.example api/.env
docker compose up -d --wait db
npm --prefix api run prisma:migrate
```

터미널 두 개에서 각각 실행한다. API는 `api/.env`를 읽으며, Prisma 클라이언트는 시작 전에 자동 생성한다.

```sh
npm --prefix api run start:dev
```

```sh
npm --prefix web run dev
```

화면은 <http://localhost:3001>, API는 <http://localhost:4000/api/health>에서 확인한다.
개발 화면의 `/api/*` 요청은 API로 전달한다. 대상은 `API_URL` 환경 변수이며 기본값은 `http://localhost:4000`이다.
로컬 개발 서버에는 `/uploads/` 제공 경로가 없으므로, 반려견 사진 화면은 Docker 실행 후 <http://localhost>에서 확인한다.
로컬 개발 서버는 `/socket.io/`를 전달하지 않으므로 실시간 산책 요청 알림은 Docker의 <http://localhost>에서 확인한다. 받은 요청 수 배지는 로컬에서도 API로 불러온다.

```sh
curl http://localhost:3001/api/health
```

정상 응답은 `{"status":"ok","db":"up"}`이다. DB 쿼리가 실패하면 503과 `{"status":"error","db":"down"}`을 반환한다.

## Docker 실행

루트 `.env`를 `.env.example`에서 복사한 뒤 실행한다.

```sh
docker compose up --build -d
curl http://localhost/api/health
curl http://localhost
```

API는 시작할 때 마이그레이션을 적용한다. 이미지 빌드에는 Node 이미지와 npm 패키지를 받을 네트워크 또는 캐시가 필요하다.
nginx만 80번 포트를 공개하고, DB는 `127.0.0.1:5433`에만 연결한다. API와 web 컨테이너는 호스트 포트를 열지 않는다.
DB는 [공식 PostGIS 이미지의 PostgreSQL 17 안정 태그](https://github.com/postgis/docker-postgis)를 사용한다. 이 이미지가 amd64만 지원하므로 Apple Silicon에서는 Docker의 amd64 에뮬레이션이 필요하다.

루트 `.env`의 DB 주소는 `db:5432`, `api/.env`는 `localhost:5433`이다.
예제 계정은 로컬용 가짜 값이다. 계정을 바꿀 때 두 파일의 값도 맞추고, URL의 비밀번호에 특수문자가 있으면 URL 인코딩한다. `.env`는 커밋하지 않는다.

## 검사

DB를 실행한 상태에서 저장소 루트에서 실행한다.

```sh
npm --prefix api test
npm --prefix api run test:e2e
npm --prefix api run lint
npm --prefix api run build
npm --prefix web run lint
npm --prefix web test
npm --prefix web run build
```

브라우저 테스트는 화면을 바꾼 단계가 끝날 때 직접 실행한다. 처음 한 번은 Chromium을 설치한다.

```sh
npx --prefix web playwright install chromium
```

Docker를 최신 코드로 다시 빌드하고, nginx를 거친 API와 로그인 화면의 응답 코드가 모두 `200`인지 확인한다.
API는 시작할 때 마이그레이션을 적용하므로 준비될 때까지 기다린 뒤 다시 확인한다.

```sh
docker compose up --build -d
curl -s -o /dev/null -w '%{http_code}\n' http://localhost/api/health
curl -s -o /dev/null -w '%{http_code}\n' http://localhost/login
npm --prefix web run test:browser
```

기본 주소는 `http://localhost`이며, 다른 nginx 주소는 `BROWSER_TEST_URL`로 지정한다.
사진은 nginx가 제공하므로 로컬 개발 서버(3001)에서는 이 테스트를 실행하지 않는다.
매 실행마다 새 계정과 반려견을 등록하며 개발 DB에 남는다. 실패 시 스크린샷과 trace는 `web/test-results/`에 저장된다.

API e2e 실행은 `DATABASE_URL`을 한 번 정하고 같은 주소로 마이그레이션과 테스트를 실행한다.
DB 이름이 `_test`로 끝나지 않으면 실행하지 않는다.
환경 변수가 없으면 예제 계정으로 `localhost:5433/dogwalk_test`를 사용하며, `api/.env`나 `.env.test`의 주소로 바꾸지 않는다.
계정을 변경했다면 테스트 DB를 가리키는 `DATABASE_URL`을 명시해서 실행한다.

`dogwalk_test`는 빈 DB 볼륨의 첫 초기화 때만 생성된다. 기존 볼륨에 테스트 DB가 없다면 데이터를 지우지 말고 다음 명령으로 생성한다.

```sh
docker compose exec db sh -c 'createdb -U "$POSTGRES_USER" dogwalk_test'
```

`docker compose down`으로 종료해도 `db-data`의 데이터는 유지된다.
