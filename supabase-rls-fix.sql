-- ============================================================
-- 트로이아르케 CRM — RLS 정책 전면 재작성 (단계 1)
--
-- 목적: 13개 테이블 + user_profiles + branches + subscriptions의
--       RLS를 branch 단위 테넌트 격리로 전환.
--       권한 승격(role / branch_id 무단 변경) 방어 트리거 추가.
--
-- 실행: Supabase Dashboard → SQL Editor → 붙여넣고 Run 1회
-- 멱등성: 동일 SQL 재실행 해도 문제 없도록 작성 (DROP IF EXISTS 사용)
-- ============================================================

-- ============================================================
-- 1. 헬퍼 함수
-- ============================================================

-- 현재 로그인 유저의 branch_id 반환 (없으면 NULL).
-- SECURITY DEFINER: user_profiles RLS를 우회하여 재귀 방지.
-- STABLE: 트랜잭션 내에서 결과 캐싱 허용 (성능).
CREATE OR REPLACE FUNCTION public.current_branch_id()
RETURNS UUID
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT branch_id
  FROM public.user_profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$;

-- 현재 로그인 유저가 슈퍼어드민인지.
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND role = 'superadmin'
  );
$$;

-- 함수 권한: authenticated만 호출 가능 (anon은 불필요)
REVOKE ALL ON FUNCTION public.current_branch_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_superadmin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_branch_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_superadmin() TO authenticated;

-- ============================================================
-- 2. 기존 Permissive 정책 전부 삭제
-- ============================================================

-- branches
DROP POLICY IF EXISTS "Authenticated users can read branches" ON public.branches;
DROP POLICY IF EXISTS "Authenticated users can insert branches" ON public.branches;
DROP POLICY IF EXISTS "Authenticated users can update branches" ON public.branches;
DROP POLICY IF EXISTS "superadmin_all_branches" ON public.branches;
DROP POLICY IF EXISTS "user_own_branch" ON public.branches;

-- user_profiles
DROP POLICY IF EXISTS "Users can read own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "superadmin_all_profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "user_own_profile" ON public.user_profiles;

-- login_logs
DROP POLICY IF EXISTS "Authenticated users can read login_logs" ON public.login_logs;
DROP POLICY IF EXISTS "Anyone can insert login_logs" ON public.login_logs;
DROP POLICY IF EXISTS "Anon can insert login_logs" ON public.login_logs;
DROP POLICY IF EXISTS "superadmin_all_logs" ON public.login_logs;
DROP POLICY IF EXISTS "user_insert_log" ON public.login_logs;

-- announcements
DROP POLICY IF EXISTS "Authenticated users can read announcements" ON public.announcements;
DROP POLICY IF EXISTS "Authenticated users can manage announcements" ON public.announcements;

-- 13개 branch-scoped 테이블
DROP POLICY IF EXISTS "Authenticated full access on customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated full access on services" ON public.services;
DROP POLICY IF EXISTS "Authenticated full access on staff" ON public.staff;
DROP POLICY IF EXISTS "Authenticated full access on reservations" ON public.reservations;
DROP POLICY IF EXISTS "Authenticated full access on programs" ON public.programs;
DROP POLICY IF EXISTS "Authenticated full access on customer_programs" ON public.customer_programs;
DROP POLICY IF EXISTS "Authenticated full access on treatment_logs" ON public.treatment_logs;
DROP POLICY IF EXISTS "Authenticated full access on products" ON public.products;
DROP POLICY IF EXISTS "Authenticated full access on product_sales" ON public.product_sales;
DROP POLICY IF EXISTS "Authenticated full access on payments" ON public.payments;
DROP POLICY IF EXISTS "Authenticated full access on shop_settings" ON public.shop_settings;
DROP POLICY IF EXISTS "Authenticated full access on message_templates" ON public.message_templates;
DROP POLICY IF EXISTS "Authenticated full access on message_history" ON public.message_history;

-- subscriptions
DROP POLICY IF EXISTS "all_subscriptions" ON public.subscriptions;

-- ============================================================
-- 3. user_profiles 정책 (본인 것만, 권한 승격 방지)
-- ============================================================

-- SELECT: 본인 프로필 또는 슈퍼어드민
CREATE POLICY "user_profiles_select" ON public.user_profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_superadmin());

