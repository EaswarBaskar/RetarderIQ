import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import bcrypt from 'bcryptjs';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;
const port = Number(process.env.PORT || 3000);
const jwtSecret = process.env.JWT_SECRET;
const databaseUrl = process.env.DATABASE_URL;
const frontendOrigin = process.env.FRONTEND_ORIGIN || `http://localhost:${port}`;

if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be configured with at least 32 characters.');
}
if (!databaseUrl) {
  throw new Error('DATABASE_URL must be configured.');
}

const pool = new Pool({ connectionString: databaseUrl });
const app = express();
let forwardWorkerRunning = false;
const adminEventClients = new Set();
const rateLimitBuckets = new Map();

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: frontendOrigin, credentials: false }));
app.use(express.json({ limit: '5mb' }));

function rateLimit({ windowMs = 60_000, max = 30 } = {}) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const current = rateLimitBuckets.get(key);
    const bucket = !current || now - current.startedAt >= windowMs
      ? { startedAt: now, count: 0 }
      : current;
    bucket.count += 1;
    rateLimitBuckets.set(key, bucket);
    if (bucket.count > max) {
      res.set('Retry-After', String(Math.ceil((bucket.startedAt + windowMs - now) / 1000)));
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    return next();
  };
}

const asyncHandler = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [key, bucket] of rateLimitBuckets) if (bucket.startedAt < cutoff) rateLimitBuckets.delete(key);
}, 15 * 60 * 1000).unref();

function signToken(user) {
  return jwt.sign({ sub: String(user.id), email: user.email, role: user.role }, jwtSecret, { expiresIn: '8h' });
}

function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Authentication required.' });

  try {
    req.user = jwt.verify(token, jwtSecret);
    return next();
  } catch {
    return res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.user?.role !== role) return res.status(403).json({ error: 'Administrator access required.' });
    return next();
  };
}

function notifyAdminClients(event, data) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of adminEventClients) {
    try { client.res.write(message); } catch { adminEventClients.delete(client); clearInterval(client.heartbeat); }
  }
}

async function deliverCase(caseId, payload) {
  const targets = [
    ['google', process.env.GOOGLE_APPS_SCRIPT_URL],
    ['powerautomate', process.env.POWER_AUTOMATE_FLOW_URL]
  ].filter(([, url]) => url);

  if (!targets.length) throw new Error('No reporting destination is configured.');

  const results = await Promise.all(targets.map(async ([name, url]) => {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-retarder-case-id': caseId
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000)
      });
      return response.ok ? null : `${name}: HTTP ${response.status}`;
    } catch (error) {
      return `${name}: ${error.message}`;
    }
  }));
  const failures = results.filter(Boolean);

  if (failures.length) {
    await pool.query(
      'UPDATE diagnostic_cases SET forward_status = $1, forward_error = $2, next_attempt_at = $3 WHERE id = $4',
      ['failed', failures.join('; '), new Date(Date.now() + 60_000), caseId]
    );
  } else {
    await pool.query(
      'UPDATE diagnostic_cases SET forward_status = $1, forwarded_at = NOW(), forward_error = NULL, next_attempt_at = NULL WHERE id = $2',
      ['sent', caseId]
    );
  }
}

async function processForwardQueue() {
  if (forwardWorkerRunning) return;
  forwardWorkerRunning = true;
  try {
    for (let processed = 0; processed < 10; processed += 1) {
      const claimed = await pool.query(`
        UPDATE diagnostic_cases
        SET forward_attempts = forward_attempts + 1,
            forward_status = 'pending',
            next_attempt_at = NULL
        WHERE id = (
          SELECT id FROM diagnostic_cases
          WHERE forward_status IN ('pending', 'failed')
            AND forward_attempts < 8
            AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
          ORDER BY created_at
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        RETURNING id, payload, forward_attempts
      `);
      const job = claimed.rows[0];
      if (!job) break;
      try {
        await deliverCase(job.id, job.payload);
      } catch (error) {
        const delayMs = Math.min(60 * 60 * 1000, 15_000 * (2 ** Math.max(0, job.forward_attempts - 1)));
        await pool.query(
          `UPDATE diagnostic_cases
           SET forward_status = 'failed', forward_error = $1,
               next_attempt_at = CASE WHEN forward_attempts >= 8 THEN NULL ELSE $2::timestamptz END
           WHERE id = $3`,
          [error.message, new Date(Date.now() + delayMs), job.id]
        );
      }
    }
  } catch (error) {
    console.error('[Forward queue] Worker error:', error.message);
  } finally {
    forwardWorkerRunning = false;
  }
}

