import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const SEO_DATABASE_URL = process.env.SEO_DATABASE_URL;

if (!SEO_DATABASE_URL) {
  console.error('❌ SEO_DATABASE_URL not found');
  process.exit(1);
}

async function runRecon() {
  const pool = new Pool({ connectionString: SEO_DATABASE_URL });

  console.log('🔍 SEO COMMAND CENTER RECON');
  console.log('='.repeat(60));

  try {
    // Test connection
    const connTest = await pool.query('SELECT NOW()');
    console.log(`✅ Connected at ${connTest.rows[0].now}\n`);

    // Get all tables
    console.log('📊 TABLES:');
    console.log('-'.repeat(40));
    const tables = await pool.query(`
      SELECT table_name, pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) as size
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    for (const row of tables.rows) {
      console.log(`   ${row.table_name} (${row.size})`);
    }

    // For each table, show columns and row count
    console.log('\n📋 TABLE DETAILS:');
    console.log('='.repeat(60));

    for (const table of tables.rows) {
      const tableName = table.table_name;

      // Get row count
      const countResult = await pool.query(`SELECT COUNT(*) as count FROM "${tableName}"`);
      const rowCount = countResult.rows[0].count;

      // Get columns
      const columns = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position
      `, [tableName]);

      console.log(`\n📁 ${tableName} (${rowCount} rows)`);
      console.log('-'.repeat(40));

      for (const col of columns.rows) {
        const nullable = col.is_nullable === 'YES' ? '?' : '';
        console.log(`   ${col.column_name}: ${col.data_type}${nullable}`);
      }

      // Show sample data (first 3 rows)
      if (parseInt(rowCount) > 0) {
        const sample = await pool.query(`SELECT * FROM "${tableName}" LIMIT 3`);
        console.log(`   Sample data:`);
        for (const row of sample.rows) {
          const preview = JSON.stringify(row).substring(0, 150);
          console.log(`     ${preview}${preview.length >= 150 ? '...' : ''}`);
        }
      }
    }

  } catch (error) {
    console.error('❌ Recon failed:', error);
  } finally {
    await pool.end();
  }
}

runRecon();
