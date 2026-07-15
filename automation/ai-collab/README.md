# Codex + Claude CRM 협업 자동화

추가 API 키 없이 현재 PC에 로그인된 ChatGPT/Codex 구독과 Claude 구독을 사용합니다.

## 동작 순서

1. Claude가 요구사항, 고객 흐름, 보안 위험, 완료 조건을 제안합니다.
2. Codex가 제안을 반박·보완합니다.
3. Claude가 두 의견을 합쳐 최종 개발 명세를 확정합니다.
4. Codex가 격리된 Git 작업공간에서 구현합니다.
5. Claude가 실제 코드 변경분을 검토합니다.
6. Codex가 검토 결과를 반영합니다.
7. TypeScript와 앱 빌드를 검사하고 별도 브랜치에 커밋합니다.

`main`에는 자동으로 병합하거나 배포하지 않습니다. 최종 결과를 사람이 확인한 뒤 병합합니다.

## 실행

저장소 루트의 `CRM AI 협업 시작.cmd`를 더블클릭하고 작업 내용을 입력합니다.

명령으로 실행할 수도 있습니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\automation\ai-collab\Start-AICollab.ps1 -Task "비밀번호 재설정 서비스를 NAS 인증 서버와 연결"
```

## NAS 작업 기록 폴더

Windows 환경변수 `CRM_AI_SHARED_ROOT`를 NAS 공유 폴더로 설정하면 모든 설계·검토·실행 로그가 NAS에 저장됩니다.

예시:

```text
CRM_AI_SHARED_ROOT=\\NAS이름\CRM-AI\runs
```

환경변수가 없으면 저장소 옆의 `CRM-AI-RUNS` 폴더에 안전하게 보관합니다. 작업 기록은 공개 Git 저장소에 포함되지 않습니다.

## 안전장치

- 원본 작업폴더가 깨끗할 때만 시작합니다.
- 작업마다 별도 Git 브랜치와 worktree를 만듭니다.
- Claude는 설계와 검토 단계에서 파일을 수정할 수 없습니다.
- 두 AI 모두 커밋·푸시·병합·배포를 직접 수행할 수 없습니다.
- 검토 반복은 최대 2회입니다.
- 빌드는 한 번에 하나만 실행하며 메모리가 부족하면 중단합니다.