-- INSERT: handle_new_user 트리거가 SECURITY DEFINER로 RLS 우회해서 생성.
-- 수동 INSERT는 자기 id만 + role이 superadmin이면 안 됨 (권한 승격 방지).
CREATE POLICY "user_profiles_insert" ON public.user_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    (id = auth.uid() AND COALESCE(role, 'staff') <> 'superadmin')
    OR public.is_superadmin()
  );

-- UPDATE: 본인 프로필만 수정 가능. role/branch_id 변경은 아래 트리거로 차단.
CREATE POLICY "user_profiles_update" ON public.user_profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_superadmin())
  WITH CHECK (id = auth.uid() OR public.is_superadmin());

-- DELETE: 슈퍼어드민만
CREATE POLICY "user_profiles_delete" ON public.user_profiles
  FOR DELETE TO authenticated
  USING (public.is_superadmin());

-- 권한 승격 방어 트리거: role/branch_id 변경은 슈퍼어드민만
CREATE OR REPLACE FUNCTION public.prevent_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- role 변경 시도
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT public.is_superadmin() THEN
      RAISE EXCEPTION 'permission_denied: only superadmin can change role';
    END IF;
  END IF;

  -- branch_id 변경 시도 (최초 온보딩은 허용, 재할당은 슈퍼어드민만)
  IF NEW.branch_id IS DISTINCT FROM OLD.branch_id THEN
    IF OLD.branch_id IS NOT NULL AND NOT public.is_superadmin() THEN
      RAISE EXCEPTION 'permission_denied: only superadmin can reassign branch';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_profiles_privilege_guard ON public.user_profiles;
CREATE TRIGGER user_profiles_privilege_guard
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE PROCEDURE public.prevent_privilege_escalation();

-- ============================================================
-- 4. branches 정책 (본인 소유 지점 또는 슈퍼어드민)
-- ============================================================

-- 주의: branches에 owner_id UUID 컬럼이 존재해야 함 (supabase-patch-2.sql에서 추가됨)

-- SELECT: 본인 지점 또는 슈퍼어드민
CREATE POLICY "branches_select" ON public.branches
  FOR SELECT TO authenticated
  USING (
    id = public.current_branch_id()
    OR owner_id = auth.uid()
    OR public.is_superadmin()
  );

-- INSERT: 본인이 owner인 지점 생성 (온보딩)
CREATE POLICY "branches_insert" ON public.branches
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() OR public.is_superadmin());

-- UPDATE: 본인 지점 또는 슈퍼어드민
CREATE POLICY "branches_update" ON public.branches
  FOR UPDATE TO authenticated
  USING (
    id = public.current_branch_id()
    OR owner_id = auth.uid()
    OR public.is_superadmin()
  )
  WITH CHECK (
    id = public.current_branch_id()
    OR owner_id = auth.uid()
    OR public.is_superadmin()
  );

-- DELETE: 슈퍼어드민만
CREATE POLICY "branches_delete" ON public.branches
  FOR DELETE TO authenticated
  USING (public.is_superadmin());

-- ============================================================
-- 5. login_logs 정책
-- ============================================================

-- SELECT: 슈퍼어드민만 (로그인 시도 이력은 민감 정보)
CREATE POLICY "login_logs_select" ON public.login_logs
  FOR SELECT TO authenticated
  USING (public.is_superadmin());

-- INSERT: anon/authenticated 모두 가능 (로그인 실패도 기록해야 하므로)
CREATE POLICY "login_logs_insert" ON public.login_logs
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- ============================================================
-- 6. announcements 정책
-- ============================================================

-- 공지는 모든 인증 유저가 읽을 수 있음
CREATE POLICY "announcements_select" ON public.announcements
  FOR SELECT TO authenticated
  USING (true);

-- 생성·수정·삭제는 슈퍼어드민만
CREATE POLICY "announcements_modify" ON public.announcements
  FOR ALL TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

-- ============================================================
-- 7. subscriptions 정책 (본인 지점 구독만)
-- ============================================================

CREATE POLICY "subscriptions_select" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (branch_id = public.current_branch_id() OR public.is_superadmin());

