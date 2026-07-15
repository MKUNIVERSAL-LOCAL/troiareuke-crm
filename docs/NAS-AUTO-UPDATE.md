# NAS 자동 업데이트 배포

## 현재 배포 방식

아르케스파와 거래처에는 단일 실행 파일 **`트로이아르케 CRM.exe`**를 전달한다.
포터블 앱은 실행 후 5초 뒤, 이후 10분마다 NAS의 업데이트 정보를 확인한다.
새 버전이 있으면 사용자가 앱 안에서 다운로드하고, 적용을 누르면 현재 실행 파일을 안전하게 교체한 뒤 새 버전으로 다시 실행한다.

```text
https://crm-update.mkcorp.familyds.com/portable/latest.json
  → 버전·다운로드 주소·파일 크기·SHA-256 제공
  → 트로이아르케 CRM.exe 다운로드
  → SHA-256 검증
  → 기존 실행 파일 교체 및 재실행
```

NSIS 설치형 빌드 설정도 유지하지만, 현재 상용 베타의 기준 배포물은 지정 폴더에서 바로 실행하고 그 파일 자체가 갱신되는 포터블 EXE다.

## NAS 공개 범위

- 공개: `https://crm-update.mkcorp.familyds.com/portable/` 아래의 업데이트 파일만
- 비공개: DSM 관리화면(`:5001`), SMB 공유폴더, PostgreSQL, Docker 관리 포트
- DSM의 5001 포트는 업데이트 주소로 사용하지 않는다.
- nginx 컨테이너에는 `CRM-UPDATES`만 읽기 전용으로 연결한다.

## 포터블 릴리스 절차

1. `package.json`의 버전을 이전 배포보다 높인다.
2. 시스템 부하를 확인하고 다른 빌드가 없을 때 포터블 파일을 만든다.

   ```powershell
   npm run electron:build:portable
   ```

3. 업데이트 묶음을 준비한다.

   ```powershell
   npm run electron:portable:prepare
   ```

   생성 결과:

   - `release/portable-update/트로이아르케 CRM.exe`
   - `release/portable-update/latest.json`

4. 게시 전 아래 값이 모두 일치하는지 확인한다.

   - `package.json` 버전 = `latest.json.version`
   - 실제 EXE 크기 = `latest.json.size`
   - 실제 EXE SHA-256 = `latest.json.sha256`
   - 다운로드 호스트 = `crm-update.mkcorp.familyds.com`

5. NAS에는 EXE를 먼저 올리고 `latest.json`을 마지막에 올린다. 준비 도구는 `NAS_UPDATE_DIR`이 설정된 경우 임시 파일로 복사한 뒤 원자적으로 이름을 바꾼다.

   ```powershell
   $env:NAS_UPDATE_DIR='\\192.168.0.52\CRM-UPDATES'
   npm run electron:portable:prepare
   ```

6. 외부 주소에서 `latest.json`과 EXE가 모두 HTTP 200으로 내려받아지는지 확인하고, 별도 PC의 이전 버전으로 다운로드·교체·재실행을 검증한다.

## 안전 규칙

- `latest.json`을 EXE보다 먼저 게시하지 않는다.
- 이미 게시한 동일 버전 파일을 덮어쓰지 않고 반드시 버전을 올린다.
- 앱은 HTTPS이며 호스트가 `crm-update.mkcorp.familyds.com`인 파일만 허용한다.
- 다운로드 파일은 SHA-256이 일치해야만 적용한다.
- NAS 게시와 실제 거래처 업데이트 시작은 명시적 승인 후 수행한다.

## NSIS 설치형 배포

신규 PC에 설치 프로그램이 필요한 경우 `npm run electron:installer`로 NSIS 파일을 만들 수 있다. 이 방식의 자동 업데이트를 사용할 때는 같은 빌드에서 생성된 설치 파일·`.blockmap`·`latest.yml`을 함께 게시해야 한다. 현재 포터블 배포와 혼합하지 않는다.
