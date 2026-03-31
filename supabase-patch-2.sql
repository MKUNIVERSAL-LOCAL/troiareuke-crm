-- ============================================================
-- PATCH 2: branches 테이블에 owner_id, phone, address 컬럼 추가
-- Supabase Dashboard > SQL Editor에서 실행하세요
-- ============================================================

ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS address TEXT;

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_branches_owner_id ON public.branches(owner_id);

-- ============================================================
-- 완료!
-- ============================================================
