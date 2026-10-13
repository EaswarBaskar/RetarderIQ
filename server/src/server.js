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
const technicianTypes = new Set(['Authorized Dealer', 'Fleet Workshop', 'Roadside Assistance']);
const vehicleManufacturers = new Set(['ASHOK LEYLAND', 'TATA MOTORS', 'VECV']);
const assignedModels = {
  'ASHOK LEYLAND': new Set(['12M BS-IV (Retarder)', 'Viking BS-IV (Retarder)', 'Other BS-IV Retarder Bus', '12M BS-VI (Retarder)', 'Viking BS-VI (Retarder)', 'Other BS-VI Retarder Bus', '13.5M BS-VI (Retarder)']),
  'TATA MOTORS': new Set(['TML - 1822', 'TML - 1622']),
  VECV: new Set(['VECV - 6016', 'VECV - 6019'])
};

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: frontendOrigin, credentials: true }));
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

function normalizePhone(value) {
  const phone = String(value || '').replace(/\D/g, '');
  return phone.startsWith('91') && phone.length === 12 ? phone.slice(2) : phone;
}

function validateTechnicianInput(body, { requirePassword = true } = {}) {
  const email = String(body?.email || '').trim().toLowerCase();
  const password = String(body?.password || '');
  const technicianName = String(body?.technicianName || '').trim();
  const technicianPhone = normalizePhone(body?.technicianPhone);
  const dealerName = String(body?.dealerName || '').trim();
  const technicianType = String(body?.technicianType || '').trim();
  const vehicleManufacturer = String(body?.vehicleManufacturer || '').trim().toUpperCase();
  const vehicleModel = String(body?.vehicleModel || '').trim();
  const city = String(body?.city || '').trim();
  const state = String(body?.state || '').trim();
  const latitude = body?.gpsLatitude === '' || body?.gpsLatitude == null ? null : Number(body.gpsLatitude);
  const longitude = body?.gpsLongitude === '' || body?.gpsLongitude == null ? null : Number(body.gpsLongitude);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'A valid email is required.' };
  if (requirePassword && password.length < 10) return { error: 'Password must contain at least 10 characters.' };
  if (!technicianName || !/^\d{10}$/.test(technicianPhone) || !dealerName || !technicianTypes.has(technicianType) || !vehicleManufacturers.has(vehicleManufacturer) || !assignedModels[vehicleManufacturer]?.has(vehicleModel) || !city || !state) {
    return { error: 'Complete all technician fields with a valid mobile number.' };
  }
  if ((latitude !== null || longitude !== null) && (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180)) return { error: 'GPS coordinates are invalid.' };
  return { value: { email, password, technicianName, technicianPhone, dealerName, technicianType, vehicleManufacturer, vehicleModel, city, state, latitude, longitude, gpsAddress: String(body?.gpsAddress || '').trim().slice(0, 500), locationConsent: body?.locationConsent === true } };
}

async function audit(req, action, subjectUserId = null, metadata = {}) {
  try {
    await pool.query('INSERT INTO audit_logs (actor_user_id, subject_user_id, action, ip_address, user_agent, metadata) VALUES ($1, $2, $3, $4, $5, $6::jsonb)', [req.user?.guest ? null : (req.user?.sub || null), subjectUserId, action, req.ip, String(req.get('user-agent') || '').slice(0, 500), JSON.stringify(metadata)]);
  } catch (error) { console.error('[Audit]', error.message); }
}

function publicUser(user) {
  return { id: user.id, email: user.email, role: user.role, accountStatus: user.account_status, active: user.active, technicianName: user.technician_name, technicianPhone: user.technician_phone, dealerName: user.dealer_name, technicianType: user.technician_type, vehicleManufacturer: user.vehicle_manufacturer, vehicleModel: user.vehicle_model, city: user.city, state: user.state, gpsLatitude: user.gps_latitude, gpsLongitude: user.gps_longitude, gpsAddress: user.gps_address, lastLoginAt: user.last_login_at };
}

function normalizeModel(value) {
  return String(value || '').replace(/[‑–—]/g, '-').replace(/\s+/g, ' ').trim().toUpperCase();
}

