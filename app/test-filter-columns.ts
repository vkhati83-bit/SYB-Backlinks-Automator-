import { db } from './src/db/index.js';

async function test() {
  try {
    // Check if filter columns exist
    const result = await db.query(`
      SELECT
        filter_status,
        COUNT(*) as count
      FROM prospects
      WHERE filter_status IS NOT NULL
      GROUP BY filter_status
      ORDER BY count DESC
    `);

    console.log('✅ Filter status column exists!');
    console.log('Filter status breakdown:');
    console.log(JSON.stringify(result.rows, null, 2));

    // Check if data has filter scores
    const scoreResult = await db.query(`
      SELECT
        filter_score,
        COUNT(*) as count
      FROM prospects
      WHERE filter_score IS NOT NULL
      GROUP BY filter_score
      ORDER BY filter_score DESC
      LIMIT 10
    `);

    console.log('\nFilter score samples:');
    console.log(JSON.stringify(scoreResult.rows, null, 2));

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await db.end();
  }
}

test();
