## Supabase schema apply

This repo includes SQL migrations under `supabase/migrations/`.

### Apply in Supabase
1. Open Supabase Dashboard → SQL Editor (or Supabase CLI migrations)
2. Run migrations under `supabase/migrations/` in filename order (oldest first)
3. After `20260912_*` migrations: `npm run migrate:guidelines` (optional `--dry-run`)

### Required env (server)
- `SUPABASE_URL` (project URL; `/rest/v1` suffix is OK)
- `SUPABASE_SERVICE_ROLE_KEY` (secret; server only)

Optional:
- `ADMIN_API_KEY` for admin approve/reject APIs