async function createCaseNumber() {
  const result = await pool.query(`
    INSERT INTO diagnostic_case_sequences (case_date, last_number)
    VALUES (CURRENT_DATE, 1)
    ON CONFLICT (case_date)
    DO UPDATE SET last_number = diagnostic_case_sequences.last_number + 1
    RETURNING to_char(case_date, 'YYYYMMDD') AS date_part, last_number
  `);
  const sequence = result.rows[0];
  return `RIQ-${sequence.date_part}-${String(sequence.last_number).padStart(6, '0')}`;
}

app.get('/api/health', asyncHandler(async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    return res.json({ ok: true });
  } catch {
    return res.status(503).json({ ok: false });
  }
}));

app.post('/api/auth/login', rateLimit({ max: 10 }), asyncHandler(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const result = await pool.query(
    'SELECT id, email, password_hash, role FROM users WHERE email = $1 AND active = TRUE',
    [email]
  );
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  return res.json({ token: signToken(user), user: { id: user.id, email: user.email, role: user.role } });
}));

app.post('/api/auth/guest', rateLimit({ max: 20 }), asyncHandler(async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const phone = String(req.body?.phone || '').replace(/\D/g, '');
  const dealer = String(req.body?.dealer || '').trim();
  if (!name || phone.length < 10 || !dealer) {
    return res.status(400).json({ error: 'Technician name, valid phone, and dealer are required.' });
  }

  // Guest sessions are deliberately anonymous. Do not create a permanent
  // users row for every diagnostic session; the signed session id still lets
  // the technician retrieve their own reports during the token lifetime.
  const guestSessionId = crypto.randomUUID();
  const token = jwt.sign(
    { sub: guestSessionId, role: 'technician', guest: true },
    jwtSecret,
    { expiresIn: '12h' }
  );
  return res.status(201).json({ token, user: { id: guestSessionId, role: 'technician', guest: true } });
}));

app.get('/api/admin/events', (req, res) => {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  try {
    const user = jwt.verify(token, jwtSecret);
    if (user?.role !== 'admin') return res.status(403).end();
  } catch {
    return res.status(401).end();
  }
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write(': connected\n\n');
  const client = { res, heartbeat: setInterval(() => res.write(': heartbeat\n\n'), 25_000) };
  adminEventClients.add(client);
  req.on('close', () => { adminEventClients.delete(client); clearInterval(client.heartbeat); });
});

app.get('/api/users', requireAuth, requireRole('admin'), asyncHandler(async (_req, res) => {
  const result = await pool.query(
    'SELECT id, email, role, is_guest, active, created_at FROM users WHERE is_guest = FALSE ORDER BY created_at DESC'
  );
  return res.json({ users: result.rows });
}));

app.post('/api/users', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const role = req.body?.role === 'admin' ? 'admin' : 'technician';
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'A valid email is required.' });
  if (password.length < 10) return res.status(400).json({ error: 'Password must contain at least 10 characters.' });

  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role, active, created_at',
      [email, passwordHash, role]
    );
    return res.status(201).json({ user: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'A user with that email already exists.' });
    throw error;
  }
}));

app.patch('/api/users/:id/active', requireAuth, requireRole('admin'), async (req, res) => {
  const active = req.body?.active === true;
  const result = await pool.query(
    'UPDATE users SET active = $1 WHERE id = $2 RETURNING id, email, role, active, created_at',
    [active, req.params.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'User not found.' });
  return res.json({ user: result.rows[0] });
});

