# AI 피부 진단 API 3rd-party 서비스 조사 리포트

- 작성일: 2026-04-17
- 목적: 트로이아르케 CRM MVP Phase 0에 탑재할 "얼굴 사진 1장 → 5지표 점수화" AI 피부 진단 외부 API 선정
- 요구 조건 요약
  - 입력: 고객 정면 얼굴 사진 1장 / 출력: 피부 나이·수분·색소·모공·주름 5지표 스코어
  - 30초 이내 응답, REST API
  - 한국인 얼굴 커버리지 양호
  - 일 10~500콜 구간 (초기 사용자 적음, 낭비적 선불 불가)
  - 얼굴 이미지 = 개인정보보호법상 민감정보 → 보관 정책·국내 개보법 대응 중요

---

## 1. 후보 서비스 한 줄 요약 + 강·약점·가격

### 1) Haut.AI (에스토니아)
- 한 줄: 300만 장 이미지 학습, 150개 이상 생체지표 분석. 글로벌 스킨케어 브랜드 B2B SaaS 1군. Swagger API, no-code 위젯 제공
- 강점
  - 가장 풍부한 지표(150+ biomarker, 20+ clinical metric)
  - Swagger API(`saas.haut.ai/api/swagger`), 공식 API 문서 사이트(`docs.saas.haut.ai`) 제공
  - 자체 리서치 블로그에서 dataset diversity를 강조 (공개 벤치마크는 아님)
- 약점
  - **한국인 데이터 비중 공개 없음** (300만 장이 지역별로 얼마나 분포되는지 미공개)
  - EU 기반 → 데이터 저장이 Google Cloud/Azure EU 리전일 가능성이 크고, 한국 개보법 "국외 이전 동의" 요건이 걸림
  - 보관기간 1년 (쿼리 후 1년간 개인정보 보관, 사용자 삭제 요청 시 30일 내 응답)
  - 가격 비공개, 영업팀 문의 필수. Capterra/GetApp에도 "usage-based, Contact Sales"만 표기
- 가격: **확인 필요** (공개 가격표 없음 / Contact Sales)

### 2) Orbo.AI (인도)
- 한 줄: 209개 facial landmark + 16+ 피부 파라미터, 70만 장 학습. 스마트미러·키오스크·e커머스 통합 사례 많음
- 강점
  - 피부 유형 6종, "6 ethnicities" 지원 주장. 실시간 처리에 강점 (인도 화장품 브랜드 3x 전환율 사례 인용)
  - BeautyGPT API 등 제품 라인업 확장 중
  - 가격표 공개는 안 하지만 인도 스타트업 특성상 협상 여지 큼 (Techjockey 리뷰)
- 약점
  - **한국인 데이터 검증 근거 없음** ("six ethnicities"가 정확히 무엇인지 공개 안 함 — 남아시아·동남아시아 중심 가능성)
  - 공개 벤치마크 논문 없음
  - 데이터센터 위치·개보법 대응 **확인 필요**
- 가격: **확인 필요** (Contact Sales)

### 3) Perfect Corp YouCam (대만, NYSE: PERF)
- 한 줄: 글로벌 800+ 뷰티 브랜드 납품 실적, HD Skin Analysis 14개 concerns, Wake Forest School of Medicine 검증(test-retest 95%). **API Playground 공개, 소비기반 과금**
- 강점
  - **유일하게 "월 몇 달러부터 시작" 명시된 공개 consumption pricing** (자사 발표, Shoptalk 2026)
  - API Playground + 무료 체험 제공 (`yce.perfectcorp.com`)
  - HIPAA·GDPR compliant 명시
  - Estée Lauder, Coty, Cetaphil 등 실제 고객 다수
  - 공식 한국어 사이트 운영 (`perfectcorp.com/ko`) — 한국어 API 가이드, 개발자 블로그 한국어 번역 제공
  - NVIDIA 가속 인프라, 저지연 강조
  - 70,000장 diverse skin 이미지 비교 DB (규모는 Haut.AI보다 작지만 대만/아시아 기반이라 동아시아 커버리지 상대적 유리 추정)
