import pkg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pkg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Test connection on startup
(async () => {
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('✅ Connected to PostgreSQL at', res.rows[0].now);
  } catch (err) {
    console.error('❌ DB connection failed:', err);
  }
})();

