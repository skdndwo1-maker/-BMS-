-- Deliverable guides: per-artifact VI rule packs + inspection direction (admin-managed).
-- Additive only: new tables + nullable FK columns on runs. No drops/renames.
-- Apply in Supabase SQL Editor after review. Pair: 20261116_deliverable_guides_rollback.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- deliverables
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.deliverables (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  name text not null,
  channel text not null,
  status text not null default 'active',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deliverables_key_format check (key ~ '^[a-z0-9_]+$'),
  constraint deliverables_key_uniq unique (key),
  constraint deliverables_channel_check check (channel in ('office', 'online', 'offline', 'custom')),
  constraint deliverables_status_check check (status in ('active', 'archived'))
);

create index if not exists deliverables_status_sort_idx
  on public.deliverables (status, sort_order asc, created_at asc);

comment on table public.deliverables is
  'Admin-managed artifact types (poster, MMS, etc.) that can grow over time.';

-- ─────────────────────────────────────────────────────────────────────────────
-- deliverable_templates (template_id = catalog/builtin string; no FK)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.deliverable_templates (
  deliverable_id uuid not null references public.deliverables(id) on delete cascade,
  template_id text not null,
  primary key (deliverable_id, template_id)
);

create index if not exists deliverable_templates_template_id_idx
  on public.deliverable_templates (template_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- deliverable_guides (deliverable_id NULL = common guide)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.deliverable_guides (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid null references public.deliverables(id) on delete cascade,
  version int not null,
  status text not null default 'draft',
  content jsonb not null,
  content_hash text null,
  note text null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  published_at timestamptz null,
  constraint deliverable_guides_status_check check (status in ('draft', 'active', 'archived')),
  constraint deliverable_guides_version_positive check (version >= 1)
);

-- Version uniqueness: Postgres UNIQUE treats NULLs as distinct, so split indexes.
create unique index if not exists deliverable_guides_deliverable_version_uniq
  on public.deliverable_guides (deliverable_id, version)
  where deliverable_id is not null;

create unique index if not exists deliverable_guides_common_version_uniq
  on public.deliverable_guides (version)
  where deliverable_id is null;

-- At most one active guide per deliverable; at most one active common guide.
create unique index if not exists deliverable_guides_active_per_deliverable_uniq
  on public.deliverable_guides (deliverable_id)
  where status = 'active' and deliverable_id is not null;

create unique index if not exists deliverable_guides_active_common_uniq
  on public.deliverable_guides ((true))
  where status = 'active' and deliverable_id is null;

create index if not exists deliverable_guides_deliverable_status_idx
  on public.deliverable_guides (deliverable_id, status);

comment on table public.deliverable_guides is
  'Versioned JSON guide packs. deliverable_id NULL = shared/common rules.';

-- ─────────────────────────────────────────────────────────────────────────────
-- runs: nullable FKs only (additive)
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.runs
  add column if not exists deliverable_id uuid null references public.deliverables(id) on delete set null;

alter table public.runs
  add column if not exists common_guide_id uuid null references public.deliverable_guides(id) on delete set null;

alter table public.runs
  add column if not exists deliverable_guide_id uuid null references public.deliverable_guides(id) on delete set null;

create index if not exists runs_deliverable_created_at_idx
  on public.runs (deliverable_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- run_rule_verdicts
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.run_rule_verdicts (
  run_id uuid not null references public.runs(id) on delete cascade,
  guide_id uuid not null references public.deliverable_guides(id) on delete restrict,
  rule_id text not null,
  ai_verdict text not null,
  ai_reason text null,
  admin_verdict text null,
  reviewed_by uuid null,
  reviewed_at timestamptz null,
  primary key (run_id, guide_id, rule_id),
  constraint run_rule_verdicts_ai_verdict_check check (ai_verdict in ('pass', 'fail', 'na')),
  constraint run_rule_verdicts_admin_verdict_check check (
    admin_verdict is null or admin_verdict in ('pass', 'fail', 'na')
  )
);

create index if not exists run_rule_verdicts_rule_id_idx
  on public.run_rule_verdicts (rule_id);

create index if not exists run_rule_verdicts_guide_id_idx
  on public.run_rule_verdicts (guide_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: on, no policies → service_role only
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.deliverables enable row level security;
alter table public.deliverable_templates enable row level security;
alter table public.deliverable_guides enable row level security;
alter table public.run_rule_verdicts enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: publish (archive previous active, activate this draft) — atomic
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.publish_deliverable_guide(p_guide_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.deliverable_guides%rowtype;
  v_archived int := 0;
begin
  if p_guide_id is null then
    raise exception 'guide_id_required';
  end if;

  select * into v_row from public.deliverable_guides where id = p_guide_id for update;
  if not found then
    raise exception 'guide_not_found';
  end if;
  if v_row.status <> 'draft' then
    raise exception 'guide_not_draft';
  end if;

  if v_row.deliverable_id is null then
    update public.deliverable_guides
    set status = 'archived'
    where deliverable_id is null
      and status = 'active'
      and id <> p_guide_id;
    get diagnostics v_archived = row_count;
  else
    update public.deliverable_guides
    set status = 'archived'
    where deliverable_id = v_row.deliverable_id
      and status = 'active'
      and id <> p_guide_id;
    get diagnostics v_archived = row_count;
  end if;

  update public.deliverable_guides
  set status = 'active',
      published_at = now()
  where id = p_guide_id;

  return jsonb_build_object(
    'ok', true,
    'guide_id', p_guide_id,
    'version', v_row.version,
    'deliverable_id', v_row.deliverable_id,
    'archived_count', v_archived
  );
end;
$$;

revoke all on function public.publish_deliverable_guide(uuid) from public;
grant execute on function public.publish_deliverable_guide(uuid) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: rollback — copy an older version into a new draft (next version)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.rollback_deliverable_guide(
  p_guide_id uuid,
  p_created_by uuid default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src public.deliverable_guides%rowtype;
  v_next int;
  v_new_id uuid;
begin
  if p_guide_id is null then
    raise exception 'guide_id_required';
  end if;

  select * into v_src from public.deliverable_guides where id = p_guide_id;
  if not found then
    raise exception 'guide_not_found';
  end if;

  if v_src.deliverable_id is null then
    select coalesce(max(version), 0) + 1 into v_next
    from public.deliverable_guides
    where deliverable_id is null;
  else
    select coalesce(max(version), 0) + 1 into v_next
    from public.deliverable_guides
    where deliverable_id = v_src.deliverable_id;
  end if;

  insert into public.deliverable_guides (
    deliverable_id, version, status, content, content_hash, note, created_by, published_at
  ) values (
    v_src.deliverable_id,
    v_next,
    'draft',
    v_src.content,
    v_src.content_hash,
    coalesce(nullif(trim(p_note), ''), format('rollback from v%s', v_src.version)),
    p_created_by,
    null
  )
  returning id into v_new_id;

  return jsonb_build_object(
    'ok', true,
    'guide_id', v_new_id,
    'version', v_next,
    'source_guide_id', p_guide_id,
    'source_version', v_src.version,
    'deliverable_id', v_src.deliverable_id
  );
end;
$$;

revoke all on function public.rollback_deliverable_guide(uuid, uuid, text) from public;
grant execute on function public.rollback_deliverable_guide(uuid, uuid, text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed: deliverables + template links + common guide v1 draft
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.deliverables (key, name, channel, status, sort_order)
values
  ('poster', '포스터', 'offline', 'active', 10),
  ('x_banner', 'X배너', 'offline', 'active', 20),
  ('placard', '현수막', 'offline', 'active', 30),
  ('web_banner', '웹 배너', 'online', 'active', 40),
  ('sns', 'SNS', 'online', 'active', 50),
  ('mms', 'MMS/RCS', 'online', 'active', 60),
  ('presentation', '프레젠테이션', 'online', 'active', 70),
  ('office_web', '웹 사내공지', 'online', 'active', 80),
  ('safety_caution', '안전&주의', 'custom', 'active', 90)
on conflict (key) do nothing;

-- Template IDs match frontend/src/design/templates.ts builtins.
-- Note: RCS builtin id is rcs-568x368 (name shows 568×338).
insert into public.deliverable_templates (deliverable_id, template_id)
select d.id, t.template_id
from public.deliverables d
join (
  values
    ('poster', 'poster-a1'),
    ('poster', 'poster-a4'),
    ('x_banner', 'xbanner'),
    ('placard', 'placard-wide-landscape'),
    ('web_banner', 'marketing-web-2'),
    ('web_banner', 'marketing-hero'),
    ('sns', 'social-instagram-post'),
    ('sns', 'social-instagram-story'),
    ('sns', 'social-fhd-vertical'),
    ('sns', 'social-twitter'),
    ('sns', 'social-linkedin'),
    ('sns', 'marketing-facebook-cover'),
    ('mms', 'rcs-568x368'),
    ('presentation', 'presentation-slide'),
    ('presentation', 'presentation-slide-43'),
    ('office_web', 'web-notice-3-4'),
    ('safety_caution', 'safety-caution-maintenance')
) as t(key, template_id) on t.key = d.key
on conflict do nothing;

insert into public.deliverable_guides (
  deliverable_id, version, status, content, content_hash, note, published_at
)
select
  null,
  1,
  'draft',
  '{"summary":"","rules":[],"direction":{"focus":[],"strictness":"normal","ignore":[],"instructions":"","feedback_style":""},"examples":[]}'::jsonb,
  '41cc00f031e8571448f742652911137583d6ac5b91727127265d7c713fab4705',
  'common v1 draft (empty rules)',
  null
where not exists (
  select 1 from public.deliverable_guides g
  where g.deliverable_id is null and g.version = 1
);
