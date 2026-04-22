## Supabase schema apply

This repo includes SQL migrations under `supabase/migrations/`.

### Apply in Supabase
1. Open Supabase Dashboard → SQL Editor
2. Paste contents of `supabase/migrations/20260421_init_runs_rag.sql`
3. Run

### Required env (server)
- `SUPABASE_URL` (project URL; `/rest/v1` suffix is OK)
- `SUPABASE_SERVICE_ROLE_KEY` (secret; server only)

Optional:
- `ADMIN_API_KEY` for admin approve/reject APIs

