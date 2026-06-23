-- ===========================================================================
-- Matera BSPCE — setup complet (toutes les migrations dans l'ordre).
-- À coller dans Supabase > SQL Editor > New query > Run. Idempotent.
-- ===========================================================================

-- >>> supabase/migrations/0001_schema.sql

-- ===========================================================================
-- Matera BSPCE Secondary Survey — Core schema
-- ===========================================================================
-- Run order: 0001_schema.sql -> 0002_rls.sql -> 0003_seed.sql
-- All timestamps are timestamptz (UTC). Money is numeric (never float).
-- ===========================================================================

create extension if not exists "pgcrypto"; -- for gen_random_uuid()

-- --- Enums -----------------------------------------------------------------
do $$ begin
  create type holder_type as enum ('current_employee', 'ex_employee');
exception when duplicate_object then null; end $$;

do $$ begin
  create type batch_status as enum ('active', 'voided');
exception when duplicate_object then null; end $$;

do $$ begin
  create type response_mode as enum ('percentage', 'binary');
exception when duplicate_object then null; end $$;

do $$ begin
  create type change_type as enum ('created', 'modified', 'withdrawn');
exception when duplicate_object then null; end $$;

-- --- holders ---------------------------------------------------------------
create table if not exists holders (
  id              uuid primary key default gen_random_uuid(),
  email           text not null unique,
  first_name      text,
  last_name       text,
  holder_type     holder_type not null default 'ex_employee',
  ordinary_shares integer not null default 0,
  nda_accepted_at timestamptz,
  data_as_of      date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
-- Enforce lowercase emails at the DB level (single source of truth for matching).
create or replace function lower_email() returns trigger as $$
begin
  new.email := lower(trim(new.email));
  return new;
end;
$$ language plpgsql;

drop trigger if exists holders_lower_email on holders;
create trigger holders_lower_email
  before insert or update on holders
  for each row execute function lower_email();

-- --- batches ---------------------------------------------------------------
create table if not exists batches (
  id           uuid primary key default gen_random_uuid(),
  holder_id    uuid not null references holders(id) on delete cascade,
  -- NOT NULL default '' so the unique constraint below is reliable (NULLs are
  -- treated as distinct in unique constraints, which would break idempotency).
  batch_name   text not null default '',
  strike_price numeric(12, 4) not null default 0,
  quantity     integer not null default 0,
  is_vested    boolean not null default false,
  status       batch_status not null default 'active',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists batches_holder_idx on batches(holder_id);
-- Idempotent imports: one logical batch per (holder, name, strike). On re-import
-- we upsert on this constraint, updating quantity/vesting while preserving the
-- admin-controlled `status` (voided batches stay voided).
alter table batches drop constraint if exists batches_unique_logical;
alter table batches add constraint batches_unique_logical
  unique (holder_id, batch_name, strike_price);

-- --- survey_responses (current state, one per holder) ----------------------
create table if not exists survey_responses (
  id                 uuid primary key default gen_random_uuid(),
  holder_id          uuid not null unique references holders(id) on delete cascade,
  response_mode      response_mode not null,
  percentage_to_sell integer check (percentage_to_sell between 0 and 100),
  accepts_full_sale  boolean,
  submitted_at       timestamptz not null default now(),
  last_modified_at   timestamptz not null default now(),
  ip_address         text,
  user_agent         text
);

-- --- response_history (full audit trail) -----------------------------------
create table if not exists response_history (
  id          uuid primary key default gen_random_uuid(),
  holder_id   uuid not null references holders(id) on delete cascade,
  snapshot    jsonb not null,
  changed_at  timestamptz not null default now(),
  ip_address  text,
  change_type change_type not null
);
create index if not exists response_history_holder_idx on response_history(holder_id, changed_at desc);

-- --- admin_settings (key-value store) --------------------------------------
create table if not exists admin_settings (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique,
  value      text,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- --- holder_overrides ------------------------------------------------------
create table if not exists holder_overrides (
  holder_id             uuid primary key references holders(id) on delete cascade,
  custom_price_current  numeric(12, 4),
  custom_price_ex_vested numeric(12, 4),
  custom_price_ex_unvested numeric(12, 4),
  custom_max_pct        integer check (custom_max_pct between 0 and 100),
  note                  text not null,
  created_at            timestamptz not null default now(),
  created_by            text
);

-- --- audit_log -------------------------------------------------------------
create table if not exists audit_log (
  id           uuid primary key default gen_random_uuid(),
  actor_email  text,
  action       text not null,
  target       text,
  before_value jsonb,
  after_value  jsonb,
  created_at   timestamptz not null default now(),
  ip_address   text
);
create index if not exists audit_log_created_idx on audit_log(created_at desc);
create index if not exists audit_log_actor_idx on audit_log(actor_email);
create index if not exists audit_log_action_idx on audit_log(action);

-- --- access_log ------------------------------------------------------------
create table if not exists access_log (
  id          uuid primary key default gen_random_uuid(),
  user_email  text,
  path        text,
  ip_address  text,
  user_agent  text,
  accessed_at timestamptz not null default now()
);
create index if not exists access_log_accessed_idx on access_log(accessed_at desc);
create index if not exists access_log_email_idx on access_log(user_email);

-- --- updated_at touch trigger ----------------------------------------------
create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists holders_touch on holders;
create trigger holders_touch before update on holders
  for each row execute function touch_updated_at();

drop trigger if exists batches_touch on batches;
create trigger batches_touch before update on batches
  for each row execute function touch_updated_at();

-- >>> supabase/migrations/0002_rls.sql

-- ===========================================================================
-- Row Level Security
-- ===========================================================================
-- Model:
--  * Holders authenticate via Supabase Auth (magic link). Their JWT email is
--    matched to holders.email. With the ANON key + their session, they can
--    READ only their own holder/batches/responses/history.
--  * ALL writes (submissions, imports, settings) go through server actions
--    using the SERVICE ROLE key, which bypasses RLS. Those paths enforce
--    authorization in application code and write audit rows.
--  * Admin reads also use the service role (server-side only).
--
-- Net effect: even if the anon key leaks, a holder can never read another
-- holder's data, and nobody can write via the anon key.
-- ===========================================================================

-- Helper: the authenticated user's email, lowercased.
create or replace function auth_email() returns text as $$
  select lower(nullif(current_setting('request.jwt.claims', true)::json ->> 'email', ''));
$$ language sql stable;

-- Enable RLS everywhere.
alter table holders          enable row level security;
alter table batches          enable row level security;
alter table survey_responses enable row level security;
alter table response_history enable row level security;
alter table admin_settings   enable row level security;
alter table holder_overrides enable row level security;
alter table audit_log        enable row level security;
alter table access_log       enable row level security;

-- --- holders: read own row only --------------------------------------------
drop policy if exists holders_select_own on holders;
create policy holders_select_own on holders
  for select using (email = auth_email());

-- --- batches: read own batches ---------------------------------------------
drop policy if exists batches_select_own on batches;
create policy batches_select_own on batches
  for select using (
    holder_id in (select id from holders where email = auth_email())
  );

-- --- survey_responses: read own --------------------------------------------
drop policy if exists responses_select_own on survey_responses;
create policy responses_select_own on survey_responses
  for select using (
    holder_id in (select id from holders where email = auth_email())
  );

-- --- response_history: read own --------------------------------------------
drop policy if exists history_select_own on response_history;
create policy history_select_own on response_history
  for select using (
    holder_id in (select id from holders where email = auth_email())
  );

-- --- admin_settings: holders may read the *public* settings -----------------
-- The /survey page needs prices, caps, deadline, webinar text, etc. These are
-- not secret from holders (they see indicative prices anyway). The primary
-- valuation is NOT stored here, so this is safe.
drop policy if exists settings_select_public on admin_settings;
create policy settings_select_public on admin_settings
  for select using (true);

-- --- holder_overrides / audit_log / access_log -----------------------------
-- No anon access at all. Service role only (bypasses RLS). No policies = deny.
-- (RLS is enabled, and with no permissive policy, anon/authenticated get nothing.)

-- >>> supabase/migrations/0003_seed.sql

-- ===========================================================================
-- Seed default admin_settings.
-- Idempotent: on conflict do nothing, so re-running never clobbers admin edits.
-- ===========================================================================
insert into admin_settings (key, value) values
  ('sale_price_current_employees',          '17'),
  ('sale_price_current_employees_max',      null),
  ('sale_price_ex_employees_vested',        '15.57'),
  ('sale_price_ex_employees_vested_max',    null),
  ('sale_price_ex_employees_unvested',      '14'),
  ('sale_price_ex_employees_unvested_max',  null),
  ('max_pct_current_employees',             '30'),
  ('max_pct_ex_employees',                  '100'),
  ('ex_employees_all_or_nothing',           'true'),
  ('survey_open',                           'true'),
  ('survey_deadline',                       null),
  ('webinar_info',                          null),
  ('support_email',                         'bspce-2026@matera.eu'),
  ('data_last_refreshed_at',                to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF')),
  ('test_mode',                             'false'),
  ('faq_markdown',                          null)
on conflict (key) do nothing;

-- >>> supabase/migrations/0004_bspce2026.sql

-- ===========================================================================
-- BSPCE 2026 import — schema extensions for Ryo's richer source file.
-- ===========================================================================
-- The "Par titulaires" sheet carries the manual employee status, matricule,
-- company email, founder tagging, and detailed vesting figures per grant.
-- "Sheet1" carries legal departure tracking for ex-employees in process.
--
-- Import strategy for batches is full-refresh per holder (delete + reinsert),
-- since the file is the source of truth — so we no longer need the natural
-- unique key on batches.
-- ===========================================================================

-- --- holders: richer identity + classification metadata --------------------
alter table holders add column if not exists employee_status text;       -- raw: 'Actif' | 'Ex-employé' | null
alter table holders add column if not exists is_founder boolean not null default false;
alter table holders add column if not exists matricule text;
alter table holders add column if not exists matera_email text;          -- ID Employé (@matera.*)
alter table holders add column if not exists contract_start_date date;
alter table holders add column if not exists needs_review boolean not null default false;
alter table holders add column if not exists has_login_email boolean not null default true;

-- --- batches: detailed grant figures ---------------------------------------
-- `quantity` now holds the SELLABLE quantity for this (vested|non-vested)
-- sub-batch. The raw finance figures live in `meta` for the admin/audit view.
alter table batches add column if not exists attribution_date date;
alter table batches add column if not exists expiration_date date;
alter table batches add column if not exists delegation text;
alter table batches add column if not exists meta jsonb;

-- Old natural-key constraint no longer applies (full-refresh import).
alter table batches drop constraint if exists batches_unique_logical;

-- --- departure_tracking: ex-employees with a closing exercise window --------
create table if not exists departure_tracking (
  holder_id              uuid primary key references holders(id) on delete cascade,
  uplaw_id               text,
  gender                 text,
  postal_address         text,
  departure_date         date,
  departure_cause        text,
  theoretical_deadline   date,
  exercise_deadline      date,        -- "Nouvelle limite d'exercice" (effective)
  bspce_granted          integer,
  bspce_vested_at_notif  integer,
  price_label            text,        -- raw e.g. "6,41 et 6,99"
  no_extension           boolean not null default false, -- "Non prolongation" (CRITICAL)
  admin_status           jsonb,       -- Uplaw workflow flags
  created_at             timestamptz not null default now()
);

alter table departure_tracking enable row level security;
-- No anon access; service role only (admin + holder-message logic server-side).

-- Holders can read their own departure record (drives the tailored message).
drop policy if exists departure_select_own on departure_tracking;
create policy departure_select_own on departure_tracking
  for select using (
    holder_id in (select id from holders where email = auth_email())
  );

-- >>> supabase/migrations/0005_modification_requests.sql

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

-- >>> supabase/migrations/0006_access_tokens.sql

-- ===========================================================================
-- Per-holder access token for unique magic-link URLs.
-- ===========================================================================
-- Each holder receives a unique, unguessable link (/s/<token>) by email. The
-- token is the credential — visiting the link starts a holder session. No
-- password, no email-entry step.
-- ===========================================================================

-- Column DEFAULT generates a URL-safe random token (24 bytes) on every insert,
-- so new holders always get one automatically.
alter table holders add column if not exists access_token text
  default translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_');

-- Backfill any existing rows that predate the column.
update holders
  set access_token = translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_')
  where access_token is null;

create unique index if not exists holders_access_token_idx on holders(access_token);

-- >>> supabase/migrations/0007_min_pct.sql

-- ===========================================================================
-- Current-employee % range becomes 20%–50% (configurable). Add the lower bound.
-- ===========================================================================
insert into admin_settings (key, value) values
  ('min_pct_current_employees', '20')
on conflict (key) do nothing;

-- Raise the current-employee ceiling to 50% on fresh installs that still hold
-- the old default of 30 (admin edits are preserved otherwise).
update admin_settings set value = '50'
  where key = 'max_pct_current_employees' and value = '30';

-- >>> supabase/migrations/0008_token_default.sql

-- ===========================================================================
-- Auto-generate holder access tokens at INSERT (column default), and backfill
-- any rows still missing a token. This replaces the app-side backfill, which
-- couldn't upsert {id, access_token} without tripping the email NOT NULL check.
-- ===========================================================================

alter table holders
  alter column access_token
  set default translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_');

update holders
  set access_token = translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_')
  where access_token is null;
