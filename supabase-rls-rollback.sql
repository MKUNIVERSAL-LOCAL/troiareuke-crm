-- ============================================================
-- RLS 수정 롤백 — supabase-rls-fix.sql 되돌리기
--
-- 사용 시기: RLS 적용 후 앱이 깨져서 긴급 원상복구 필요할 때만.
-- 주의: 롤백 직후 기존의 '모두 허용' 상태로 돌아가 보안 구멍 재오픈됨.
--       원인 파악 후 즉시 재적용 필수.
-- ============================================================

-- 1. 새로 만든 정책 삭제
DROP POLICY IF EXISTS "user_profiles_select" ON public.user_profiles;
DROP POLICY IF EXISTS "user_profiles_insert" ON public.user_profiles;
DROP POLICY IF EXISTS "user_profiles_update" ON public.user_profiles;
DROP POLICY IF EXISTS "user_profiles_delete" ON public.user_profiles;

DROP POLICY IF EXISTS "branches_select" ON public.branches;
DROP POLICY IF EXISTS "branches_insert" ON public.branches;
DROP POLICY IF EXISTS "branches_update" ON public.branches;
DROP POLICY IF EXISTS "branches_delete" ON public.branches;

DROP POLICY IF EXISTS "login_logs_select" ON public.login_logs;
DROP POLICY IF EXISTS "login_logs_insert" ON public.login_logs;

DROP POLICY IF EXISTS "announcements_select" ON public.announcements;
DROP POLICY IF EXISTS "announcements_modify" ON public.announcements;

DROP POLICY IF EXISTS "subscriptions_select" ON public.subscriptions;
DROP POLICY IF EXISTS "subscriptions_modify" ON public.subscriptions;

DROP POLICY IF EXISTS "customers_tenant_isolation" ON public.customers;
DROP POLICY IF EXISTS "services_tenant_isolation" ON public.services;
DROP POLICY IF EXISTS "staff_tenant_isolation" ON public.staff;
DROP POLICY IF EXISTS "reservations_tenant_isolation" ON public.reservations;
DROP POLICY IF EXISTS "programs_tenant_isolation" ON public.programs;
DROP POLICY IF EXISTS "customer_programs_tenant_isolation" ON public.customer_programs;
DROP POLICY IF EXISTS "treatment_logs_tenant_isolation" ON public.treatment_logs;
DROP POLICY IF EXISTS "products_tenant_isolation" ON public.products;
DROP POLICY IF EXISTS "product_sales_tenant_isolation" ON public.product_sales;
DROP POLICY IF EXISTS "payments_tenant_isolation" ON public.payments;
DROP POLICY IF EXISTS "shop_settings_tenant_isolation" ON public.shop_settings;
DROP POLICY IF EXISTS "message_templates_tenant_isolation" ON public.message_templates;
DROP POLICY IF EXISTS "message_history_tenant_isolation" ON public.message_history;

-- 2. 트리거·함수 삭제
DROP TRIGGER IF EXISTS user_profiles_privilege_guard ON public.user_profiles;
DROP FUNCTION IF EXISTS public.prevent_privilege_escalation();
DROP FUNCTION IF EXISTS public.current_branch_id();
DROP FUNCTION IF EXISTS public.is_superadmin();

-- 3. 기존 permissive 정책 복원 (이전 supabase-setup.sql 상태)
CREATE POLICY "Authenticated full access on customers" ON public.customers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access on services" ON public.services FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access on staff" ON public.staff FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access on reservations" ON public.reservations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access on programs" ON public.programs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access on customer_programs" ON public.customer_programs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access on treatment_logs" ON public.treatment_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access on products" ON public.products FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access on product_sales" ON public.product_sales FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access on payments" ON public.payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access on shop_settings" ON public.shop_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access on message_templates" ON public.message_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access on message_history" ON public.message_history FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Users can read own profile" ON public.user_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own profile" ON public.user_profiles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update own profile" ON public.user_profiles FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read branches" ON public.branches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert branches" ON public.branches FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update branches" ON public.branches FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read login_logs" ON public.login_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can insert login_logs" ON public.login_logs FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can read announcements" ON public.announcements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage announcements" ON public.announcements FOR ALL TO authenticated USING (true);

CREATE POLICY "all_subscriptions" ON public.subscriptions FOR ALL USING (true) WITH CHECK (true);
