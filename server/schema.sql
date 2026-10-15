CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'technician' CHECK (role IN ('admin', 'technician')),
  is_guest BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('pending', 'active', 'rejected', 'suspended', 'deactivated')),
  technician_name TEXT,
  technician_phone TEXT,
  dealer_name TEXT,
  technician_type TEXT,
  vehicle_manufacturer TEXT,
  vehicle_model TEXT,
  city TEXT,
  state TEXT,
  gps_latitude NUMERIC(9,6),
  gps_longitude NUMERIC(9,6),
  gps_address TEXT,
  location_consent_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique_idx
  ON users (technician_phone) WHERE technician_phone IS NOT NULL AND technician_phone <> '';
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

CREATE TABLE IF NOT EXISTS diagnostic_cases (
  id UUID PRIMARY KEY,
  case_number TEXT NOT NULL UNIQUE,
  user_id BIGINT REFERENCES users(id),
  guest_session_id UUID,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  forwarded_at TIMESTAMPTZ,
  forward_status TEXT NOT NULL DEFAULT 'pending' CHECK (forward_status IN ('pending', 'sent', 'failed')),
  forward_error TEXT,
  forward_attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ DEFAULT NOW(),
  idempotency_key TEXT UNIQUE
);

CREATE INDEX IF NOT EXISTS diagnostic_cases_user_created_idx
  ON diagnostic_cases (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS diagnostic_cases_guest_created_idx
  ON diagnostic_cases (guest_session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS diagnostic_cases_created_idx
  ON diagnostic_cases (created_at DESC);

CREATE TABLE IF NOT EXISTS diagnostic_case_sequences (
  case_date DATE PRIMARY KEY,
  last_number INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS part_orders (
  id UUID PRIMARY KEY,
  case_number TEXT,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  portal TEXT NOT NULL CHECK (portal IN ('INTERNAL', 'IMPAL', 'MASTSF')),
  part_no TEXT NOT NULL,
  payload JSONB NOT NULL,
  whatsapp_status TEXT NOT NULL DEFAULT 'not_configured',
  whatsapp_error TEXT,
  whatsapp_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS part_orders_created_idx ON part_orders (created_at DESC);
CREATE INDEX IF NOT EXISTS part_orders_case_idx ON part_orders (case_number);
