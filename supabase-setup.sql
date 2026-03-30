-- ============================================================
-- TROIAREUKE CRM - Supabase 전체 설정 SQL
-- Supabase Dashboard > SQL Editor에서 실행하세요
-- ============================================================

-- ============================================================
-- 기존 테이블 (CREATE IF NOT EXISTS)
-- ============================================================

-- 1. 지점(branches) 테이블
CREATE TABLE IF NOT EXISTS public.branches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  shop_type TEXT DEFAULT '',
  plan TEXT DEFAULT 'trial' CHECK (plan IN ('trial', 'starter', 'pro', 'enterprise')),
  trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 사용자 프로필(user_profiles) 테이블
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  phone TEXT,
  role TEXT DEFAULT 'staff' CHECK (role IN ('superadmin', 'admin', 'staff')),
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  is_onboarded BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 로그인 기록(login_logs) 테이블
CREATE TABLE IF NOT EXISTS public.login_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT,
  email TEXT NOT NULL,
  branch_id TEXT,
  branch_name TEXT,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  fail_reason TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 공지사항(announcements) 테이블
CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT,
  type TEXT DEFAULT 'info' CHECK (type IN ('info', 'warning', 'update', 'event')),
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 신규 테이블
-- ============================================================

-- 5. 고객(customers) 테이블
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  birth_date DATE,
  gender TEXT,
  grade TEXT,
  memo TEXT,
  skin_type TEXT,
  allergies TEXT,
  total_visits INTEGER DEFAULT 0,
  total_spent INTEGER DEFAULT 0,
  last_visit_date DATE,
  registered_at TIMESTAMPTZ DEFAULT NOW(),
  tags TEXT[],
  is_active BOOLEAN DEFAULT true,
  referral_source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. 서비스(services) 테이블
