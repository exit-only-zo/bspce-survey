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