async function enforceAssignedVehicle(req, payload) {
  if (req.user?.guest) return null;
  const user = (await pool.query('SELECT vehicle_manufacturer, vehicle_model FROM users WHERE id = $1 AND active = TRUE AND account_status = \'active\'', [req.user.sub])).rows[0];
  if (!user) return 'Technician account is inactive.';
  const payloadManufacturer = String(payload?.['Vehicle Manufacturer'] || '').trim().toUpperCase();
  const payloadModel = normalizeModel(payload?.Model);
  if (payloadManufacturer !== String(user.vehicle_manufacturer || '').trim().toUpperCase() || payloadModel !== normalizeModel(user.vehicle_model)) return 'This diagnostic is restricted to your assigned OEM and vehicle model.';
  return null;
}

setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [key, bucket] of rateLimitBuckets) if (bucket.startedAt < cutoff) rateLimitBuckets.delete(key);
}, 15 * 60 * 1000).unref();

function signToken(user) {
  return jwt.sign({ sub: String(user.id), email: user.email, role: user.role }, jwtSecret, { expiresIn: '8h' });
}

function setSessionCookie(res, token) {
  const production = process.env.NODE_ENV === 'production';
  const secure = production ? '; Secure' : '';
  res.set('Set-Cookie', `riq_session=${token}; HttpOnly; Path=/; Max-Age=28800; SameSite=${production ? 'None' : 'Lax'}${secure}`);
}

function clearSessionCookie(res) {
  res.set('Set-Cookie', 'riq_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
}

function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const cookies = String(req.get('cookie') || '').split(';').map(item => item.trim().split('='));
  const cookieToken = cookies.find(([name]) => name === 'riq_session')?.[1] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : cookieToken;
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
    'SELECT * FROM users WHERE email = $1 AND active = TRUE AND account_status = \'active\'',
    [email]
  );
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  await pool.query('UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1', [user.id]);
  await audit(req, 'login_success', user.id);
  const token = signToken(user);
  setSessionCookie(res, token);
  return res.json({ token, user: publicUser(user) });
}));

