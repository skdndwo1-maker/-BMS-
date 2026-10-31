-- Outbox pattern: approve_run commits run approval + outbox event atomically.
-- A relay worker claims pending events and indexes RAG asynchronously.
--
-- Apply in Supabase SQL Editor (see bottom for verification queries).
-- Safe: creates new table/functions only; does not drop columns or delete rows.
--
-- ── ROLLBACK (수동, 필요 시 아래만 실행) ─────────────────────────────────────
-- drop function if exists public.claim_outbox_events(int);
-- drop function if exists public.approve_run(uuid, text);
-- drop index if exists public.outbox_events_aggregate_idx;
-- drop index if exists public.outbox_events_pending_idx;
-- drop table if exists public.outbox_events;
-- (주의: outbox_events 테이블을 지우면 미처리 이벤트도 함께 삭제됩니다.
--  함수만 되돌리려면 drop function 두 줄만 실행하세요.)
-- ────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- outbox_events
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.outbox_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  payload jsonb not null default '{}'::jsonb,

  attempts int not null default 0,
  next_run_at timestamptz not null default now(),
  processed_at timestamptz null,
  dead_at timestamptz null,
  last_error text null
);

create index if not exists outbox_events_pending_idx
  on public.outbox_events (next_run_at asc)
  where processed_at is null and dead_at is null;

create index if not exists outbox_events_aggregate_idx
  on public.outbox_events (aggregate_type, aggregate_id, created_at desc);

comment on table public.outbox_events is
  'Transactional outbox for async side effects (e.g. RAG index after run approval).';

-- ─────────────────────────────────────────────────────────────────────────────
-- approve_run: status + review + outbox in one transaction
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.approve_run(
  p_run_id uuid,
  p_reviewer text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exists boolean;
  v_event_id uuid;
  v_reviewer text := nullif(trim(coalesce(p_reviewer, '')), '');
begin
  if p_run_id is null then
    raise exception 'run_id_required';
  end if;

  select exists(select 1 from public.runs r where r.id = p_run_id) into v_exists;
  if not v_exists then
    raise exception 'run_not_found';
  end if;

  update public.runs
  set status = 'approved',
      updated_at = now()
  where id = p_run_id;

  insert into public.reviews (run_id, decision, reason, reviewer)
  values (p_run_id, 'approved', null, v_reviewer);

  insert into public.outbox_events (
    event_type,
    aggregate_type,
    aggregate_id,
    payload,
    attempts,
    next_run_at
  )
  values (
    'run_approved_rag_index',
    'run',
    p_run_id,
    jsonb_build_object('run_id', p_run_id, 'reviewer', v_reviewer),
    0,
    now()
  )
  returning id into v_event_id;

  return jsonb_build_object(
    'ok', true,
    'run_id', p_run_id,
    'outbox_event_id', v_event_id
  );
end;
$$;

revoke all on function public.approve_run(uuid, text) from public;
grant execute on function public.approve_run(uuid, text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- claim_outbox_events: FOR UPDATE SKIP LOCKED for concurrent workers
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.claim_outbox_events(p_limit int default 5)
returns setof public.outbox_events
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select e.id
    from public.outbox_events e
    where e.processed_at is null
      and e.dead_at is null
      and e.next_run_at <= now()
    order by e.next_run_at asc
    limit greatest(1, least(coalesce(p_limit, 5), 50))
    for update skip locked
  )
  update public.outbox_events e
  set updated_at = now()
  from picked
  where e.id = picked.id
  returning e.*;
end;
$$;

revoke all on function public.claim_outbox_events(int) from public;
grant execute on function public.claim_outbox_events(int) to service_role;

-- ── VERIFY (SQL Editor에서 확인) ─────────────────────────────────────────────
-- select to_regclass('public.outbox_events');
-- select proname from pg_proc where proname in ('approve_run', 'claim_outbox_events');
-- select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'outbox_events'
--   order by ordinal_position;