- 약점
  - **한국인 특화 학습 데이터 명시는 없음** (아시아 전반 학습으로 추정)
  - 세부 per-call 가격은 여전히 영업 문의
  - 14개 concerns 중 어느 것이 "피부 나이/수분"에 매핑되는지 스펙 확인 필요
- 가격: **consumption-based, 월 몇 달러부터 시작 (공식)**, 세부 티어는 Contact Sales. 무료 API Playground 제공

### 4) Lululab LUMINI (한국, 삼성 C-Lab 스핀오프)
- 한 줄: 한국 토종 K-beauty AI 대표주자. 하드웨어(LUMINI 키오스크 V2/V3) + iOS/Android/JS SDK. **92% 정확도 인증 주장, 한국인 데이터 학습 명시**
- 강점
  - **한국인 피부 데이터 기반 학습** (공식 보도자료 명시) + 500만 건 피부 분석 데이터 누적 (2026년 4월 Ludient 브랜드 론칭 시 공개)
  - 7개 지표(모공, 주름, 유분, 기미, 홍반, 여드름, 유수분 밸런스) — 요구사항 5지표와 거의 일치
  - 10초 이내 응답 (공식 스펙)
  - 한국어 네이티브 지원, 국내 개보법 대응 당연히 준수
  - 삼성 출신 → 국내 병원·H&B 도입 사례(올리브영, 신세계 등 과거 파일럿) 다수
- 약점
  - **공개 API 가격 없음, SDK 형태 유통 중심** → 소규모 MVP (일 10~500콜)에 대해 협상 피로도 큼
  - API보다 키오스크·리테일 B2B에 무게중심이 있어 소형 CRM 스타트업에 대한 우선순위 낮을 수 있음
  - 공식 영문 API 문서(Swagger 형태) 부재 — 계약 후 개별 제공 방식
- 가격: **확인 필요** (공식 문의 필요, SDK 라이선싱 방식)

### 5) Amorepacific "Dr. AMORE®" / AI Beauty Counselor
- 한 줄: 아모레퍼시픽 사내 R&D용 AI 진단, Azure OpenAI 기반 챗봇(AIBC)과 Skinsight(웨어러블 패치)까지 확장
- 강점
  - **한국인 여성 피부 데이터로 학습**(Dr. AMORE®)
  - 주름·색소·모공·홍반 등 요구 지표 대부분 커버
- 약점
  - **외부 제공 API 아님** — 자사 상용 인프라·앱에만 탑재. 제3자 B2B 라이선스 공개 사례 사실상 없음
  - MVP Phase 0에 도입 현실성 낮음
- 가격: 해당 없음 (퍼블릭 API 미제공)
- **결론: MVP 대상 후보에서 제외 권장**

### 6) Dr.G / 고운세상 코스메틱 AI 피부 분석
- 한 줄: K-dermocosmetic 브랜드 Dr.G가 자체 운영. 370,000장 한국인 피부 데이터 학습, 6지표 분석
- 강점
  - 한국인 데이터 기반 학습 명시
  - 유분·수분·민감도 분류 → 요구 지표에 부분 매핑
- 약점
  - **B2B API 판매 사업이 아님** (자사 앱 서비스 중심)
  - 외부 라이선싱 공식 채널 없음
- **결론: MVP 대상 후보에서 제외 권장**

### 7) AILabTools Skin Analyze (중국, 글로벌)
- 한 줄: 기술 커머디티화된 저가 API 벤더. `api.market`에서 무료 10콜/월, $10/월부터 시작
- 강점
  - **명확하게 공개된 가격표** (Free 10 calls / $10+/mo) — MVP 트래픽 구간에 가장 저렴
  - Basic / Advanced / Pro 3단계 API 문서 공개 (`ailabtools.com/doc`)
  - 크레딧 기반(1~100 credits per call)으로 세분화
