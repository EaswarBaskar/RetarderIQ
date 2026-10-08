import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;
const [emailArg, passwordArg, roleArg = 'technician'] = process.argv.slice(2);
const email = String(emailArg || '').trim().toLowerCase();
const password = String(passwordArg || '');
const role = roleArg === 'admin' ? 'admin' : 'technician';

if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 10) {
  console.error('Usage: npm run create-user -- email@example.com StrongPassword technician');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const passwordHash = await bcrypt.hash(password, 12);
  const result = await pool.query(
    'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role',
    [email, passwordHash, role]
  );
  console.log(`Created ${result.rows[0].role} user: ${result.rows[0].email}`);
} catch (error) {
  if (error.code === '23505') console.error('A user with that email already exists.');
  else console.error(error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
