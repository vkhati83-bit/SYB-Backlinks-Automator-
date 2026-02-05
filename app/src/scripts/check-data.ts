import { db } from '../db/index.js';

async function checkData() {
  try {
    const prospects = await db.query('SELECT COUNT(*) as count FROM prospects');
    const contacts = await db.query('SELECT COUNT(*) as count FROM contacts');
    const campaigns = await db.query('SELECT COUNT(*) as count FROM campaigns');
    const emails = await db.query('SELECT COUNT(*) as count FROM emails');

    console.log('\n📊 Database Contents:');
    console.log('   Prospects:', prospects.rows[0].count);
    console.log('   Contacts:', contacts.rows[0].count);
    console.log('   Campaigns:', campaigns.rows[0].count);
    console.log('   Emails:', emails.rows[0].count);

    // Show sample prospects
    const sample = await db.query(`
      SELECT domain, title, quality_score, opportunity_type, approval_status
      FROM prospects
      ORDER BY quality_score DESC NULLS LAST
      LIMIT 10
    `);

    console.log('\n📋 Top 10 Prospects by Quality Score:');
    sample.rows.forEach((r: any, i: number) => {
      console.log(`   ${i+1}. ${r.domain}`);
      console.log(`      Title: ${r.title?.substring(0, 50) || 'N/A'}...`);
      console.log(`      Score: ${r.quality_score} | Type: ${r.opportunity_type} | Status: ${r.approval_status}`);
    });

  } catch (error) {
    console.error('Error:', error);
  }

  process.exit(0);
}

checkData();
