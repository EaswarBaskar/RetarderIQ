import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
let running = false;

async function deliver(caseId, payload) {
  const targets = [
    ['google', process.env.GOOGLE_APPS_SCRIPT_URL],
    ['powerautomate', process.env.POWER_AUTOMATE_FLOW_URL]
  ].filter(([, url]) => url);
  if (!targets.length) throw new Error('No reporting destination is configured.');
  const failures = (await Promise.all(targets.map(async ([name, url]) => {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-retarder-case-id': caseId },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000)
      });
      return response.ok ? null : `${name}: HTTP ${response.status}`;
    } catch (error) {
      return `${name}: ${error.message}`;
    }
  }))).filter(Boolean);
  if (failures.length) throw new Error(failures.join('; '));
}

async function runOnce() {
  if (running) return;
  running = true;
  try {
    for (let count = 0; count < 10; count += 1) {
      const claimed = await pool.query(`
        UPDATE diagnostic_cases
        SET forward_attempts = forward_attempts + 1, forward_status = 'pending', next_attempt_at = NULL
        WHERE id = (
          SELECT id FROM diagnostic_cases
          WHERE forward_status IN ('pending', 'failed')
            AND forward_attempts < 8
            AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
          ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
        )
        RETURNING id, payload, forward_attempts
      `);
      const job = claimed.rows[0];
      if (!job) break;
      try {
        await deliver(job.id, job.payload);
        await pool.query("UPDATE diagnostic_cases SET forward_status = 'sent', forwarded_at = NOW(), forward_error = NULL, next_attempt_at = NULL WHERE id = $1", [job.id]);
      } catch (error) {
        const delay = Math.min(60 * 60 * 1000, 15_000 * (2 ** Math.max(0, job.forward_attempts - 1)));
        await pool.query(
          `UPDATE diagnostic_cases SET forward_status = 'failed', forward_error = $1,
             next_attempt_at = CASE WHEN forward_attempts >= 8 THEN NULL ELSE $2::timestamptz END WHERE id = $3`,
          [error.message, new Date(Date.now() + delay), job.id]
        );
      }
    }
  } finally {
    running = false;
  }
}

await runOnce();
setInterval(runOnce, 5000).unref();
console.log('Retarder IQ forwarding worker is running.');