app.post('/api/auth/register', rateLimit({ max: 5 }), asyncHandler(async (req, res) => {
  const input = validateTechnicianInput(req.body);
  if (input.error) return res.status(400).json({ error: input.error });
  const { email, password, technicianName, technicianPhone, dealerName, technicianType, vehicleManufacturer, vehicleModel, city, state, latitude, longitude, gpsAddress, locationConsent } = input.value;
  const storedLatitude = locationConsent ? latitude : null;
  const storedLongitude = locationConsent ? longitude : null;
  const storedAddress = locationConsent ? gpsAddress : null;
  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, role, technician_name, technician_phone, dealer_name, technician_type, vehicle_manufacturer, vehicle_model, city, state, gps_latitude, gps_longitude, gps_address, location_consent_at)
       VALUES ($1, $2, 'technician', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CASE WHEN $14 THEN NOW() ELSE NULL END)
       RETURNING *`,
      [email, passwordHash, technicianName, technicianPhone, dealerName, technicianType, vehicleManufacturer, vehicleModel, city, state, storedLatitude, storedLongitude, storedAddress, locationConsent]
    );
    const user = result.rows[0];
    await audit(req, 'registration', user.id, { locationStored: Boolean(storedLatitude !== null && storedLongitude !== null) });
    notifyAdminClients('technician-registered', { user: publicUser(user) });
    const token = signToken(user);
    setSessionCookie(res, token);
    return res.status(201).json({ token, user: publicUser(user) });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: error.constraint?.includes('phone') ? 'An account with this mobile number already exists.' : 'An account with this email already exists.' });
    throw error;
  }
}));

app.post('/api/auth/logout', requireAuth, asyncHandler(async (req, res) => { await audit(req, 'logout', req.user.guest ? null : req.user.sub); clearSessionCookie(res); return res.status(204).end(); }));

app.post('/api/auth/password-reset/request', rateLimit({ max: 5 }), asyncHandler(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'A valid email is required.' });
  const user = (await pool.query('SELECT id FROM users WHERE email = $1', [email])).rows[0];
  let token;
  if (user) {
    token = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1 OR expires_at < NOW()', [user.id]);
    await pool.query('INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'30 minutes\')', [user.id, hash]);
    await audit(req, 'password_reset_requested', user.id);
  }
  const response = { message: 'If an account exists, reset instructions have been issued.' };
  if (process.env.NODE_ENV !== 'production' && token) response.resetToken = token;
  return res.json(response);
}));

app.post('/api/auth/password-reset/confirm', rateLimit({ max: 10 }), asyncHandler(async (req, res) => {
  const token = String(req.body?.token || '');
  const password = String(req.body?.password || '');
  if (token.length < 32 || password.length < 10) return res.status(400).json({ error: 'A valid token and password of at least 10 characters are required.' });
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = (await client.query('SELECT id, user_id FROM password_reset_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW() FOR UPDATE', [hash])).rows[0];
    if (!found) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Reset token is invalid or expired.' }); }
    const passwordHash = await bcrypt.hash(password, 12);
    await client.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [passwordHash, found.user_id]);
    await client.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [found.id]);
    await client.query('COMMIT');
    await audit(req, 'password_reset_completed', found.user_id);
    return res.json({ message: 'Password updated successfully.' });
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
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

app.get('/api/users', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const search = String(req.query.search || '').trim();
  const status = String(req.query.status || '').trim();
  const values = [];
  const where = ['is_guest = FALSE'];
  if (search) { values.push(`%${search}%`); where.push(`(email ILIKE $${values.length} OR technician_name ILIKE $${values.length} OR technician_phone ILIKE $${values.length} OR dealer_name ILIKE $${values.length} OR city ILIKE $${values.length} OR state ILIKE $${values.length})`); }
  if (status) { values.push(status); where.push(`account_status = $${values.length}`); }
  const result = await pool.query(
    `SELECT id, email, role, is_guest, active, created_at,
            technician_name, technician_phone, dealer_name, technician_type,
            vehicle_manufacturer, vehicle_model, city, state, account_status, gps_latitude,
            gps_longitude, gps_address, last_login_at, updated_at,
            (SELECT COUNT(*)::int FROM diagnostic_cases dc WHERE dc.user_id = users.id) AS diagnostic_count
       FROM users
      WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC`
    , values
  );
  return res.json({ users: result.rows });
}));

app.get('/api/users/:id', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const user = (await pool.query('SELECT id, email, role, active, account_status, technician_name, technician_phone, dealer_name, technician_type, vehicle_manufacturer, vehicle_model, city, state, gps_latitude, gps_longitude, gps_address, location_consent_at, created_at, updated_at, last_login_at FROM users WHERE id = $1 AND is_guest = FALSE', [req.params.id])).rows[0];
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const activity = await pool.query('SELECT action, metadata, created_at FROM audit_logs WHERE subject_user_id = $1 ORDER BY created_at DESC LIMIT 100', [req.params.id]);
  return res.json({ user, activity: activity.rows });
}));

app.post('/api/users', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  // New accounts are technicians. Admin role changes are intentionally not
  // exposed through the generic create endpoint.
  const role = 'technician';
  const technicianName = String(req.body?.technicianName || '').trim();
  const technicianPhone = String(req.body?.technicianPhone || '').replace(/\D/g, '');
  const dealerName = String(req.body?.dealerName || '').trim();
  const technicianType = String(req.body?.technicianType || '').trim();
  const vehicleManufacturer = String(req.body?.vehicleManufacturer || '').trim();
  const vehicleModel = String(req.body?.vehicleModel || '').trim();
  const city = String(req.body?.city || '').trim();
  const state = String(req.body?.state || '').trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'A valid email is required.' });
  if (password.length < 10) return res.status(400).json({ error: 'Password must contain at least 10 characters.' });
  if (vehicleModel && (!vehicleManufacturers.has(vehicleManufacturer.toUpperCase()) || !assignedModels[vehicleManufacturer.toUpperCase()]?.has(vehicleModel))) return res.status(400).json({ error: 'Select a valid OEM and assigned model.' });

  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, role, technician_name, technician_phone,
                          dealer_name, technician_type, vehicle_manufacturer, vehicle_model, city, state)
       VALUES ($1, $2, $3, NULLIF($4, ''), NULLIF($5, ''), NULLIF($6, ''),
               NULLIF($7, ''), NULLIF($8, ''), NULLIF($9, ''), NULLIF($10, ''), NULLIF($11, ''))
       RETURNING id, email, role, technician_name, technician_phone, dealer_name,
                 technician_type, vehicle_manufacturer, vehicle_model, city, state, active, created_at`,
      [email, passwordHash, role, technicianName, technicianPhone, dealerName, technicianType, vehicleManufacturer, vehicleModel, city, state]
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
    'UPDATE users SET active = $1, account_status = $2, updated_at = NOW() WHERE id = $3 RETURNING id, email, role, active, account_status, created_at',
    [active, active ? 'active' : 'deactivated', req.params.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'User not found.' });
  await audit(req, active ? 'account_activated' : 'account_deactivated', req.params.id);
  notifyAdminClients('technician-updated', { user: result.rows[0] });
  return res.json({ user: result.rows[0] });
});

