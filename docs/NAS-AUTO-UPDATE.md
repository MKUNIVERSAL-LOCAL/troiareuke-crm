# NAS 자동 업데이트 배포

## 목적

거래처 PC에 **설치형(NSIS) 트로이아르케 CRM**을 배포하고, NAS가 최신 설치 파일을 제공한다.
클라이언트는 앱 실행 중 업데이트를 확인·다운로드하고, 종료 또는 재시작 시 적용한다.

> 포터블 `트로이아르케 CRM.exe`는 자동 업데이트 대상이 아니다. 거래처에는 설치 파일을 사용한다.

## NAS 공개 범위

- 공개: `https://crm-update.mkcorp.familyds.com/` 아래의 업데이트 파일만
- 비공개: DSM 관리화면(`:5001`), SMB 공유폴더, PostgreSQL, Docker 관리 포트
- DSM의 5001 포트는 업데이트 주소로 사용하지 않는다.

NAS의 Web Station 또는 리버스 프록시에서 `crm-update.mkcorp.familyds.com`이 `crm-updates` 정적 폴더를 HTTPS 443으로 제공하게 한다.
업데이트 파일을 올리는 내부 공유 폴더와 외부 공개 경로는 분리한다.

## 릴리스 절차

1. `package.json` 버전을 올린다.
2. 소스 루트에서 설치 파일을 만든다.

   ```powershell
   npm run electron:installer
   ```

3. NAS의 업데이트 업로드 공유 폴더를 Windows에 연결한 뒤 배포한다.

   ```powershell
   $env:NAS_UPDATE_DIR='\\NAS이름\\공유폴더\\crm-updates'
   npm run release:stage
   ```

4. NAS 공개 주소에서 아래 파일이 모두 내려받아지는지 확인한다.

   - `latest.yml`
   - `latest.yml`에 기록된 설치 파일
   - 해당 `.blockmap` 파일

   기준 주소: `https://crm-update.mkcorp.familyds.com/`

5. 기존 버전이 설치된 별도 PC에서 앱을 실행해 다운로드·재시작 업데이트를 검증한다.

## 주의

- 설치 파일·blockmap·`latest.yml`은 반드시 같은 빌드에서 생성된 파일을 함께 올린다.
- `latest.yml`을 먼저 올리면 일부 PC가 아직 업로드 중인 설치 파일을 받을 수 있다.
- 긴급 수정도 버전을 다시 올려 새 릴리스로 배포한다. 이미 배포된 동일 버전 파일을 덮어쓰지 않는다.
