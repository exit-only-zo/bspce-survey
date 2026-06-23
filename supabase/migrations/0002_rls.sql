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