app.delete('/api/users/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const userId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(userId)) return res.status(400).json({ error: 'Invalid user id.' });
  if (String(userId) === String(req.user.sub)) return res.status(400).json({ error: 'You cannot delete your own admin account.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const user = await client.query('SELECT id, email, role FROM users WHERE id = $1 AND is_guest = FALSE FOR UPDATE', [userId]);
    if (!user.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found.' });
    }
    await client.query('UPDATE diagnostic_cases SET user_id = NULL WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM users WHERE id = $1', [userId]);
    await client.query('COMMIT');
    return res.json({ deleted: user.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

app.post('/api/diagnostics', rateLimit({ max: 60 }), requireAuth, asyncHandler(async (req, res) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'A diagnostic object is required.' });
  }

  const caseId = crypto.randomUUID();
  const idempotencyKey = String(req.get('idempotency-key') || '').trim();
  if (idempotencyKey.length > 180) return res.status(400).json({ error: 'Idempotency key is too long.' });
  if (idempotencyKey) {
    const existing = await pool.query(
      'SELECT id, case_number FROM diagnostic_cases WHERE idempotency_key = $1',
      [idempotencyKey]
    );
    if (existing.rows[0]) return res.status(202).json({ caseId: existing.rows[0].id, caseNumber: existing.rows[0].case_number, status: 'accepted', duplicate: true });
  }
  const caseNumber = await createCaseNumber();
  const casePayload = { ...req.body, 'Diagnostic Case ID': caseNumber };
  const ownerUserId = req.user.guest ? null : req.user.sub;
  const guestSessionId = req.user.guest ? req.user.sub : null;
  try {
    await pool.query(
      `INSERT INTO diagnostic_cases (id, case_number, user_id, guest_session_id, idempotency_key, payload)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [caseId, caseNumber, ownerUserId, guestSessionId, idempotencyKey || null, JSON.stringify(casePayload)]
    );
  } catch (error) {
    if (error.code === '23505' && idempotencyKey) {
      const existing = await pool.query('SELECT id, case_number FROM diagnostic_cases WHERE idempotency_key = $1', [idempotencyKey]);
      if (existing.rows[0]) return res.status(202).json({ caseId: existing.rows[0].id, caseNumber: existing.rows[0].case_number, status: 'accepted', duplicate: true });
    }
    throw error;
  }

  notifyAdminClients('diagnostic-updated', { caseId, caseNumber, status: casePayload['Diagnostic Status'] || 'IN PROGRESS' });

  return res.status(202).json({ caseId, caseNumber, status: 'accepted' });
}));

app.patch('/api/diagnostics/:caseId', requireAuth, asyncHandler(async (req, res) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'A diagnostic update object is required.' });
  }
  const ownership = req.user.guest
    ? '(guest_session_id = $2 AND user_id IS NULL)'
    : '(user_id = $2 AND guest_session_id IS NULL)';
  const owner = req.user.guest ? req.user.sub : Number(req.user.sub);
  const result = await pool.query(
    `UPDATE diagnostic_cases
        SET payload = jsonb_set(payload || $1::jsonb, '{Diagnostic Case ID}', to_jsonb(case_number))
      WHERE id = $3 AND ${ownership}
      RETURNING id, case_number, created_at, payload`,
    [JSON.stringify(req.body), owner, req.params.caseId]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Case not found or not owned by this session.' });
  notifyAdminClients('diagnostic-updated', { caseId: result.rows[0].id, caseNumber: result.rows[0].case_number, status: result.rows[0].payload?.['Diagnostic Status'] || 'IN PROGRESS' });
  return res.json({ ...result.rows[0], status: 'updated' });
}));

app.get('/api/diagnostics', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(Number.parseInt(req.query.pageSize, 10) || 50, 1), 1000);
  const search = String(req.query.search || '').trim();
  const status = String(req.query.status || '').trim();
  const region = String(req.query.region || '').trim();
  const manufacturer = String(req.query.manufacturer || '').trim();
  const language = String(req.query.language || '').trim();
  const feedback = String(req.query.feedback || '').trim();
  const kmRange = String(req.query.kmRange || '').trim();
  const dateFrom = String(req.query.dateFrom || '').trim();
  const dateTo = String(req.query.dateTo || '').trim();
  const where = [];
  const values = [];
  const add = (sql, value) => { values.push(value); where.push(sql.replace('?', `$${values.length}`)); };
  if (search) add(`concat_ws(' ', case_number, payload->>'Diagnostic Case ID', payload->>'Chassis No.', payload->>'Vehicle Registration No.', payload->>'Dealer / Location', payload->>'FSE Name', payload->>'Suspected Product') ILIKE '%' || ? || '%'`, search);
  if (status) add(`payload->>'Diagnostic Status' = ?`, status);
  if (region) add(`lower(payload->>'Region') = lower(?)`, region);
  if (manufacturer) add(`lower(payload->>'Vehicle Manufacturer') = lower(?)`, manufacturer);
  if (language) add(`lower(COALESCE(payload->>'Diagnostic Language Name', payload->>'Diagnostic Language', '')) = lower(?)`, language);
  if (/^[1-5]$/.test(feedback)) add(`payload->'Diagnostic Feedback'->>'clarity' = ?`, feedback);
  if (feedback === 'none') where.push(`(payload->'Diagnostic Feedback' IS NULL OR payload->'Diagnostic Feedback'->>'clarity' IS NULL OR payload->'Diagnostic Feedback'->>'clarity' = '')`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) add(`created_at::date >= ?::date`, dateFrom);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) add(`created_at::date <= ?::date`, dateTo);
  const kmSource = `regexp_replace(COALESCE(payload->>'Odometer Km', payload->>'Kms & Date of Sale', payload->>'Odometer', ''), ',', '', 'g')`;
  const kmValue = `NULLIF(substring(${kmSource} from '[0-9]+'), '')::numeric`;
  if (kmRange === '0-50000') where.push(`${kmValue} BETWEEN 0 AND 50000`);
  if (kmRange === '50001-100000') where.push(`${kmValue} BETWEEN 50001 AND 100000`);
  if (kmRange === '100001-plus') where.push(`${kmValue} >= 100001`);
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM diagnostic_cases ${clause}`, values);
  const offset = (page - 1) * pageSize;
  const listValues = [...values, pageSize, offset];
  const result = await pool.query(
    `SELECT id, case_number, created_at, forwarded_at, forward_status, forward_error, forward_attempts,
            jsonb_build_object(
              'Diagnostic Case ID', case_number,
              'Diagnostic Status', payload->>'Diagnostic Status',
              'Diagnostic Language', payload->>'Diagnostic Language',
              'Diagnostic Language Name', payload->>'Diagnostic Language Name',
              'Admin Report Language', COALESCE(payload->>'Admin Report Language', 'English'),
              'FSE Name', payload->>'FSE Name',
              'Vehicle Registration No.', payload->>'Vehicle Registration No.',
              'Chassis No.', payload->>'Chassis No.',
              'Dealer / Location', payload->>'Dealer / Location',
              'Recommended Part No.', payload->>'Recommended Part No.',
              'Suspected Product', payload->>'Suspected Product',
              'Vehicle Manufacturer', payload->>'Vehicle Manufacturer',
              'Model', payload->>'Model',
              'Technician Phone', payload->>'Technician Phone',
              'Region', payload->>'Region',
              'Kms & Date of Sale', payload->>'Kms & Date of Sale',
              'Odometer Km', payload->>'Odometer Km',
              'Odometer', payload->>'Odometer',
              'Complaint Attended on', payload->>'Complaint Attended on',
              'Repeat complaint? Yes / No', payload->>'Repeat complaint? Yes / No',
              'Diagnostic Feedback', payload->'Diagnostic Feedback'
            ) AS payload
     FROM diagnostic_cases ${clause}
     ORDER BY created_at DESC
     LIMIT $${listValues.length - 1} OFFSET $${listValues.length}`,
    listValues
  );
  return res.json({ cases: result.rows, page, pageSize, total: countResult.rows[0].total, totalPages: Math.ceil(countResult.rows[0].total / pageSize) });
}));

app.get('/api/diagnostics/summary', requireAuth, requireRole('admin'), asyncHandler(async (_req, res) => {
  const result = await pool.query(`
    SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE payload->>'Diagnostic Status' = 'FAULT FOUND')::int AS faults,
      COUNT(*) FILTER (WHERE payload->>'Diagnostic Status' = 'WORKING SATISFACTORY')::int AS working,
      COUNT(*) FILTER (WHERE payload->>'Diagnostic Status' NOT IN ('FAULT FOUND', 'WORKING SATISFACTORY') OR payload->>'Diagnostic Status' IS NULL)::int AS incomplete,
      COUNT(*) FILTER (WHERE forward_status = 'sent')::int AS forwarded,
      COUNT(*) FILTER (WHERE forward_status IN ('pending', 'failed'))::int AS pending_forwarding,
      COALESCE(json_agg(DISTINCT payload->>'Vehicle Manufacturer') FILTER (WHERE payload->>'Vehicle Manufacturer' IS NOT NULL AND payload->>'Vehicle Manufacturer' <> ''), '[]') AS manufacturers
    FROM diagnostic_cases
  `);
  return res.json({ summary: result.rows[0] });
}));

app.get('/api/admin/diagnostics/:caseId', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const result = await pool.query(
    'SELECT id, case_number, payload, created_at, forwarded_at, forward_status, forward_error FROM diagnostic_cases WHERE id = $1',
    [req.params.caseId]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Case not found.' });
  return res.json(result.rows[0]);
}));

app.delete('/api/diagnostics', requireAuth, requireRole('admin'), async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? [...new Set(req.body.ids.filter(id => /^[0-9a-f-]{36}$/i.test(String(id))))] : [];
  if (!ids.length) return res.status(400).json({ error: 'Select at least one valid case.' });
  const result = await pool.query('DELETE FROM diagnostic_cases WHERE id = ANY($1::uuid[])', [ids]);
  return res.json({ deleted: result.rowCount });
});

