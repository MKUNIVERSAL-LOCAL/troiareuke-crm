-- ============================================================
-- TROIAREUKE CRM - Supabase 패치 SQL
-- login_logs 컬럼 추가 + subscriptions 테이블 생성
-- Supabase Dashboard > SQL Editor에서 실행하세요
-- ============================================================

-- 1. login_logs에 누락된 컬럼 추가
ALTER TABLE public.login_logs ADD COLUMN IF NOT EXISTS device_info TEXT;
ALTER TABLE public.login_logs ADD COLUMN IF NOT EXISTS logged_in_at TIMESTAMPTZ DEFAULT NOW();

-- 기존 데이터가 있으면 created_at 값을 logged_in_at에 복사
UPDATE public.login_logs SET logged_in_at = created_at WHERE logged_in_at IS NULL;

-- 2. subscriptions 테이블 (구독 관리)
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  plan TEXT DEFAULT 'trial' CHECK (plan IN ('trial', 'starter', 'pro', 'enterprise')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'pending', 'cancelled')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  amount INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all_subscriptions" ON public.subscriptions FOR ALL USING (true) WITH CHECK (true);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_subscriptions_branch_id ON public.subscriptions(branch_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);

-- ============================================================
-- 완료!
-- ============================================================
