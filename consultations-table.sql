-- =====================================================
-- 트로이아르케 CRM — 고객 피부상담(consultations) 테이블
-- =====================================================
-- 실행: Supabase 대시보드 > SQL Editor 에 붙여넣고 Run
-- 코드(store)는 branch_id 기반 멀티테넌시 + 로그인 사용자 RLS 를 사용한다.
-- (다른 13개 테이블과 동일한 컨벤션)

CREATE TABLE IF NOT EXISTS consultations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id             UUID NOT NULL,
  customer_id           UUID,
  customer_name         TEXT,
  consult_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  staff_name            TEXT,

  -- 고객 주관적 피부 고민 (체크리스트 태그)
  concerns              TEXT[] DEFAULT '{}',

  -- 비컨(AI 피부진단기) 측정값 — 지표별 0~100 점수 등 (유연한 JSON)
  -- 예: { "moisture": 42, "oil": 70, "elasticity": 55, "pigmentation": 30,
  --       "pore": 60, "wrinkle": 25, "redness": 40, "sensitivity": 50, "skin_tone": 65 }
  beacon_metrics        JSONB DEFAULT '{}'::jsonb,

  -- 판정/소견/처방
  skin_type_result      TEXT,          -- 종합 피부타입 판정 (건성/지성/복합성/민감성/중성 등)
  manager_note          TEXT,          -- 관리사 소견
  recommended_solution  TEXT,          -- 1:1 맞춤 솔루션 제안 (서술)
  recommended_products  TEXT[] DEFAULT '{}',  -- 추천 제품/프로그램명
  next_consult_date     DATE,          -- 다음 상담/관리 권고일
  photos                TEXT[] DEFAULT '{}',  -- 전/후 사진 URL (선택)

  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consultations_branch   ON consultations(branch_id);
CREATE INDEX IF NOT EXISTS idx_consultations_customer ON consultations(customer_id);

-- ── RLS: 다른 테이블과 동일하게 로그인 사용자의 branch 데이터만 접근 ──
ALTER TABLE consultations ENABLE ROW LEVEL SECURITY;

-- 본인 소유 branch 의 상담만 읽기/쓰기 (branches.owner_id = auth.uid())
DROP POLICY IF EXISTS "consultations_branch" ON consultations;
CREATE POLICY "consultations_branch" ON consultations
  FOR ALL
  USING (
    branch_id IN (SELECT id FROM branches WHERE owner_id = auth.uid())
    OR branch_id IN (SELECT branch_id FROM user_profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    branch_id IN (SELECT id FROM branches WHERE owner_id = auth.uid())
    OR branch_id IN (SELECT branch_id FROM user_profiles WHERE id = auth.uid())
  );
