# NAS 중앙 계정·비밀번호 재설정 서버

⚠️ **격리 테스트 전용입니다.** 2026-07-14 오너 결정에 따라 상용 인증의 정본은 클라우드 Supabase이며, 이 서버를 상용 CRM 빌드에 연결하거나 외부에 배포하지 않습니다.

이 서버는 고객 PC가 아닌 NAS에서 회원 계정, 암호화된 비밀번호, 로그인 세션, 1회용 비밀번호 재설정 토큰을 관리합니다.

## NAS 배포 순서

1. Synology 패키지 센터에서 **Container Manager**를 설치합니다.
2. 이 `server` 폴더를 NAS의 예: `/volume1/docker/troiareuke-auth`에 올립니다.
3. `.env.example`을 `.env`로 복사한 뒤 DB 비밀번호, 외부 주소, SMTP 정보를 입력합니다.
4. Container Manager의 프로젝트에서 `docker-compose.yml`을 실행합니다.
5. DSM 제어판 → 로그인 포털 → 고급 → 역방향 프록시에서 외부 HTTPS 주소를 `http://127.0.0.1:8787`로 연결합니다.
6. `https://외부주소/health`가 `{"ok":true}`를 반환하는지 확인합니다.

SMTP는 회사 메일 또는 NAS MailPlus SMTP 정보를 사용합니다. 고객이 비밀번호 찾기를 누르면 계정 존재 여부와 관계없이 동일한 안내가 표시되며, 실제 가입 고객에게만 30분 유효·1회용 링크가 전송됩니다.