CREATE POLICY "subscriptions_modify" ON public.subscriptions
  FOR ALL TO authenticated
  USING (branch_id = public.current_branch_id() OR public.is_superadmin())
  WITH CHECK (branch_id = public.current_branch_id() OR public.is_superadmin());

-- ============================================================
-- 8. 13개 branch-scoped 테이블 정책 (테넌트 격리)
-- ============================================================

-- 매크로 유사 적용: 각 테이블에 동일 패턴.
-- 정책 하나로 SELECT/INSERT/UPDATE/DELETE 전부 커버 (FOR ALL).

CREATE POLICY "customers_tenant_isolation" ON public.customers
  FOR ALL TO authenticated
  USING (branch_id = public.current_branch_id() OR public.is_superadmin())
  WITH CHECK (branch_id = public.current_branch_id() OR public.is_superadmin());

CREATE POLICY "services_tenant_isolation" ON public.services
  FOR ALL TO authenticated
  USING (branch_id = public.current_branch_id() OR public.is_superadmin())
  WITH CHECK (branch_id = public.current_branch_id() OR public.is_superadmin());

CREATE POLICY "staff_tenant_isolation" ON public.staff
  FOR ALL TO authenticated
  USING (branch_id = public.current_branch_id() OR public.is_superadmin())
  WITH CHECK (branch_id = public.current_branch_id() OR public.is_superadmin());

CREATE POLICY "reservations_tenant_isolation" ON public.reservations
  FOR ALL TO authenticated
  USING (branch_id = public.current_branch_id() OR public.is_superadmin())
  WITH CHECK (branch_id = public.current_branch_id() OR public.is_superadmin());

CREATE POLICY "programs_tenant_isolation" ON public.programs
  FOR ALL TO authenticated
  USING (branch_id = public.current_branch_id() OR public.is_superadmin())
  WITH CHECK (branch_id = public.current_branch_id() OR public.is_superadmin());

CREATE POLICY "customer_programs_tenant_isolation" ON public.customer_programs
  FOR ALL TO authenticated
  USING (branch_id = public.current_branch_id() OR public.is_superadmin())
  WITH CHECK (branch_id = public.current_branch_id() OR public.is_superadmin());

CREATE POLICY "treatment_logs_tenant_isolation" ON public.treatment_logs
  FOR ALL TO authenticated
  USING (branch_id = public.current_branch_id() OR public.is_superadmin())
  WITH CHECK (branch_id = public.current_branch_id() OR public.is_superadmin());

CREATE POLICY "products_tenant_isolation" ON public.products
  FOR ALL TO authenticated
  USING (branch_id = public.current_branch_id() OR public.is_superadmin())
  WITH CHECK (branch_id = public.current_branch_id() OR public.is_superadmin());

CREATE POLICY "product_sales_tenant_isolation" ON public.product_sales
  FOR ALL TO authenticated
  USING (branch_id = public.current_branch_id() OR public.is_superadmin())
  WITH CHECK (branch_id = public.current_branch_id() OR public.is_superadmin());

CREATE POLICY "payments_tenant_isolation" ON public.payments
  FOR ALL TO authenticated
  USING (branch_id = public.current_branch_id() OR public.is_superadmin())
  WITH CHECK (branch_id = public.current_branch_id() OR public.is_superadmin());

CREATE POLICY "shop_settings_tenant_isolation" ON public.shop_settings
  FOR ALL TO authenticated
  USING (branch_id = public.current_branch_id() OR public.is_superadmin())
  WITH CHECK (branch_id = public.current_branch_id() OR public.is_superadmin());

CREATE POLICY "message_templates_tenant_isolation" ON public.message_templates
  FOR ALL TO authenticated
  USING (branch_id = public.current_branch_id() OR public.is_superadmin())
  WITH CHECK (branch_id = public.current_branch_id() OR public.is_superadmin());

CREATE POLICY "message_history_tenant_isolation" ON public.message_history
  FOR ALL TO authenticated
  USING (branch_id = public.current_branch_id() OR public.is_superadmin())
  WITH CHECK (branch_id = public.current_branch_id() OR public.is_superadmin());

-- ============================================================
-- 9. 검증 쿼리 (실행 후 수동 체크용)
-- ============================================================

-- 아래는 참고용 — 실행은 선택사항.
-- SELECT tablename, policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;

-- ============================================================
-- 완료
-- ============================================================
