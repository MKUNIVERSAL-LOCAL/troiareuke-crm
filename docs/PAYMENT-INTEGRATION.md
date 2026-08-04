# 결제(카드·무통장입금) 연결 가이드 — 토스페이먼츠

> 상태: **연결 직전까지 개발 완료** (2026-08-04, 오너 지시).
> 코드는 전부 배포되어 있고, 아래 **PG 키 2개를 NAS 서버 .env에 넣는 순간 활성화**됩니다.
> 키가 없는 동안에는 지점 화면에 "온라인 결제 준비 중"으로 정직하게 표시됩니다 (가짜 성공 없음).

## 동작 구조 (이미 구현됨)

```
지점 CRM (매출·손익 관리 > 결제 요청)
  → 결제 링크 생성 (POST /api/payments/requests)
  → 링크를 고객에게 문자/카톡으로 전달
고객 휴대폰/PC 브라우저
  → https://crm-api.mkcorp.familyds.com/pay/<id>  (NAS가 호스팅하는 결제 페이지)
  → [카드로 결제] 또는 [무통장입금(가상계좌)] → 토스페이먼츠 결제창
  → 성공 리다이렉트 → 서버가 토스 승인 API(confirm)로 최종 확정
NAS 서버
  → 카드: 즉시 결제 완료 처리
  → 가상계좌: 계좌 안내 표시 → 입금 웹훅 수신 시 완료 처리
  → 완료 시 해당 지점 매출(crm_records payments)에 자동 기록
     (지점 CRM에는 재시작/다음 동기화 때 "온라인 결제" 매출로 표시)
```

- 시크릿 키는 **서버(.env)에만** 존재. 클라이언트/exe에는 어떤 키도 들어가지 않음.
- Electron 앱에서 결제창을 띄우지 않고 외부 브라우저(고객 휴대폰)에서 결제하므로
  코어(main.cjs/CSP) 수정이 전혀 필요 없음.
- 금액 검증: 요청 금액과 승인 금액 불일치 시 승인 거부. 가상계좌 웹훅은
  secret 대조 + 토스 API 재조회 이중 검증 (웹훅 본문을 신뢰하지 않음).

## 연결 절차 (오너가 할 일)

### 1. 토스페이먼츠 가맹 계약
1. https://www.tosspayments.com → 가맹점 가입 (사업자등록증, 통장사본 필요)
2. 이용할 결제수단 신청: **카드**, **가상계좌** (계약 심사 통상 1~3영업일)
3. 계약 완료 후 [개발자센터 > API 키]에서 **라이브 키** 확인:
   - 클라이언트 키: `live_ck_...`
   - 시크릿 키: `live_sk_...`

### 2. NAS 서버에 키 등록
DSM SSH 또는 File Station에서 `/volume1/docker/troiareuke-crm-server/.env`에 추가:

```env
TOSS_CLIENT_KEY=live_ck_여기에_클라이언트키
TOSS_SECRET_KEY=live_sk_여기에_시크릿키
# 선택: 결제 링크 유효시간(시간, 기본 72)
# PAY_REQUEST_EXPIRE_HOURS=72
```

적용: `auth-api` 컨테이너 재시작 (DSM Container Manager 또는
`sudo /usr/local/bin/docker restart troiareuke-crm_auth-api_1`).

### 3. 토스 개발자센터에 웹훅 등록 (가상계좌 입금통지)
- [개발자센터 > 웹훅] → 웹훅 URL 등록:
  `https://crm-api.mkcorp.familyds.com/api/payments/webhook`
- 이벤트: **가상계좌 입금 (DEPOSIT_CALLBACK)**

### 4. 개통 검증 (키 등록 후 5분)
1. 지점 CRM → 매출·손익 관리 → [결제 요청] 버튼이 "준비 중"에서 활성으로 바뀌었는지
2. 1,000원 테스트 결제 요청 생성 → 본인 휴대폰으로 링크 열어 카드 결제
3. 결제 완료 페이지 확인 → 어드민 통계 또는 지점 매출 목록(재시작 후)에
   "온라인 결제(카드)" 1,000원 기록 확인
4. 테스트 건은 토스 상점관리자에서 결제 취소(환불) 처리
5. 가상계좌도 동일하게 1회: 발급 → 입금 → 자동 완료 확인 (웹훅 검증)

> 라이브 키 대신 **테스트 키(test_ck/test_sk)** 를 넣으면 실청구 없이 전체 흐름을
> 미리 연습할 수 있습니다 (가맹 계약 전에도 발급 가능).

## 수수료·정산 참고
- 카드: 영세 0.8%~일반 2%대 (가맹 등급별, 토스 계약 조건 참조), D+2 정산
- 가상계좌: 건당 정액 수수료 (계약 조건 참조)
- 정산 계좌·주기는 토스 상점관리자에서 설정

## 서버 API 요약 (구현 완료)
| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/payments/pg-config` | 활성화 여부 (지점 세션) |
| POST | `/api/payments/requests` | 결제 요청 생성 (1,000원~1억, 지점 스코프) |
| GET | `/api/payments/requests` | 요청 목록 (최근 100건) |
| POST | `/api/payments/requests/:id/cancel` | 대기 건 취소 |
| GET | `/pay/:id` | 고객용 결제 페이지 (공개, noindex) |
| GET | `/pay/:id/success` · `/pay/:id/fail` | 결제창 리다이렉트 처리 (서버 승인) |
| POST | `/api/payments/webhook` | 가상계좌 입금통지 (secret+API 재조회 검증) |

## 참고: 기존 구독 결제(payment.ts)와의 관계
- `src/lib/payment.ts`(코어)의 아임포트 구독 결제는 **본사 → 지점 구독료** 용도로 별개이며,
  `PAYMENT_ENABLED=false` 런치 게이트가 그대로 유지된다 (이번 작업과 무관).
- 이 문서의 결제 링크는 **지점 → 고객 수납** 용도다.