- 약점
  - **중국 학습 데이터 중심 추정** (회사 소재 및 마케팅). 한국인 특화 주장 없음
  - 뷰티 업계 실적·정확도 벤치마크 없음 — "얕은 기술" 리스크
  - 데이터센터 추정 위치 중국/홍콩 → 한국 개보법 국외이전 이슈 심각
  - 5지표 매핑이 공식 5요건(피부 나이/수분/색소/모공/주름)과 100% 일치하지 않을 수 있음 — 응답 필드 확인 필요
- 가격: **Free tier 10 calls/mo, from $10/mo** (공개)

### 8) 오픈소스 옵션: MediaPipe Face Mesh + 자체 모델
- 한 줄: Google MediaPipe가 제공하는 468 landmark 얼굴 메시는 무료·오픈소스지만, 피부 지표 예측은 **직접 모델 학습 필요**
- 강점
  - 런타임 비용 0, 완전한 데이터 통제(한국 개보법 완벽 대응)
  - 엣지/브라우저(WASM)에서 돌아가므로 이미지 업로드조차 불필요
- 약점
  - **피부 나이/수분/색소/모공/주름 예측 모델은 별도 학습 필수** — 데이터·MLOps 인력·6~12개월 리드타임 필요
  - MVP Phase 0 일정·인력 현실상 **비현실적**
- 가격: 자체 개발 비용 (수천만 원 단위)
- **결론: MVP 외 로드맵 Phase 2+ 장기 옵션**

### 9) SkinVision (네덜란드) - 참고용
- 한 줄: 피부암 스크리닝 특화(CE Class IIa 의료기기). B2C 앱 + 보험사 B2B가 본업
- **결론: 뷰티/에스테틱 지표(수분·모공·주름)는 제품 범위 밖. 스킵 권장**

---

## 2. 비교표

| 항목 | Haut.AI | Orbo.AI | Perfect Corp | Lululab | AILabTools |
|---|---|---|---|---|---|
| 본사 | 에스토니아 | 인도 | 대만 | 한국 | 중국 |
| 5지표(나이/수분/색소/모공/주름) 커버 | 전부 커버(+추가 100+) | 모공/색소/주름/텍스처 공식, 수분/나이 확인필요 | 14 concerns 중 매핑 필요 | 7지표 중 5개 직접 매핑 가능 | Advanced/Pro 등급에서 대부분 커버 |
| 응답 속도 | 실시간(공식 수치 미공개) | 실시간 공식 표방 | 저지연 공식 표방 | 10초 이내(공식) | 공식 미공개 |
| 한국인 학습 데이터 | 확인 필요(글로벌 3M) | 확인 필요(6 ethnicities) | 확인 필요(아시아 포함 추정) | **명시적으로 한국인 기반** | 확인 필요(중국 중심 추정) |
| 정확도 근거 | 자사 "98%" 수치(외부 논문 없음) | 외부 벤치마크 없음 | Wake Forest 검증 test-retest 95% | "92%+" (국내 인증기관, 세부 미공개) | 외부 검증 없음 |
| 공개 가격 | X (Contact Sales) | X (Contact Sales) | △ (월 $몇 from, 세부 비공개) | X (Contact Sales) | **O ($0 free 10콜 / $10+/mo)** |
| 무료 티어 | 데모만 | 데모만 | **API Playground 무료** | 데모만 | **10콜/월 무료** |
| REST API 문서 | Swagger 공개 | 비공개 PDF 제공 | 공개 + Playground | 계약 후 제공 | 공개 |
| SDK (iOS/Android/JS) | JS widget | 모바일 SDK 제공 | 전체 플랫폼 SDK | 전체 플랫폼 SDK | REST only |
| 한국어 공식 지원 | X | X | **O (한국어 사이트 운영)** | **O (한국 본사)** | X |
| 개인정보 처리 | EU 저장, 1년 보관 | 확인 필요 | HIPAA/GDPR 준수 명시, 리전 확인 필요 | 한국 내 저장 가능(국내사) | 중국/홍콩 추정(리스크) |
| 한국 개보법 국외이전 이슈 | 있음(EU) | 있음(인도) | 있음(리전 협상 가능성) | **없음** | **심각** |
| 뷰티 업계 레퍼런스 | 다수 브랜드 | 인도·아시아 브랜드 | 800+ 브랜드 (EL, Coty, Cetaphil) | 국내 H&B·병원 | 미미 |

