# 노트북 자동저장

- 로컬 작업폴더: `C:\dev\troiareuke-crm`
- 자동저장 브랜치: `autosave/laptop-99048`
- 실행 간격: Windows 예약 작업으로 1분
- 자동저장 대상: 변경된 비코어 소스와 문서
- 코어 보호: 저장소의 `.githooks/pre-commit`과 `scripts/core-lock.mjs`를 그대로 사용
- 제외 대상: 환경설정 비밀값, 인증자료로 보이는 경로, 데이터베이스·CSV·Excel·인증서 파일, 25MB 초과 파일
- 로그: `.git/autosave.log` (Git에 포함되지 않음)

`main`에는 자동으로 병합하거나 푸시하지 않는다. 검토가 끝난 변경만 별도 절차로 반영한다.
