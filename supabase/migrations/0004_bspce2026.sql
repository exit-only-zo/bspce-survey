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
