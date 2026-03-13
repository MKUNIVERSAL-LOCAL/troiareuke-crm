-- =====================================================
-- 트로이아르케 CRM — Supabase PostgreSQL Schema
-- =====================================================
-- 실행 방법: Supabase 대시보드 > SQL Editor에 붙여넣기 후 실행

-- ① shops: 고객사 (각 피부관리실/네일샵)
CREATE TABLE IF NOT EXISTS shops (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  type         TEXT NOT NULL DEFAULT '피부관리실',
  phone        TEXT,
  address      TEXT,
  plan         TEXT NOT NULL DEFAULT 'trial',  -- trial | starter | pro | enterprise
  trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ② customers: 고객사별 고객
CREATE TABLE IF NOT EXISTS customers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id        UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  phone          TEXT,
  email          TEXT,
  birth_date     DATE,
  gender         TEXT DEFAULT '미입력',  -- 여성 | 남성 | 미입력
  grade          TEXT DEFAULT '신규',   -- VIP | 골드 | 일반 | 신규
  skin_type      TEXT,
  allergies      TEXT,
  memo           TEXT,
  referral_source TEXT,
  tags           TEXT[] DEFAULT '{}',
  total_visits   INTEGER DEFAULT 0,
  total_spent    INTEGER DEFAULT 0,    -- 누적 결제금액 (원)
  last_visit_date DATE,
  is_active      BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ③ programs: 시술 프로그램 정의 (10회권, 패키지 등)
CREATE TABLE IF NOT EXISTS programs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,         -- 예: 기본 피부관리 10회권
  category        TEXT,                  -- 피부관리 | 네일 | 마사지 | 왁싱 | 복합
  total_sessions  INTEGER,               -- NULL이면 기간제 (횟수 없음)
  validity_days   INTEGER,               -- 유효기간 (일수), NULL이면 무제한
  price           INTEGER NOT NULL,      -- 판매가 (원)
  cost_price      INTEGER DEFAULT 0,     -- 원가 (선택)
  description     TEXT,
  color           TEXT DEFAULT '#1a3a8f', -- 캘린더 표시 색상
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ④ customer_programs: 고객에게 등록된 프로그램 (회권 구매 기록)
CREATE TABLE IF NOT EXISTS customer_programs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id          UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  customer_id      UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  program_id       UUID REFERENCES programs(id) ON DELETE SET NULL,
  program_name     TEXT NOT NULL,        -- 구매 당시 프로그램명 스냅샷
  total_sessions   INTEGER,              -- 구매 당시 총 횟수
  used_sessions    INTEGER DEFAULT 0,   -- 사용한 횟수
  price_paid       INTEGER NOT NULL,     -- 실제 결제금액
  payment_method   TEXT DEFAULT '카드', -- 카드 | 현금 | 계좌이체 | 카카오페이
  purchase_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  expiry_date      DATE,                -- 유효기간 만료일
  is_completed     BOOLEAN DEFAULT FALSE, -- 완료(소진) 여부
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  -- 잔여 횟수 계산
  CONSTRAINT valid_sessions CHECK (used_sessions >= 0 AND (total_sessions IS NULL OR used_sessions <= total_sessions))
);

-- ⑤ treatment_logs: 시술 기록 (회차 차감)
CREATE TABLE IF NOT EXISTS treatment_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id             UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  customer_id         UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  customer_program_id UUID REFERENCES customer_programs(id) ON DELETE SET NULL,
  staff_id            UUID,              -- staff 테이블 연동 예정
  staff_name          TEXT,
  treatment_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  treatment_time      TIME,
  sessions_used       INTEGER DEFAULT 1,
  treatment_details   TEXT,              -- 시술 내용 상세
  skin_condition      TEXT,             -- 피부 상태 메모
  staff_notes         TEXT,             -- 직원 메모
  next_appointment    DATE,             -- 다음 예약 권고일
  before_photo_url    TEXT,
  after_photo_url     TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ⑥ products: 홈케어 제품 목록
CREATE TABLE IF NOT EXISTS products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  brand           TEXT,
  category        TEXT,                  -- 세럼 | 크림 | 클렌저 | 앰플 | 선케어 | 기타
  cost_price      INTEGER DEFAULT 0,    -- 원가
  selling_price   INTEGER NOT NULL,     -- 판매가
  stock_quantity  INTEGER DEFAULT 0,
  min_stock       INTEGER DEFAULT 5,    -- 최소 재고 (이하 시 알림)
  unit            TEXT DEFAULT '개',
  description     TEXT,
  image_url       TEXT,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ⑦ product_sales: 제품 판매 기록
