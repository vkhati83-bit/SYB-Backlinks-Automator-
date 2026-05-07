-- Autopilot settings
INSERT INTO settings (key, value, description) VALUES
  ('autopilot_enabled', 'false', 'Auto-pilot mode: researches, generates, and sends emails daily without manual review'),
  ('autopilot_run_hour', '8', 'UTC hour (0-23) when auto-pilot runs each day')
ON CONFLICT (key) DO NOTHING;
