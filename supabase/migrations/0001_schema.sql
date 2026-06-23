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
