-- Enable Row Level Security for per-user designs
alter table public.designs enable row level security;

-- Only allow the authenticated owner to access/modify their rows
create policy "본인 데이터만 접근"
on public.designs
for all
using (auth.uid()::text = user_id);