app.patch('/api/users/:id/status', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const allowed = new Set(['pending', 'active', 'rejected', 'suspended', 'deactivated']);
  const status = String(req.body?.status || '').trim();
  if (!allowed.has(status)) return res.status(400).json({ error: 'Invalid account status.' });
  const active = status === 'active';
  const result = await pool.query('UPDATE users SET account_status = $1, active = $2, updated_at = NOW() WHERE id = $3 RETURNING id, email, role, active, account_status, created_at', [status, active, req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'User not found.' });
  await audit(req, `account_${status}`, req.params.id);
  notifyAdminClients('technician-updated', { user: result.rows[0] });
  return res.json({ user: result.rows[0] });
}));

app.patch('/api/users/:id/assignment', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const manufacturer = String(req.body?.vehicleManufacturer || '').trim().toUpperCase();
  const model = String(req.body?.vehicleModel || '').trim();
  if (!vehicleManufacturers.has(manufacturer) || !assignedModels[manufacturer]?.has(model)) return res.status(400).json({ error: 'Select a valid OEM and assigned model.' });
  const result = await pool.query('UPDATE users SET vehicle_manufacturer = $1, vehicle_model = $2, updated_at = NOW() WHERE id = $3 RETURNING id, email, vehicle_manufacturer, vehicle_model, updated_at', [manufacturer, model, req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'User not found.' });
  await audit(req, 'vehicle_assignment_changed', req.params.id, { vehicleManufacturer: manufacturer, vehicleModel: model });
  notifyAdminClients('technician-updated', { user: result.rows[0] });
  return res.json({ user: result.rows[0] });
}));

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
  const assignmentError = await enforceAssignedVehicle(req, req.body);
  if (assignmentError) return res.status(403).json({ error: assignmentError });

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
  const casePayload = {
    ...req.body,
    'Diagnostic Case ID': caseNumber,
    'Lifecycle Status': req.body['Lifecycle Status'] || (['INCOMPLETE', 'IN PROGRESS'].includes(req.body['Diagnostic Status']) ? 'INCOMPLETE' : 'DIAGNOSIS_COMPLETE'),
    'Replacement Status': req.body['Replacement Status'] || 'NOT_REQUIRED',
    'Verification Status': req.body['Verification Status'] || 'NOT_STARTED'
  };
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
  const current = (await pool.query('SELECT payload FROM diagnostic_cases WHERE id = $1', [req.params.caseId])).rows[0];
  const assignmentError = await enforceAssignedVehicle(req, { ...(current?.payload || {}), ...req.body });
  if (assignmentError) return res.status(403).json({ error: assignmentError });
  const ownership = req.user.guest
    ? '(guest_session_id = $2 AND user_id IS NULL)'
    : '(user_id = $2 AND guest_session_id IS NULL)';
  const owner = req.user.guest ? req.user.sub : Number(req.user.sub);
  const result = await pool.query(
    `UPDATE diagnostic_cases
        SET payload = jsonb_set(payload || $1::jsonb, '{Diagnostic Case ID}', to_jsonb(case_number)), updated_at = NOW()
      WHERE id = $3 AND ${ownership}
      RETURNING id, case_number, created_at, payload`,
    [JSON.stringify(req.body), owner, req.params.caseId]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Case not found or not owned by this session.' });
  notifyAdminClients('diagnostic-updated', { caseId: result.rows[0].id, caseNumber: result.rows[0].case_number, status: result.rows[0].payload?.['Diagnostic Status'] || 'IN PROGRESS' });
  return res.json({ ...result.rows[0], status: 'updated' });
}));

// Technician history is intentionally scoped to the authenticated technician/session.
// Guest technicians can resume during their signed session; named technicians retain
// history across devices and browser sessions.
app.get('/api/my/diagnostics', requireAuth, asyncHandler(async (req, res) => {
  const ownership = req.user.guest
    ? 'guest_session_id = $1 AND user_id IS NULL'
    : 'user_id = $1 AND guest_session_id IS NULL';
  const owner = req.user.guest ? req.user.sub : Number(req.user.sub);
  const result = await pool.query(
    `SELECT id, case_number, created_at, updated_at, payload
       FROM diagnostic_cases
      WHERE ${ownership}
      ORDER BY COALESCE(updated_at, created_at) DESC
      LIMIT 100`,
    [owner]
  );
  return res.json({ cases: result.rows });
}));

