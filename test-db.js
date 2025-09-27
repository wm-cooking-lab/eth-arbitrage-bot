import 'dotenv/config';
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
// Ajoute ceci si ta DB cloud exige SSL:
// const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

try {
  const r = await pool.query('SELECT current_database() AS db, now() AS ts');
  console.log('OK:', r.rows[0]);
} catch (e) {
  console.error('Erreur:', e.message);
  console.error('Stack:', e.stack);
} finally {
  await pool.end();
}