---

## 3. 종합 순위 TOP 3

### 1위 — Perfect Corp YouCam (종합 최우수)
- **추천 이유**: 유일하게 공개 consumption pricing("월 $몇 from") + 무료 API Playground + 한국어 공식 사이트 + 글로벌 800+ 브랜드 레퍼런스 + Wake Forest 외부 검증. MVP 단계에서 "영업 대면 없이 바로 착수" 가능한 조합이 여기뿐
- **리스크**: 한국인 특화 학습 명시가 없어, 초기 10~50명 고객 대상 **정확도 셀프 검증(샘플 30장 비교 테스트)** 필수

### 2위 — Lululab LUMINI (정확도/개보법 최강)
- **추천 이유**: 한국인 데이터 기반 학습 명시 + 국내사 → 개보법 이슈 0 + 7지표 중 5지표 정확 매핑 + 10초 응답 스펙. 에스테틱 산업 fit이 가장 좋음
- **리스크**: 가격이 비공개 + SDK 중심이라 최소 계약 단위가 클 가능성(월 고정비 수백만원?). 일 10콜 수준에서는 **ROI 불리 가능성 큼**. 영업 면담 필수

### 3위 — Haut.AI (지표 풍부함 · 국제 범용성)
- **추천 이유**: 지표 수(150+) 최다, Swagger/문서 성숙도 최고, 국제 브랜드 실적 탄탄
- **리스크**: 가격 비공개 + EU 리전 + 한국인 데이터 비중 불명 → 국내 에스테틱 MVP에는 "오버스펙 + 규제 피로" 조합

---

## 4. MVP Phase 0 최적 픽: **Perfect Corp YouCam Skin Analysis API**

### 선정 이유 (한 줄)
"공개된 consumption 가격 + 무료 Playground + 한국어 공식 지원 + 글로벌 검증" — MVP처럼 **일 10~500콜, 확정되지 않은 수요** 구간에서 영업 면담 없이 즉시 착수 가능한 유일한 옵션.

### 의사결정 체크리스트 (계약 전 반드시 확인)
1. API 응답 스키마에서 "피부 나이/수분/색소/모공/주름" 5지표가 개별 필드로 존재하는지 (14 concerns 매핑 확인)
2. **한국 리전 데이터센터 또는 한국 개보법 SCC/DPA 서명 가능 여부**
3. 요청 후 원본 이미지 **자동 폐기 옵션** (저장 0일) — 에스테틱 고객 동의 범위 축소에 유리
4. 샘플 30장 한국인 사진으로 정확도 AB 테스트 (Lululab 동시 비교 이상적)
5. 월 최소 청구액 / 최소 커밋 여부

### Phase 1 이후 고려할 대안 루트
- 한국 고객 100+ 확보 후 → **Lululab 도입 협상** (한국인 정확도 이득 + 개보법 완전 대응으로 스위칭)
- 장기 (2027+) → MediaPipe + 자체 모델 학습으로 **커머디티 비용 제거** (누적된 고객 피부 사진으로 파인튜닝 가능 시)

---

## 5. 리스크 포인트 요약