app.get('/api/diagnostics/:caseId', requireAuth, asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT id, case_number, payload, created_at, forwarded_at, forward_status, forward_error
     FROM diagnostic_cases
     WHERE id = $1 AND ((user_id = $2 AND $3 = FALSE) OR (guest_session_id = $4 AND $3 = TRUE))`,
    [req.params.caseId, req.user.guest ? null : req.user.sub, Boolean(req.user.guest), req.user.guest ? req.user.sub : null]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Case not found.' });
  return res.json(result.rows[0]);
}));

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
app.use(express.static(rootDir));
app.get('/admin', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  return res.sendFile(path.join(rootDir, 'admin.html'));
});
app.get('*', (_req, res) => res.sendFile(path.join(rootDir, 'index.html')));

app.use((error, _req, res, _next) => {
  console.error('[API]', error);
  if (res.headersSent) return;
  return res.status(500).json({ error: 'Internal server error.' });
});

async function bootstrap() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'technician' CHECK (role IN ('admin', 'technician')),
      is_guest BOOLEAN NOT NULL DEFAULT FALSE,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_guest BOOLEAN NOT NULL DEFAULT FALSE;
    CREATE TABLE IF NOT EXISTS diagnostic_cases (
      id UUID PRIMARY KEY,
      case_number TEXT UNIQUE,
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
    ALTER TABLE diagnostic_cases ADD COLUMN IF NOT EXISTS case_number TEXT;
    ALTER TABLE diagnostic_cases ALTER COLUMN user_id DROP NOT NULL;
    ALTER TABLE diagnostic_cases ADD COLUMN IF NOT EXISTS guest_session_id UUID;
    ALTER TABLE diagnostic_cases ADD COLUMN IF NOT EXISTS forward_attempts INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE diagnostic_cases ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE diagnostic_cases ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS diagnostic_cases_idempotency_key_idx ON diagnostic_cases (idempotency_key) WHERE idempotency_key IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS diagnostic_cases_case_number_idx ON diagnostic_cases (case_number);
    CREATE INDEX IF NOT EXISTS diagnostic_cases_user_created_idx ON diagnostic_cases (user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS diagnostic_cases_guest_created_idx ON diagnostic_cases (guest_session_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS diagnostic_cases_created_idx ON diagnostic_cases (created_at DESC);
    CREATE TABLE IF NOT EXISTS diagnostic_case_sequences (
      case_date DATE PRIMARY KEY,
      last_number INTEGER NOT NULL DEFAULT 0
    );
  `);

  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || '');
  if (email && password) {
    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'admin')
       ON CONFLICT (email) DO NOTHING`,
      [email, hash]
    );
  }

  app.listen(port, () => {
    console.log(`Retarder IQ server listening on port ${port}`);
    console.log('Forwarding is handled by the separate worker process: npm run worker');
  });
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