CREATE TABLE IF NOT EXISTS public.services (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,
  duration INTEGER,
  price INTEGER DEFAULT 0,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. 직원(staff) 테이블
CREATE TABLE IF NOT EXISTS public.staff (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  phone TEXT,
  email TEXT,
  specialty TEXT[],
  color TEXT,
  is_active BOOLEAN DEFAULT true,
  hire_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. 예약(reservations) 테이블
CREATE TABLE IF NOT EXISTS public.reservations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  customer_phone TEXT,
  staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  staff_name TEXT,
  services JSONB,
  date DATE,
  start_time TEXT,
  end_time TEXT,
  status TEXT DEFAULT 'confirmed',
  source TEXT,
  memo TEXT,
  total_price INTEGER DEFAULT 0,
  naver_booking_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. 프로그램(programs) 테이블
CREATE TABLE IF NOT EXISTS public.programs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,
  total_sessions INTEGER,
  validity_days INTEGER,
  price INTEGER DEFAULT 0,
  cost_price INTEGER DEFAULT 0,
  description TEXT,
  color TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. 고객 프로그램(customer_programs) 테이블
CREATE TABLE IF NOT EXISTS public.customer_programs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  program_id UUID REFERENCES public.programs(id) ON DELETE SET NULL,
  program_name TEXT,
  category TEXT,
  total_sessions INTEGER,
  used_sessions INTEGER DEFAULT 0,
  price_paid INTEGER DEFAULT 0,
  payment_method TEXT,
  purchase_date DATE,
  expiry_date DATE,
  is_completed BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. 시술 기록(treatment_logs) 테이블
CREATE TABLE IF NOT EXISTS public.treatment_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  customer_program_id UUID REFERENCES public.customer_programs(id) ON DELETE SET NULL,
  program_name TEXT,
  staff_name TEXT,
  treatment_date DATE,
  treatment_time TEXT,
  sessions_used INTEGER DEFAULT 1,
  treatment_details TEXT,
  skin_condition TEXT,
  staff_notes TEXT,
  next_appointment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. 제품(products) 테이블
CREATE TABLE IF NOT EXISTS public.products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,
  brand TEXT,
  price INTEGER DEFAULT 0,
  cost INTEGER DEFAULT 0,
  stock INTEGER DEFAULT 0,
  min_stock INTEGER DEFAULT 0,
  unit TEXT,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. 제품 판매(product_sales) 테이블
CREATE TABLE IF NOT EXISTS public.product_sales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT,
  quantity INTEGER DEFAULT 1,
  unit_price INTEGER DEFAULT 0,
  total_price INTEGER DEFAULT 0,
  payment_method TEXT,
  sale_date DATE,
  staff_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. 결제(payments) 테이블
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  payment_date DATE,
  type TEXT,
  type_label TEXT,
  reference_id UUID,
  amount INTEGER DEFAULT 0,
  payment_method TEXT,
  discount_amount INTEGER DEFAULT 0,
  status TEXT DEFAULT 'completed',
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. 매장 설정(shop_settings) 테이블
CREATE TABLE IF NOT EXISTS public.shop_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID NOT NULL UNIQUE REFERENCES public.branches(id) ON DELETE CASCADE,
  name TEXT,
  type TEXT,
  phone TEXT,
  address TEXT,
  business_hours JSONB,
  holidays JSONB,
  naver_booking JSONB,
  kakao JSONB,
  sms_api_key TEXT,
  sms_caller_id TEXT,
  point_rate INTEGER DEFAULT 1,
  notification_settings JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16. 메시지 템플릿(message_templates) 테이블
CREATE TABLE IF NOT EXISTS public.message_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT,
  title TEXT,
  content TEXT,
  variables TEXT[],
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 17. 메시지 발송 이력(message_history) 테이블
CREATE TABLE IF NOT EXISTS public.message_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  type TEXT,
  template_id UUID REFERENCES public.message_templates(id) ON DELETE SET NULL,
  template_name TEXT,
  title TEXT,
  content TEXT,
  recipients INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  fail_count INTEGER DEFAULT 0,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT,
  cost INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- RLS (Row Level Security) 활성화
-- ============================================================

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatment_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_history ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS 정책 — 기존 테이블
-- ============================================================

-- branches
CREATE POLICY "Authenticated users can read branches" ON public.branches
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert branches" ON public.branches
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update branches" ON public.branches
  FOR UPDATE TO authenticated USING (true);

-- user_profiles
CREATE POLICY "Users can read own profile" ON public.user_profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own profile" ON public.user_profiles
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update own profile" ON public.user_profiles
  FOR UPDATE TO authenticated USING (true);

-- login_logs
CREATE POLICY "Authenticated users can read login_logs" ON public.login_logs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can insert login_logs" ON public.login_logs
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anon can insert login_logs" ON public.login_logs
  FOR INSERT TO anon WITH CHECK (true);

-- announcements
CREATE POLICY "Authenticated users can read announcements" ON public.announcements
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage announcements" ON public.announcements
  FOR ALL TO authenticated USING (true);

-- ============================================================
-- RLS 정책 — 신규 테이블 (permissive, authenticated)
-- ============================================================

-- customers
CREATE POLICY "Authenticated full access on customers" ON public.customers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- services
CREATE POLICY "Authenticated full access on services" ON public.services
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- staff
CREATE POLICY "Authenticated full access on staff" ON public.staff
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- reservations
CREATE POLICY "Authenticated full access on reservations" ON public.reservations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- programs
CREATE POLICY "Authenticated full access on programs" ON public.programs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- customer_programs
CREATE POLICY "Authenticated full access on customer_programs" ON public.customer_programs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- treatment_logs
CREATE POLICY "Authenticated full access on treatment_logs" ON public.treatment_logs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- products
CREATE POLICY "Authenticated full access on products" ON public.products
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- product_sales
CREATE POLICY "Authenticated full access on product_sales" ON public.product_sales
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- payments
CREATE POLICY "Authenticated full access on payments" ON public.payments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- shop_settings
CREATE POLICY "Authenticated full access on shop_settings" ON public.shop_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- message_templates
CREATE POLICY "Authenticated full access on message_templates" ON public.message_templates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- message_history
CREATE POLICY "Authenticated full access on message_history" ON public.message_history
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 인덱스 (branch_id 기반 조회 최적화)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_customers_branch_id ON public.customers(branch_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(branch_id, phone);
CREATE INDEX IF NOT EXISTS idx_services_branch_id ON public.services(branch_id);
CREATE INDEX IF NOT EXISTS idx_staff_branch_id ON public.staff(branch_id);
CREATE INDEX IF NOT EXISTS idx_reservations_branch_id ON public.reservations(branch_id);
CREATE INDEX IF NOT EXISTS idx_reservations_date ON public.reservations(branch_id, date);
CREATE INDEX IF NOT EXISTS idx_reservations_customer_id ON public.reservations(customer_id);
CREATE INDEX IF NOT EXISTS idx_reservations_staff_id ON public.reservations(staff_id);
CREATE INDEX IF NOT EXISTS idx_programs_branch_id ON public.programs(branch_id);
CREATE INDEX IF NOT EXISTS idx_customer_programs_branch_id ON public.customer_programs(branch_id);
CREATE INDEX IF NOT EXISTS idx_customer_programs_customer_id ON public.customer_programs(customer_id);
CREATE INDEX IF NOT EXISTS idx_treatment_logs_branch_id ON public.treatment_logs(branch_id);
CREATE INDEX IF NOT EXISTS idx_treatment_logs_customer_id ON public.treatment_logs(customer_id);
CREATE INDEX IF NOT EXISTS idx_products_branch_id ON public.products(branch_id);
CREATE INDEX IF NOT EXISTS idx_product_sales_branch_id ON public.product_sales(branch_id);
CREATE INDEX IF NOT EXISTS idx_payments_branch_id ON public.payments(branch_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON public.payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON public.payments(branch_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_message_templates_branch_id ON public.message_templates(branch_id);
CREATE INDEX IF NOT EXISTS idx_message_history_branch_id ON public.message_history(branch_id);

-- ============================================================
-- 슈퍼어드민 프로필 삽입 (ON CONFLICT DO NOTHING)
-- auth.users에 해당 유저가 이미 생성되어 있어야 합니다.
-- 아래 UUID는 Supabase Auth에서 생성된 유저의 실제 UUID로 교체하세요.
-- ============================================================

-- INSERT INTO public.user_profiles (id, name, role, is_onboarded)
-- VALUES ('여기에-auth-user-uuid', '관리자', 'superadmin', true)
-- ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 완료! Supabase Dashboard > SQL Editor에서 위 전체를 실행하세요.
-- ============================================================
