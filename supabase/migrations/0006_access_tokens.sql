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
