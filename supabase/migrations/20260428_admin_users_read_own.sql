-- admin_users: 본인 행만 SELECT 가능 (클라이언트 관리자 여부 확인 fallback)
alter table public.admin_users enable row level security;

drop policy if exists "admin_users: read own row" on public.admin_users;
create policy "admin_users: read own row" on public.admin_users
for select
to authenticated
using (user_id = auth.uid());