CREATE TABLE IF NOT EXISTS product_sales (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  customer_id     UUID REFERENCES customers(id) ON DELETE SET NULL,
  product_id      UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name    TEXT NOT NULL,        -- 판매 당시 제품명 스냅샷
  quantity        INTEGER NOT NULL DEFAULT 1,
  unit_price      INTEGER NOT NULL,
  total_price     INTEGER NOT NULL,
  payment_method  TEXT DEFAULT '카드',
  sale_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  staff_name      TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ⑧ payments: 전체 결제 기록 (통합 매출)
CREATE TABLE IF NOT EXISTS payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  customer_id     UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_name   TEXT,
  payment_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  type            TEXT NOT NULL,         -- program | product | single_treatment | other
  reference_id    UUID,                  -- customer_programs.id or product_sales.id
  amount          INTEGER NOT NULL,
  payment_method  TEXT NOT NULL DEFAULT '카드',
  discount_amount INTEGER DEFAULT 0,
  status          TEXT DEFAULT 'completed', -- completed | refunded | pending
  memo            TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ⑨ staff: 직원 목록
CREATE TABLE IF NOT EXISTS staff (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id     UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  role        TEXT DEFAULT '직원',      -- 원장 | 직원 | 파트타임
  phone       TEXT,
  email       TEXT,
  specialty   TEXT[] DEFAULT '{}',
  color       TEXT DEFAULT '#6366f1',
  is_active   BOOLEAN DEFAULT TRUE,
  hire_date   DATE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- Row Level Security (RLS) - 고객사별 데이터 분리
-- =====================================================
ALTER TABLE shops              ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_programs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE products           ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_sales      ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff              ENABLE ROW LEVEL SECURITY;

-- shops: 본인 샵만 접근
CREATE POLICY "shops_owner" ON shops
  FOR ALL USING (owner_id = auth.uid());

-- 나머지 테이블: 본인 샵 데이터만 접근
CREATE POLICY "customers_shop" ON customers
  FOR ALL USING (shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid()));

CREATE POLICY "programs_shop" ON programs
  FOR ALL USING (shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid()));

CREATE POLICY "customer_programs_shop" ON customer_programs
  FOR ALL USING (shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid()));

CREATE POLICY "treatment_logs_shop" ON treatment_logs
  FOR ALL USING (shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid()));

CREATE POLICY "products_shop" ON products
  FOR ALL USING (shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid()));

CREATE POLICY "product_sales_shop" ON product_sales
  FOR ALL USING (shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid()));

CREATE POLICY "payments_shop" ON payments
  FOR ALL USING (shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid()));

CREATE POLICY "staff_shop" ON staff
  FOR ALL USING (shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid()));

-- =====================================================
-- 유용한 뷰 (Views)
-- =====================================================

-- 월별 매출 요약 뷰
CREATE OR REPLACE VIEW monthly_revenue AS
SELECT
  shop_id,
  DATE_TRUNC('month', payment_date) AS month,
  SUM(CASE WHEN type = 'program' OR type = 'single_treatment' THEN amount ELSE 0 END) AS treatment_revenue,
  SUM(CASE WHEN type = 'product' THEN amount ELSE 0 END) AS product_revenue,
  SUM(amount) AS total_revenue,
  COUNT(*) AS payment_count
FROM payments
WHERE status = 'completed'
GROUP BY shop_id, DATE_TRUNC('month', payment_date);

-- 고객별 프로그램 잔여 횟수 뷰
CREATE OR REPLACE VIEW customer_program_status AS
SELECT
  cp.*,
  c.name AS customer_name,
  c.phone AS customer_phone,
  (cp.total_sessions - cp.used_sessions) AS remaining_sessions
FROM customer_programs cp
JOIN customers c ON cp.customer_id = c.id
WHERE cp.is_completed = FALSE;

-- =====================================================
-- Supabase 연동 방법
-- =====================================================
-- 1. supabase.com 에서 계정 생성
-- 2. New Project 클릭 → 프로젝트명: troiareuke-crm
-- 3. 위 SQL을 SQL Editor에 붙여넣기 후 Run 클릭
-- 4. Project Settings → API → URL, anon key 복사
-- 5. .env.local 파일에 아래와 같이 입력:
--    VITE_SUPABASE_URL=https://xxxxx.supabase.co
--    VITE_SUPABASE_ANON_KEY=eyJhbGc...
