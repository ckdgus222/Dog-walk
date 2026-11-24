# Dogwalk를 Ubuntu 공용 nginx에 연결하기

호스트 nginx가 도메인의 HTTPS를 받고 Docker의 Next.js 웹과 API로 전달한다. 이 문서의 도메인·경로·포트는 예시다. 서버에서 선택한 값과 인증서, 키, 백업은 Git 밖에 둔다.

## 후보 만들기

1. 현재 운영 상태를 관리자 전용 디렉터리에 보관한다. 서버에서만 수정한 nginx·HTTPS Compose 파일도 포함한다. Compose 프로젝트 이름, 실제 파일 조합과 환경, 볼륨 식별자, 이미지, Docker 네트워크, 80·443 소유자와 재시작 정책, 부팅 작업, 인증서별 webroot·갱신 훅을 기록한다. 두 서비스의 인증서·대표 화면·상태 응답을 기준으로 남긴다.
2. 설치 과정에서 Ubuntu nginx가 먼저 80·443을 차지하지 않도록 자동 시작을 제어한다. Client Review 저장소의 공용 nginx 운영 절차에 따라 등록되지 않은 호스트를 거절하는 기본 사이트를 준비한다. 호스트 설정과 Certbot 훅은 운영자가 검토해 root 소유 디렉터리에 설치한다. 루트로 실행되는 기존 훅이 작업 폴더의 스크립트를 호출한다면, 코드를 업데이트하기 **전에** 기존 동작을 보존한 root 소유 훅으로 교체한다.
3. 공개 사진은 실행 중인 API 마운트 목록에서 컨테이너 목적지가 정확히 `/app/uploads`인 기존 볼륨을 찾는다. 아래 명령은 공개 볼륨 원본만 표시한다.

   ```sh
   docker inspect "$(docker compose ps -q api)" --format '{{range .Mounts}}{{if eq .Destination "/app/uploads"}}{{println .Source}}{{end}}{{end}}'
   ```

   root가 원본을 전용 디렉터리(예: `/srv/dog/photos`)에 bind mount한 뒤 `remount,bind,ro,nosuid,nodev,noexec`로 다시 마운트한다. `findmnt --mountpoint /srv/dog/photos -o SOURCE,TARGET,OPTIONS`에서 원본과 `ro`를 확인한다. nginx 작업자 계정으로 실제 공개 사진 하나를 읽어 본다. Docker 데이터 디렉터리의 권한을 넓히지 않는다. `/app/private-uploads`는 연결하지 않는다. 재부팅에도 같은 볼륨이 마운트되도록 영구 설정하고, Dogwalk 부팅 점검에서 실제 사진을 조회한다. ACME용 디렉터리(예: `/srv/dog/acme`)는 기존 Certbot이 챌린지를 **쓰는 바로 그 webroot**를 읽기 전용 bind mount하여 제공한다.
   공개 볼륨 원본에 저장소의 1픽셀 PNG를 한 번 설치한다. 다음 명령은 실행 중인 API의 기존 공개 볼륨에만 파일을 복사한다. 호스트의 마운트 대상 디렉터리에 직접 복사하면 마운트가 빠져도 점검이 성공할 수 있다.

   ```sh
   docker compose cp deploy/dogwalk-volume-v1.png api:/app/uploads/dogwalk-volume-v1.png
   ```

   호스트 모드의 부팅 작업은 Dogwalk 도메인의 HTTPS `/uploads/dogwalk-volume-v1.png` 응답을 원본과 바이트 단위로 대조한다. 사진이나 API·로그인을 확인하지 못하면 재시도 후 백업과 데모 초기화를 중단한다. 파일에는 사용자 사진이나 인증 정보가 없다. 마운트 상태를 복구한 뒤 다시 실행한다. 이 점검 파일을 도입하기 전의 백업을 복원했으면 같은 명령으로 공개 볼륨에 다시 설치한다.