app.get('/api/my/dashboard', requireAuth, asyncHandler(async (req, res) => {
  const dateFrom = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.dateFrom || '')) ? String(req.query.dateFrom) : null;
  const dateTo = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.dateTo || '')) ? String(req.query.dateTo) : null;
  const ownership = req.user.guest ? 'guest_session_id = $3 AND user_id IS NULL' : 'user_id = $3 AND guest_session_id IS NULL';
  const owner = req.user.guest ? req.user.sub : Number(req.user.sub);
  const params = [dateFrom, dateTo, owner];
  const dateClause = 'created_at::date >= COALESCE($1::date, created_at::date) AND created_at::date <= COALESCE($2::date, created_at::date)';
  const [profile, metrics, statuses, activity, faults, recent] = await Promise.all([
    req.user.guest ? Promise.resolve({ rows: [{}] }) : pool.query('SELECT technician_name, email, vehicle_manufacturer, vehicle_model, dealer_name FROM users WHERE id = $1', [owner]),
    pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE COALESCE(payload->>'Lifecycle Status', payload->>'Diagnostic Status', 'INCOMPLETE') NOT IN ('CLOSED', 'DIAGNOSIS_COMPLETE', 'WORKING SATISFACTORY'))::int AS open, COUNT(*) FILTER (WHERE COALESCE(payload->>'Lifecycle Status', payload->>'Diagnostic Status', 'INCOMPLETE') IN ('INCOMPLETE', 'IN PROGRESS'))::int AS in_progress, COUNT(*) FILTER (WHERE COALESCE(payload->>'Lifecycle Status', payload->>'Diagnostic Status', 'INCOMPLETE') IN ('CLOSED', 'DIAGNOSIS_COMPLETE', 'WORKING SATISFACTORY'))::int AS completed, COUNT(*) FILTER (WHERE payload->>'Diagnostic Status' = 'FAULT FOUND' OR payload->>'Lifecycle Status' IN ('REFERRED_FOR_REPLACEMENT', 'VERIFICATION_PENDING'))::int AS awaiting_action FROM diagnostic_cases WHERE ${ownership} AND ${dateClause}`, params),
    pool.query(`SELECT CASE WHEN payload->>'Diagnostic Status' = 'FAULT FOUND' THEN 'FAULT FOUND' ELSE COALESCE(payload->>'Lifecycle Status', payload->>'Diagnostic Status', 'INCOMPLETE') END AS status, COUNT(*)::int AS count FROM diagnostic_cases WHERE ${ownership} AND ${dateClause} GROUP BY 1 ORDER BY count DESC`, params),
    pool.query(`SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS period, COUNT(*)::int AS count FROM diagnostic_cases WHERE ${ownership} AND ${dateClause} GROUP BY 1 ORDER BY 1`, params),
    pool.query(`SELECT COALESCE(NULLIF(payload->>'Suspected Product', ''), NULLIF(payload->>'Complaint Type', ''), 'Uncategorised') AS category, COUNT(*)::int AS count FROM diagnostic_cases WHERE ${ownership} AND ${dateClause} GROUP BY 1 ORDER BY count DESC LIMIT 10`, params),
    pool.query(`SELECT id, case_number, created_at, updated_at, payload FROM diagnostic_cases WHERE ${ownership} AND ${dateClause} ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 8`, params)
  ]);
  return res.json({ profile: profile.rows[0] || {}, metrics: metrics.rows[0], statuses: statuses.rows, activity: activity.rows, faults: faults.rows, recent: recent.rows });
}));

app.patch('/api/my/diagnostics/:caseId/follow-up', requireAuth, asyncHandler(async (req, res) => {
  const allowedReplacement = new Set(['NOT_REQUIRED', 'PENDING', 'PART_ORDERED', 'REPLACED', 'NOT_REPLACED']);
  const allowedVerification = new Set(['NOT_STARTED', 'PENDING', 'PASSED', 'FAILED']);
  const replacementStatus = String(req.body?.replacementStatus || '').trim().toUpperCase();
  const verificationStatus = String(req.body?.verificationStatus || '').trim().toUpperCase();
  if (!allowedReplacement.has(replacementStatus) || !allowedVerification.has(verificationStatus)) {
    return res.status(400).json({ error: 'Invalid replacement or verification status.' });
  }
  if (replacementStatus === 'REPLACED' && verificationStatus === 'NOT_STARTED') {
    return res.status(400).json({ error: 'A replaced part must be verified.' });
  }
  if (verificationStatus === 'PASSED' && !['REPLACED', 'NOT_REQUIRED'].includes(replacementStatus)) {
    return res.status(400).json({ error: 'Verification can pass only after the required work is complete.' });
  }
  const ownership = req.user.guest
    ? 'guest_session_id = $3 AND user_id IS NULL'
    : 'user_id = $3 AND guest_session_id IS NULL';
  const owner = req.user.guest ? req.user.sub : Number(req.user.sub);
  const lifecycle = verificationStatus === 'PASSED'
    ? 'CLOSED'
    : replacementStatus === 'REPLACED' ? 'VERIFICATION_PENDING'
      : replacementStatus !== 'NOT_REQUIRED' ? 'REFERRED_FOR_REPLACEMENT' : 'DIAGNOSIS_COMPLETE';
  const followUp = {
    'Replacement Status': replacementStatus,
    'Replacement Date': req.body?.replacementDate || '',
    'Actual Part No.': req.body?.actualPartNo || '',
    'Replacement Notes': req.body?.notes || '',
    'Verification Status': verificationStatus,
    'Verification Notes': req.body?.verificationNotes || '',
    'Lifecycle Status': lifecycle
  };
  const result = await pool.query(
    `UPDATE diagnostic_cases
        SET payload = payload || $1::jsonb, updated_at = NOW()
      WHERE id = $2 AND ${ownership}
      RETURNING id, case_number, created_at, updated_at, payload`,
    [JSON.stringify(followUp), req.params.caseId, owner]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Case not found or not owned by this technician.' });
  notifyAdminClients('diagnostic-updated', { caseId: result.rows[0].id, caseNumber: result.rows[0].case_number, status: lifecycle });
  return res.json(result.rows[0]);
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
  const regionExpression = `COALESCE(NULLIF(payload->>'Region', ''), CASE payload->>'State'
    WHEN 'Jammu & Kashmir' THEN 'North' WHEN 'Himachal Pradesh' THEN 'North' WHEN 'Punjab' THEN 'North' WHEN 'Chandigarh' THEN 'North' WHEN 'Uttarakhand' THEN 'North' WHEN 'Haryana' THEN 'North' WHEN 'Delhi' THEN 'North' WHEN 'Rajasthan' THEN 'North' WHEN 'Uttar Pradesh' THEN 'North'
    WHEN 'Bihar' THEN 'East' WHEN 'West Bengal' THEN 'East' WHEN 'Odisha' THEN 'East' WHEN 'Jharkhand' THEN 'East' WHEN 'Assam' THEN 'East' WHEN 'Arunachal Pradesh' THEN 'East' WHEN 'Manipur' THEN 'East' WHEN 'Meghalaya' THEN 'East' WHEN 'Mizoram' THEN 'East' WHEN 'Nagaland' THEN 'East' WHEN 'Sikkim' THEN 'East' WHEN 'Tripura' THEN 'East'
    WHEN 'Madhya Pradesh' THEN 'West' WHEN 'Gujarat' THEN 'West' WHEN 'Goa' THEN 'West' WHEN 'Maharashtra' THEN 'West'
    WHEN 'Andhra Pradesh' THEN 'South' WHEN 'Karnataka' THEN 'South' WHEN 'Kerala' THEN 'South' WHEN 'Tamil Nadu' THEN 'South' WHEN 'Telangana' THEN 'South' WHEN 'Puducherry' THEN 'South'
    ELSE 'Other' END)`;
  if (search) add(`concat_ws(' ', case_number, payload->>'Diagnostic Case ID', payload->>'Chassis No.', payload->>'Vehicle Registration No.', payload->>'Dealer / Location', payload->>'FSE Name', payload->>'Suspected Product') ILIKE '%' || ? || '%'`, search);
  if (status) { values.push(status, status); where.push(`(payload->>'Diagnostic Status' = $${values.length - 1} OR payload->>'Lifecycle Status' = $${values.length})`); }
  if (region) add(`lower(${regionExpression}) = lower(?)`, region);
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
              'Lifecycle Status', payload->>'Lifecycle Status',
              'Replacement Status', payload->>'Replacement Status',
              'Verification Status', payload->>'Verification Status',
              'Actual Part No.', payload->>'Actual Part No.',
              'Suspected Product', payload->>'Suspected Product',
              'Vehicle Manufacturer', payload->>'Vehicle Manufacturer',
              'Model', payload->>'Model',
              'Technician Phone', payload->>'Technician Phone',
              'Region', payload->>'Region',
              'State', payload->>'State',
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
  const dateFrom = /^\d{4}-\d{2}-\d{2}$/.test(String(_req.query?.dateFrom || '')) ? String(_req.query.dateFrom) : null;
  const dateTo = /^\d{4}-\d{2}-\d{2}$/.test(String(_req.query?.dateTo || '')) ? String(_req.query.dateTo) : null;
  const granularity = new Set(['day', 'week', 'month']).has(String(_req.query?.granularity)) ? String(_req.query.granularity) : 'day';
  const dateClause = 'WHERE ($1::date IS NULL OR created_at::date >= $1::date) AND ($2::date IS NULL OR created_at::date <= $2::date)';
  const completionClause = `${dateClause} AND`;
  const dateValues = [dateFrom, dateTo];
  const result = await pool.query(`
    SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE payload->>'Diagnostic Status' = 'FAULT FOUND')::int AS faults,
      COUNT(*) FILTER (WHERE payload->>'Diagnostic Status' = 'WORKING SATISFACTORY')::int AS working,
      COUNT(*) FILTER (WHERE payload->>'Diagnostic Status' NOT IN ('FAULT FOUND', 'WORKING SATISFACTORY') OR payload->>'Diagnostic Status' IS NULL)::int AS incomplete,
      COUNT(*) FILTER (WHERE forward_status = 'sent')::int AS forwarded,
      COUNT(*) FILTER (WHERE forward_status IN ('pending', 'failed'))::int AS pending_forwarding,
      COALESCE(json_agg(DISTINCT payload->>'Vehicle Manufacturer') FILTER (WHERE payload->>'Vehicle Manufacturer' IS NOT NULL AND payload->>'Vehicle Manufacturer' <> ''), '[]') AS manufacturers
    FROM diagnostic_cases
    ${dateClause}
  `, dateValues);
  const [technicians, registrations, lifecycle, assignments, activity, completion] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE active = TRUE AND account_status = \'active\')::int AS active FROM users WHERE is_guest = FALSE'),
    pool.query(`SELECT to_char(date_trunc($3, created_at), 'YYYY-MM-DD') AS period, COUNT(*)::int AS count FROM users WHERE is_guest = FALSE AND ($1::date IS NULL OR created_at::date >= $1::date) AND ($2::date IS NULL OR created_at::date <= $2::date) GROUP BY 1 ORDER BY 1`, [...dateValues, granularity]),
    pool.query(`SELECT CASE WHEN payload->>'Diagnostic Status' = 'FAULT FOUND' THEN 'FAULT FOUND' ELSE COALESCE(payload->>'Lifecycle Status', payload->>'Diagnostic Status', 'INCOMPLETE') END AS status, COUNT(*)::int AS count FROM diagnostic_cases ${dateClause} GROUP BY 1 ORDER BY count DESC`, dateValues),
    pool.query(`SELECT COALESCE(NULLIF(payload->>'Vehicle Manufacturer', ''), 'Unassigned') AS manufacturer, COALESCE(NULLIF(payload->>'Model', ''), 'Unassigned') AS model, COUNT(*)::int AS count FROM diagnostic_cases ${dateClause} GROUP BY 1, 2 ORDER BY count DESC LIMIT 30`, dateValues),
    pool.query(`SELECT COALESCE(payload->>'FSE Name', 'Unassigned') AS technician, COUNT(*)::int AS count FROM diagnostic_cases ${dateClause} GROUP BY 1 ORDER BY count DESC LIMIT 20`, dateValues),
    pool.query(`SELECT ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600)::numeric, 2) AS hours FROM diagnostic_cases ${completionClause} payload->>'Lifecycle Status' = 'CLOSED'`, dateValues)
  ]);
  const caseSummary = result.rows[0];
  const lifecycleRows = lifecycle.rows;
  const open = lifecycleRows.filter(row => !['CLOSED', 'DIAGNOSIS_COMPLETE', 'WORKING SATISFACTORY'].includes(row.status)).reduce((sum, row) => sum + row.count, 0);
  const inProgress = lifecycleRows.filter(row => ['IN PROGRESS', 'INCOMPLETE'].includes(row.status)).reduce((sum, row) => sum + row.count, 0);
  const completed = lifecycleRows.filter(row => ['CLOSED', 'DIAGNOSIS_COMPLETE', 'WORKING SATISFACTORY'].includes(row.status)).reduce((sum, row) => sum + row.count, 0);
  const escalations = lifecycleRows.filter(row => ['REFERRED_FOR_REPLACEMENT', 'VERIFICATION_PENDING', 'FAULT FOUND'].includes(row.status)).reduce((sum, row) => sum + row.count, 0);
  return res.json({ summary: { ...caseSummary, techniciansTotal: technicians.rows[0].total, techniciansActive: technicians.rows[0].active, open, inProgress, completed, escalations, averageCompletionHours: completion.rows[0]?.hours || 0, registrations: registrations.rows, lifecycle: lifecycle.rows, assignments: assignments.rows, activity: activity.rows } });
}));

app.get('/api/admin/diagnostics/:caseId', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT id, case_number, payload - ARRAY['GPS Latitude', 'GPS Longitude', 'GPS Address'] AS payload,
            created_at, forwarded_at, forward_status, forward_error
     FROM diagnostic_cases WHERE id = $1`,
    [req.params.caseId]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Case not found.' });
  return res.json(result.rows[0]);
}));

