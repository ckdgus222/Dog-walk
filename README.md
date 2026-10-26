# 강아지 산책

0단계: Next.js 첫 화면과 DB 연결을 확인하는 `GET /api/health`를 제공한다.
Node.js 24와 Docker Compose가 필요하다. 각 앱의 패키지는 이미 설치돼 있다.

서버 배포는 [docs/phase-8-deploy.md](docs/phase-8-deploy.md)를 따른다.
첫 설치 뒤 코드 업데이트는 아래 '서버 업데이트'를 따른다.

## 로컬 개발

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

## 서버 업데이트

서버에 올리기 전에 `feature/demo-account`의 부팅 시 백업 변경(`deploy/on-boot.sh`)도 합치고, 서버 crontab의 매일 04시 백업을 `@reboot` 실행으로 바꾼다(`docs/demo-4-on-boot.md`, `docs/phase-8-deploy.md`의 서버 작업 12번).
켜진 직후에는 `on-boot.sh` 로그(`~/dogwalk-boot.log`)에 결과 줄이 나온 뒤 업데이트한다.

```sh
~/dog-walk/deploy/update.sh
```

스크립트는 백업·복원과 같은 잠금을 잡고 네 서비스가 모두 실행 중인지 확인한 뒤, `git pull --ff-only`, 재빌드, nginx 컨테이너 재생성, API와 로그인 화면 응답 확인을 순서대로 한다. 실패하면 바로 멈춘다.
nginx를 새로 만들 때 약 1초 동안 연결이 끊길 수 있다. 두 응답이 모두 정상이면 `업데이트를 마쳤어요`를 출력한다.

- `다른 백업이나 복원이 진행 중이에요`: 해당 작업이 끝난 뒤 다시 실행한다.
- `꺼진 서비스가 있어 업데이트하지 않아요`: 표시된 서비스가 꺼진 원인부터 확인한다. 복원 실패로 일부러 꺼 둔 상태일 수 있다.
- `응답 확인에 실패했어요`: `docker compose logs api web nginx`를 확인한다.

마이그레이션이 중간에 끊기면 실패 기록이 다음 `migrate deploy`를 막을 수 있으므로, api 로그와 `_prisma_migrations` 상태를 보고 Prisma 공식 복구 절차(`prisma migrate resolve`)를 따른다.

## DB 비밀번호 바꾸기

빈 볼륨으로 처음 시작하기 전이면 루트 `.env`의 `POSTGRES_PASSWORD`와 `DATABASE_URL` 안의 비밀번호를 같은 값으로 맞추면 된다. 이미 만들어진 DB는 `.env`만 고쳐도 실제 비밀번호가 바뀌지 않는다.
URL 인코딩이 필요 없는 비밀번호를 만들려면 `openssl rand -hex 24`를 쓸 수 있다. 맥의 로컬 개발 DB는 `127.0.0.1`에만 열려 있으므로 예제 값을 그대로 써도 된다.

이미 DB가 만들어졌다면 먼저 아래 한 줄만 따로 실행해 잠금을 잡은 셸을 연다. **여러 줄을 한꺼번에 붙여 넣지 않는다.** 잠금 실패 문구가 나오면 아무것도 바꾸지 말고 백업·복원이 끝난 뒤 다시 실행한다.

```sh
cd ~/dog-walk && flock -n .maintenance.lock bash || echo "잠금 실패: 백업이나 복원이 진행 중이에요. 아무것도 바꾸지 마세요."
```

그 셸 안에서 `docker compose ps`로 db, api, web, nginx가 모두 running인지 확인한다. 하나라도 아니면 아무것도 바꾸지 않고 `exit`한다. 아래 절차를 마칠 때까지 잠금을 유지해 백업·복원이 비밀번호 변경 사이에 끼어들지 못하게 한다.

1. `docker compose exec db psql -U <POSTGRES_USER> -d <POSTGRES_DB>`로 들어간다. 꺾쇠 부분은 현재 `.env`의 사용자·DB 이름으로 바꾼다. `\password <POSTGRES_USER>`를 입력하고 새 비밀번호를 두 번 넣은 뒤 `\q`로 나온다. 비밀번호를 명령줄 인자로 넘기지 않아 셸 기록에 남지 않는다.
2. 루트 `.env`의 `POSTGRES_PASSWORD`와 `DATABASE_URL` 안 비밀번호를 새 값으로 맞춘다. URL 안 특수문자는 URL 인코딩한다.
3. `docker compose up -d && deploy/reload-nginx.sh`로 새 환경 변수를 적용하고 nginx가 새 api 주소를 읽게 한다. 아래 두 응답이 모두 `200`인지 확인한다. 잠금 셸 안에서 `deploy/update.sh`를 실행하면 잠금을 얻지 못해 멈추므로 사용하지 않는다.

   ```sh
   curl -sLk -o /dev/null -w '%{http_code}\n' http://localhost/api/health
   curl -sLk -o /dev/null -w '%{http_code}\n' http://localhost/login
   ```

4. `200`이 아니면 코드만으로 원인을 단정하지 말고 `docker compose logs api`에서 `password authentication failed` 여부를 확인한다. 비밀번호가 틀려 시작 전 마이그레이션에서 멈추면 `502`, 시작 뒤 DB 쿼리가 실패하면 `503`이 나올 수 있다.

절차를 마치면 `exit`로 잠금 셸을 종료한다.

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
