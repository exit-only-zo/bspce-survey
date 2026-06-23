-- ===========================================================================
-- Locked responses + modification requests.
-- ===========================================================================
-- A submitted response is LOCKED. To change it, the holder files a modification
-- request that an admin must approve. Approval unlocks the response for one
-- edit; submitting again re-locks it.
-- ===========================================================================

-- Lock flag on the current response. Unlocked by an admin-approved request.
alter table survey_responses
  add column if not exists edit_unlocked boolean not null default false;

do $$ begin
  create type modification_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

-- One active request row per holder (latest state).
create table if not exists modification_requests (
  holder_id   uuid primary key references holders(id) on delete cascade,
  status      modification_status not null default 'pending',
  note        text,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text
);
create index if not exists modreq_status_idx on modification_requests(status);

alter table modification_requests enable row level security;

-- Holders may read their own request (drives the survey UI state).
drop policy if exists modreq_select_own on modification_requests;
create policy modreq_select_own on modification_requests
  for select using (
    holder_id in (select id from holders where email = auth_email())
  );
-- Inserts/updates go through server actions (service role).
