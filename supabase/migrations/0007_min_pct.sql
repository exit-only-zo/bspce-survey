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