app.patch('/api/admin/diagnostics/:caseId', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const allowedRegions = new Set(['North', 'South', 'East', 'West', 'Other']);
  const region = String(req.body?.region || '').trim();
  if (!allowedRegions.has(region)) return res.status(400).json({ error: 'Select a valid region.' });
  const result = await pool.query(
    `UPDATE diagnostic_cases SET payload = jsonb_set(payload, '{Region}', to_jsonb($1::text), true)
     WHERE id = $2 RETURNING id, case_number, payload - ARRAY['GPS Latitude', 'GPS Longitude', 'GPS Address'] AS payload,
     created_at, forwarded_at, forward_status, forward_error`,
    [region, req.params.caseId]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Case not found.' });
  notifyAdminClients('diagnostic-updated', { caseId: result.rows[0].id, caseNumber: result.rows[0].case_number, region });
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
    `SELECT id, case_number, payload - ARRAY['GPS Latitude', 'GPS Longitude', 'GPS Address'] AS payload,
            created_at, forwarded_at, forward_status, forward_error
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
      account_status TEXT NOT NULL DEFAULT 'active',
      technician_name TEXT,
      technician_phone TEXT,
      dealer_name TEXT,
      technician_type TEXT,
      vehicle_manufacturer TEXT,
      vehicle_model TEXT,
      city TEXT,
      state TEXT,
      gps_latitude NUMERIC(9,6), gps_longitude NUMERIC(9,6), gps_address TEXT,
      location_consent_at TIMESTAMPTZ, last_login_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_guest BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS technician_name TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS technician_phone TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS dealer_name TEXT;
   ALTER TABLE users ADD COLUMN IF NOT EXISTS technician_type TEXT;
     ALTER TABLE users ADD COLUMN IF NOT EXISTS vehicle_manufacturer TEXT;
     ALTER TABLE users ADD COLUMN IF NOT EXISTS vehicle_model TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS city TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS state TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS gps_latitude NUMERIC(9,6);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS gps_longitude NUMERIC(9,6);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS gps_address TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS location_consent_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique_idx ON users (technician_phone) WHERE technician_phone IS NOT NULL AND technician_phone <> '';
    CREATE INDEX IF NOT EXISTS users_status_created_idx ON users (account_status, created_at DESC);
    CREATE INDEX IF NOT EXISTS users_assignment_idx ON users (vehicle_manufacturer, vehicle_model);
    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGSERIAL PRIMARY KEY, actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      subject_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL, action TEXT NOT NULL,
      ip_address INET, user_agent TEXT, metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs (created_at DESC);
    CREATE INDEX IF NOT EXISTS audit_logs_subject_idx ON audit_logs (subject_user_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS diagnostic_cases (
      id UUID PRIMARY KEY,
      case_number TEXT UNIQUE,
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
    ALTER TABLE diagnostic_cases ADD COLUMN IF NOT EXISTS case_number TEXT;
    ALTER TABLE diagnostic_cases ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
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