4. 기존 Compose 프로젝트 이름과 볼륨을 유지한다. 운영 모드의 조합은 `COMPOSE_FILE=docker-compose.yml:docker-compose.host.yml`이다. `SITE_URL`을 실제 HTTPS 주소로 설정한다. `DOGWALK_WEB_PORT`, `DOGWALK_API_PORT`의 기본값은 13000, 14000이다. 활성 프로필에는 `legacy-ingress`를 넣지 않는다. `docker compose config --services`에 web·api·db가 있고 nginx가 빠졌는지 확인한다. 전체 config에는 비밀값이 있어 출력 공유를 피한다.
5. 아래처럼 일반 사용자로 설정을 생성한다. 후보용 HTTP·HTTPS 포트는 공용 기본 사이트와 두 앱에 동일하게 지정한다. 실행 전 `ss -ltn`으로 후보와 앱 포트 충돌을 확인한다.

   ```sh
   candidate_dir=$(mktemp -d)
   python3 nginx/host/render.py --domain dog.example.test --cert-name fixture \
     --acme-root /srv/dog/acme --uploads-root /srv/dog/photos \
     --web-port 13000 --api-port 14000 --candidate 18080 18443 > "$candidate_dir/dogwalk.conf"
   ```

   출력에는 운영 설정이 들어가므로 저장소 밖의 개인 디렉터리에 저장한다. 후보는 별도 pid·로그를 쓰는 설정에서 `nginx -t -c <후보 전체 설정의 절대경로>`를 통과한 뒤 루프백 포트에서만 띄운다. 실서버의 앱에 포트가 없으면 **승인된 점검 시간**에 기존 프로젝트로 `docker compose up -d --no-deps api web`을 실행한다. 이때 앱 컨테이너가 재생성될 수 있다. 기존 앞단 nginx를 기존 Compose 파일 조합으로 reload한 뒤 기존 두 주소를 먼저 확인한다. DB 볼륨이나 기존 프록시 연결망을 새로 만들지 않는다.

## 리허설과 인계

- HTTPS 후보는 `curl --resolve dog.example.test:18443:127.0.0.1 https://dog.example.test:18443/api/health`로 검증한다. 실제 도메인·인증서를 사용하고 인증서 검증을 유지한다. Dogwalk 로그인 화면, 공개 사진, 비공개 사진의 접근 차단, Socket.IO 연결(101), 30MB 제한, HTTP 인증 경로와 리디렉션을 확인한다. Review의 공개 데모·상태·공개 제한 경로도 함께 확인한다.
- 운영 설정은 동일한 입력에서 `--candidate 18080 18443`만 제거해 생성한다. 관리자 소유 설정 디렉터리에 검토한 파일을 설치한다. 두 구형 nginx의 부팅 재점유를 막고 점검 창에서 80·443을 쓰던 앞단만 중지한다. 호스트 nginx가 포트를 받은 뒤 외부에서도 두 주소·인증서·HTTP 인증 경로를 확인한다. 이전 컨테이너와 기존 연결망은 원복 기간에 유지한다.
- Certbot 갱신 훅은 **Client Review 저장소에서 관리하는 공용 `nginx/host/apply.sh`**의 검수·설치본을 사용한다. 사이트 적용과 갱신은 같은 관리자 전용 잠금 `/run/host-nginx/apply.lock`에서 문법 검사, reload, 양쪽 사이트 검사를 직렬화한다. 운영 앱 계정의 일상 배포·백업·복원은 프로젝트의 기존 `.maintenance.lock`을 사용한다. 호스트 nginx 재시작 권한이 필요하지 않다.
- 인계가 끝나면 각 인증서의 `certbot renew --cert-name <인증서 이름> --dry-run --run-deploy-hooks`와 다음 예정된 기동 때 자동 시작·마운트 상태·실제 공개 사진을 확인한다. 로컬 점검은 `python3 deploy/test-host-nginx.py`(Docker·OpenSSL)와 API의 `npm exec vitest run test/deploy.spec.ts`로 재현할 수 있다.

## 실패 시 원복

공개 경로, 인증서, 사진 또는 실시간 연결이 깨지면 포트 인계를 되돌린다. 공용 운영 잠금 아래 호스트 nginx를 멈추고 자동 시작 설정을 원래 값으로 돌린다. 보관한 Compose·도메인 설정, 두 구형 nginx의 재시작 정책·연결망, 원래 갱신 훅과 부팅 작업을 복원하고 기존 프록시와 앱을 기존 프로젝트 이름으로 기동한다. API·웹 컨테이너를 재생성했으면 기존 프록시가 새 주소를 다시 읽게 한다. 두 서비스가 처음의 인증서·대표 화면·상태 응답을 반환하는지 확인한다. 운영 DB, 공개·비공개 사진 볼륨과 백업 데이터는 원복 과정에서 삭제하지 않는다.
