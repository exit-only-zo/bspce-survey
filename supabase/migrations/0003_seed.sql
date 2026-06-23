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
