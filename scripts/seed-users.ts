import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not found');
  process.exit(1);
}

const users = [
  {
    email: 'vicky@shieldyourbody.com',
    password: 'Bkl$Vy89#zQm2026',
    name: 'Vicky',
  },
  {
    email: 'r@shieldyourbody.com',
    password: 'Bkl$Rb47#xPn2026',
    name: 'R Blank',
  },
];

async function seedUsers() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  console.log('Seeding users...');

  for (const user of users) {
    const hash = await bcrypt.hash(user.password, 12);

    try {
      await pool.query(
        `INSERT INTO users (email, password_hash, name)
         VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE SET password_hash = $2, name = $3, updated_at = NOW()`,
        [user.email, hash, user.name]
      );
      console.log(`  ${user.email} - OK`);
    } catch (err: any) {
      console.error(`  ${user.email} - FAILED:`, err.message);
    }
  }

  console.log('\nCredentials:');
  for (const user of users) {
    console.log(`  ${user.email} / ${user.password}`);
  }

  await pool.end();
}

seedUsers();
