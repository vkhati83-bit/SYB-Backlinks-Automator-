import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not found in environment');
  process.exit(1);
}

async function runMigrations() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
  });

  console.log('🚀 Starting database migrations...');
  console.log(`📍 Connecting to: ${DATABASE_URL.replace(/:[^:@]+@/, ':****@')}`);

  try {
    // Test connection
    const testResult = await pool.query('SELECT NOW()');
    console.log(`✅ Connected to database at ${testResult.rows[0].now}`);

    // Read migrations directory
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`📁 Found ${files.length} migration file(s)`);

    for (const file of files) {
      console.log(`\n📄 Running: ${file}`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      try {
        await pool.query(sql);
        console.log(`✅ ${file} completed successfully`);
      } catch (error: any) {
        // Check if it's a "already exists" error - that's OK
        if (error.code === '42P07' || error.code === '42710') {
          console.log(`⚠️ ${file} - Objects already exist, skipping...`);
        } else {
          throw error;
        }
      }
    }

    // Verify tables were created
    const tablesResult = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('\n📊 Tables in database:');
    tablesResult.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });

    console.log('\n✅ All migrations completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
