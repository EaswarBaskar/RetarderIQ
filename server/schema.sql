CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'technician' CHECK (role IN ('admin', 'technician')),
  is_guest BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS diagnostic_cases (
  id UUID PRIMARY KEY,
  case_number TEXT NOT NULL UNIQUE,
  user_id BIGINT REFERENCES users(id),
  guest_session_id UUID,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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