| # | 리스크 | 영향 | 대응 |
|---|---|---|---|
| R1 | Perfect Corp 데이터센터가 미국/대만 → **한국 개보법상 "개인정보 국외이전 동의"** 고객 약관에 필수 명시 필요 | 중 | 가입·진단 동의 UI에 국외이전 조항 넣기. 가능하면 한국 리전 옵션 협상 |
| R2 | Perfect Corp의 14 concerns가 요구 5지표에 1:1 매핑되지 않을 수 있음 | 중 | API Playground에서 한국인 샘플 3~5장 사전 테스트. 부족 시 자체 후처리(점수 정규화) 레이어 |
| R3 | Haut.AI 선택 시 **EU 저장 + 1년 보관** → 한국 개보법상 민감정보 보관기간 최소화 원칙 위배 소지 | 상 | 계약 시 즉시 폐기 옵션 확인 필수, 안 되면 Haut.AI 탈락 |
| R4 | AILabTools 선택 시 **중국 리전** → 개보법 국외이전 심사·고객 심리 저항 모두 큼 | 상 | 비용이 아무리 싸도 에스테틱 CRM에는 **비추천** |
| R5 | Lululab **최소 계약 단위**가 MVP 트래픽 대비 과도할 수 있음 | 중 | Phase 0은 Perfect Corp, Phase 1에서 Lululab 재평가 |
| R6 | 모든 외부 API 공통: **얼굴 이미지 업로드 거부 고객** 존재 가능 | 저 | 진단은 선택 기능으로 설계, 거부 시 수기 문진 대체 |
| R7 | "정확도 X%" 벤더 마케팅 수치는 자체 데이터셋 기준 — 실사용 편차 가능 | 중 | 도입 후 3개월간 상담사 육안 진단과 일치율 모니터링 |

---

## 6. "확인 필요" 항목 리스트 (후속 영업 미팅 질문지)

### Perfect Corp YouCam (1순위)
- [ ] Skin Analysis API 응답 필드 목록 전체 (피부 나이/수분/색소/모공/주름 개별 스코어 제공 여부)
- [ ] 한국 리전 또는 데이터 잔존 0초 옵션
- [ ] 월 최소 청구액, 일 10~500콜 구간 실제 예상 청구
- [ ] 한국인 샘플 정확도 벤치마크 공유 가능 여부
- [ ] DPA(Data Processing Agreement) 한국 개보법 대응 조항

### Lululab (2순위, Phase 1 대비)
- [ ] REST API 단독 라이선스 가능 여부 (하드웨어 번들 아닌 순수 API)
- [ ] 최소 월 고정비
- [ ] 5지표 직접 매핑 스펙 시트
- [ ] 셀프서브 온보딩 가능 여부

### Haut.AI (3순위, 글로벌 확장 대비)
- [ ] 이미지 보관기간 0일 옵션 가능 여부
- [ ] 한국인 샘플 학습 비중

---

## 참고 출처

- Haut.AI 공식: https://haut.ai/ , 문서 https://docs.saas.haut.ai/haut.ai , Privacy Notice https://haut.ai/privacy_notice
- Orbo.AI 공식: https://www.orbo.ai/smart-skinanalysis/ , API 가이드 https://blog.orbo.ai/skincare-api/
- Perfect Corp 한국: https://www.perfectcorp.com/ko/business/products/ai-skin-analysis-api , API Playground https://yce.perfectcorp.com/features/skin-analysis-api , CES 2026/Shoptalk 2026 공식 보도
- Lululab: https://www.lulu-lab.com/ , Korea Biomed https://www.koreabiomed.com/news/articleView.html?idxno=29223
- Amorepacific Dr. AMORE®: https://en.thekbs.co.kr/news/articleView.html?idxno=12579
- AILabTools: https://www.ailabtools.com/price , https://api.market/store/ailabtools/skin-analyze
- MediaPipe Face Mesh: https://github.com/google-ai-edge/mediapipe/wiki/MediaPipe-Face-Mesh
- SkinVision: https://www.skinvision.com/

> 리포트 내 구체적 수치(300만 장·95% 등)는 모두 벤더 공식 문서/보도자료 기반이며, 본 리포트는 이를 재인용하였다. 외부 피어리뷰 논문은 Perfect Corp(Wake Forest 검증)를 제외하면 찾지 못함 — 필요 시 도입 후 자체 벤치마크 필수.
