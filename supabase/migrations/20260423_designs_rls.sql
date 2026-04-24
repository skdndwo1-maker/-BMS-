-- Enable Row Level Security for per-user designs
alter table public.designs enable row level security;

-- Only allow the authenticated owner to access/modify their rows.
-- NOTE: inserts require WITH CHECK; otherwise anon inserts could slip through.

drop policy if exists "본인 데이터만 접근" on public.designs;

create policy "본인 데이터만 접근(select)" on public.designs
for select
using (auth.uid()::text = user_id);

create policy "본인 데이터만 접근(insert)" on public.designs
for insert
with check (auth.uid()::text = user_id);

create policy "본인 데이터만 접근(update)" on public.designs
for update
using (auth.uid()::text = user_id)
with check (auth.uid()::text = user_id);

create policy "본인 데이터만 접근(delete)" on public.designs
for delete
using (auth.uid()::text = user_id);

