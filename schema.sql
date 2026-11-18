-- 생태계 탐험 교실 · 아이디 없이 입장하는 버전
-- Supabase > SQL Editor에서 전체를 1회 실행하세요.
-- 학생은 폼 입력 없이 Supabase 익명 세션을 사용합니다.
-- 교사는 계정을 만들지 않고 PIN으로 읽기 전용 자료를 조회합니다.
-- 주의: 00000은 교육용 간편 PIN으로 민감한 개인정보 보호에 적합하지 않습니다.

-- 1. 모둠별 학생 익명 세션 관리
create table if not exists public.group_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  group_no integer not null check (group_no between 1 and 6)
);
alter table public.group_memberships enable row level security;

drop policy if exists "students read own membership" on public.group_memberships;
create policy "students read own membership" on public.group_memberships
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "anonymous students join group" on public.group_memberships;
create policy "anonymous students join group" on public.group_memberships
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)
  );

drop policy if exists "anonymous students switch group" on public.group_memberships;
create policy "anonymous students switch group" on public.group_memberships
  for update to authenticated
  using (user_id = (select auth.uid()) and coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false))
  with check (user_id = (select auth.uid()) and coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false));

-- 2. 6개 모둠 활동을 저장할 테이블
create table if not exists public.group_work (
  group_no integer primary key check (group_no between 1 and 6),
  members text[] not null default '{}'::text[],
  activity jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.group_work enable row level security;

-- 이전 버전 교사 계정 정책을 포함해 교체합니다.
drop policy if exists "read own group or teacher" on public.group_work;
drop policy if exists "update own group or teacher" on public.group_work;
drop policy if exists "student read own group" on public.group_work;
drop policy if exists "student update own group" on public.group_work;
create policy "student read own group" on public.group_work
  for select to authenticated using (
    exists (select 1 from public.group_memberships m
      where m.user_id = (select auth.uid()) and m.group_no = group_work.group_no)
  );
create policy "student update own group" on public.group_work
  for update to authenticated
  using (exists (select 1 from public.group_memberships m
    where m.user_id = (select auth.uid()) and m.group_no = group_work.group_no))
  with check (exists (select 1 from public.group_memberships m
    where m.user_id = (select auth.uid()) and m.group_no = group_work.group_no));

insert into public.group_work(group_no)
select x from generate_series(1,6) as x on conflict (group_no) do nothing;

grant usage on schema public to anon, authenticated;
revoke all on public.group_memberships from anon, authenticated;
revoke all on public.group_work from anon, authenticated;
grant select,insert,update on public.group_memberships to authenticated;
grant select,update on public.group_work to authenticated;

-- 3. 서버 내부에 보관할 교사 PIN (브라우저 코드에 PIN 판별을 맡기지 않음)
create schema if not exists classroom_private;
revoke all on schema classroom_private from public, anon, authenticated;
create table if not exists classroom_private.teacher_gate (
  id integer primary key default 1 check (id=1),
  pin text not null
);
revoke all on classroom_private.teacher_gate from public, anon, authenticated;
insert into classroom_private.teacher_gate (id,pin)
values (1,'00000') on conflict (id) do nothing;

-- 주의: 아래 함수는 PIN을 아는 사람에게 6개 모둠 데이터를 돌려줍니다.
-- 00000처럼 쉬운 PIN은 실습용으로만 사용하세요.
create or replace function public.teacher_snapshot(p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_pin text;
  snapshot jsonb;
begin
  select t.pin into expected_pin from classroom_private.teacher_gate t where id=1;
  if expected_pin is null or p_pin is null or p_pin <> expected_pin then
    raise exception '교사 비밀번호가 올바르지 않습니다.' using errcode = '28000';
  end if;
  select coalesce(jsonb_agg(to_jsonb(g) order by g.group_no), '[]'::jsonb)
  into snapshot from public.group_work g;
  return snapshot;
end;
$$;
revoke all on function public.teacher_snapshot(text) from public;
grant execute on function public.teacher_snapshot(text) to anon, authenticated;

-- 4. 이전 버전의 Realtime 설정이 남아 있어도 동작에 지장이 없습니다.
-- 새 버전 교사 화면은 3초 간격으로 서버의 데이터를 확인합니다.

-- PIN 변경 예시: 아래 주석을 제거하고 수정해 별도로 실행하세요.
-- update classroom_private.teacher_gate set pin='63821' where id=1;
