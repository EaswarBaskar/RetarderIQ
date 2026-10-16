ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS vehicle_model TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS gps_latitude NUMERIC(9,6);
ALTER TABLE users ADD COLUMN IF NOT EXISTS gps_longitude NUMERIC(9,6);
ALTER TABLE users ADD COLUMN IF NOT EXISTS gps_address TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS location_consent_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_account_status_check;
ALTER TABLE users ADD CONSTRAINT users_account_status_check CHECK (account_status IN ('pending', 'active', 'rejected', 'suspended', 'deactivated'));
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique_idx ON users (technician_phone) WHERE technician_phone IS NOT NULL AND technician_phone <> '';
CREATE INDEX IF NOT EXISTS users_status_created_idx ON users (account_status, created_at DESC);
CREATE INDEX IF NOT EXISTS users_assignment_idx ON users (vehicle_manufacturer, vehicle_model);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  subject_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_subject_idx ON audit_logs (subject_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx ON password_reset_tokens (user_id, created_at DESC);
