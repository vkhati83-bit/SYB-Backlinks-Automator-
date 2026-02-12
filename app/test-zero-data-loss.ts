/**
 * Test Zero Data Loss - Fetch real prospects and verify ALL are saved
 */

const API_URL = 'http://localhost:3000/api/v1';

async function testZeroDataLoss() {
  console.log('🧪 Testing Zero Data Loss with Real Fetch\n');
  console.log('═'.repeat(60));

  try {
    console.log('📡 Fetching prospects from SEO Command Center...');
    console.log('   Limit: 20 prospects');
    console.log('   This will test the scoring system\n');

    const response = await fetch(`${API_URL}/data-fetch/research-citations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        limit: 20,
        minPosition: 1,
        maxPosition: 50,
      }),
    });

    const data = await response.json();

    console.log('📊 Fetch Results:');
    console.log('─'.repeat(60));
    console.log(`✅ Success: ${data.success}`);
    console.log(`📈 Total Found: ${data.total_found}`);
    console.log(`💾 Inserted: ${data.inserted}`);
    console.log(`✨ Auto-Approved: ${data.auto_approved}`);
    console.log(`⚠️  Needs Review: ${data.needs_review}`);
    console.log(`❌ Auto-Rejected: ${data.auto_rejected}`);
    console.log(`🔍 Queued for Contact Finding: ${data.queued_for_contact_finding}`);

    console.log('\n📋 Filter Breakdown:');
    console.table(data.filter_breakdown);

    // Calculate data loss percentage
    const dataLoss = data.total_found > 0
      ? ((data.total_found - data.inserted) / data.total_found * 100).toFixed(2)
      : 0;

    console.log('\n' + '═'.repeat(60));
    console.log('🎯 DATA LOSS ANALYSIS');
    console.log('═'.repeat(60));
    console.log(`Total Found:     ${data.total_found}`);
    console.log(`Total Saved:     ${data.inserted}`);
    console.log(`Data Loss:       ${dataLoss}%`);

    if (dataLoss === '0.00') {
      console.log('\n🎉 SUCCESS! ZERO DATA LOSS!');
      console.log('   All prospects were saved with categorization');
    } else {
      console.log(`\n⚠️  Warning: ${dataLoss}% data loss detected`);
      console.log('   (Some duplicates may have been skipped)');
    }

    // Show categorization breakdown
    const approvalRate = data.total_found > 0
      ? ((data.auto_approved / data.total_found) * 100).toFixed(1)
      : 0;
    const reviewRate = data.total_found > 0
      ? ((data.needs_review / data.total_found) * 100).toFixed(1)
      : 0;
    const rejectRate = data.total_found > 0
      ? ((data.auto_rejected / data.total_found) * 100).toFixed(1)
      : 0;

    console.log('\n📊 Quality Distribution:');
    console.log(`   ${approvalRate}% Auto-Approved (≥70 score)`);
    console.log(`   ${reviewRate}% Needs Review (30-69 score)`);
    console.log(`   ${rejectRate}% Auto-Rejected (<30 score)`);

    console.log('\n✅ Batch ID:', data.batch_id);
    console.log('   Use this to query: GET /api/v1/prospects/filter-summary?batch_id=' + data.batch_id);

  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
  }
}

testZeroDataLoss();
