-- ================================================================
-- 트로이아르케 CRM — Supabase DB 스키마
-- Supabase 대시보드 → SQL Editor에 붙여넣고 실행
-- ================================================================

-- ── 1. 지점 (branches) ──────────────────────────────────────────
create table if not exists public.branches (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  address       text,
  phone         text,
  shop_type     text,
  plan          text not null default 'trial',
  trial_ends_at timestamptz,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ── 2. 사용자 프로필 (user_profiles) ────────────────────────────
-- auth.users 테이블을 확장 (Supabase Auth 기반)
create table if not exists public.user_profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  name         text,
  phone        text,
  role         text not null default 'staff', -- 'superadmin' | 'admin' | 'staff'
  branch_id    uuid references public.branches(id) on delete set null,
  is_onboarded boolean not null default false,
  created_at   timestamptz not null default now()
);

-- ── 3. 로그인 기록 (login_logs) ──────────────────────────────────
create table if not exists public.login_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete set null,
  email        text not null,
  branch_id    uuid references public.branches(id) on delete set null,
  branch_name  text,
  status       text not null, -- 'success' | 'failed'
  fail_reason  text,
  device_info  text,
  logged_in_at timestamptz not null default now()
);

-- ── 인덱스 ──────────────────────────────────────────────────────
create index if not exists login_logs_logged_in_at_idx on public.login_logs(logged_in_at desc);
create index if not exists login_logs_email_idx on public.login_logs(email);
create index if not exists login_logs_branch_id_idx on public.login_logs(branch_id);
create index if not exists user_profiles_branch_id_idx on public.user_profiles(branch_id);

-- ── RLS (Row Level Security) ────────────────────────────────────
alter table public.branches enable row level security;
alter table public.user_profiles enable row level security;
alter table public.login_logs enable row level security;

-- 슈퍼어드민: 모든 데이터 접근
create policy "superadmin_all_branches" on public.branches
  for all using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role = 'superadmin'
    )
  );

create policy "superadmin_all_profiles" on public.user_profiles
  for all using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role = 'superadmin'
    )
  );

create policy "superadmin_all_logs" on public.login_logs
  for all using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role = 'superadmin'
    )
  );

-- 일반 사용자: 자기 지점 데이터만 접근
create policy "user_own_branch" on public.branches
  for select using (
    id = (select branch_id from public.user_profiles where id = auth.uid())
  );

create policy "user_own_profile" on public.user_profiles
  for select using (id = auth.uid());

create policy "user_insert_log" on public.login_logs
  for insert with check (true); -- 로그인 기록은 누구나 삽입 가능

-- ── 신규 유저 가입 시 user_profiles 자동 생성 트리거 ────────────
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.user_profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    'admin'
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── 슈퍼어드민 계정 설정 방법 ────────────────────────────────────
-- 1. Supabase Authentication → Users 탭에서 mkclub21@gmail.com 계정 생성
-- 2. 아래 SQL을 실행하여 슈퍼어드민 권한 부여:
--
-- update public.user_profiles
-- set role = 'superadmin'
-- where id = (select id from auth.users where email = 'mkclub21@gmail.com');
