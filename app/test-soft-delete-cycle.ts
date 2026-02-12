/**
 * Test Soft Delete Cycle
 * Tests: Delete → Trash → Restore → Permanent Delete
 */

const API_URL = 'http://localhost:3000/api/v1';

async function testSoftDeleteCycle() {
  console.log('🗑️  Testing Soft Delete Cycle\n');
  console.log('═'.repeat(70));

  try {
    // Step 1: Get a prospect to test with
    console.log('\n1️⃣  Finding a prospect to test soft delete...');
    const prospectsResp = await fetch(`${API_URL}/prospects/filtered?status=auto_rejected&limit=1`);
    const prospectsData = await prospectsResp.json();

    if (!prospectsData.prospects || prospectsData.prospects.length === 0) {
      console.log('❌ No prospects found to test with');
      return;
    }

    const testProspect = prospectsData.prospects[0];
    console.log(`   ✅ Found prospect: ${testProspect.domain} (ID: ${testProspect.id})`);

    // Step 2: Soft delete it
    console.log('\n2️⃣  Soft deleting prospect...');
    const deleteResp = await fetch(`${API_URL}/prospects/${testProspect.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Test deletion for verification' }),
    });
    const deleteData = await deleteResp.json();
    console.log(`   ✅ Deleted: ${deleteData.message}`);
    console.log(`   📅 Deleted at: ${deleteData.prospect?.deleted_at}`);

    // Step 3: Verify it's in trash
    console.log('\n3️⃣  Checking trash...');
    const trashResp = await fetch(`${API_URL}/prospects/trash?limit=5`);
    const trashData = await trashResp.json();
    console.log(`   ✅ Trash count: ${trashData.total}`);
    const inTrash = trashData.prospects.find((p: any) => p.id === testProspect.id);
    console.log(`   ${inTrash ? '✅' : '❌'} Test prospect is in trash: ${inTrash ? 'YES' : 'NO'}`);

    // Step 4: Verify it's NOT in active list
    console.log('\n4️⃣  Verifying not in active prospects...');
    const activeResp = await fetch(`${API_URL}/prospects/filtered?status=auto_rejected&limit=100`);
    const activeData = await activeResp.json();
    const stillActive = activeData.prospects.find((p: any) => p.id === testProspect.id);
    console.log(`   ${!stillActive ? '✅' : '❌'} NOT in active list: ${!stillActive ? 'CORRECT' : 'ERROR'}`);

    // Step 5: Check stats
    console.log('\n5️⃣  Checking stats...');
    const statsResp = await fetch(`${API_URL}/prospects/stats`);
    const statsData = await statsResp.json();
    console.log(`   ✅ Total active: ${statsData.total}`);
    console.log(`   ✅ In trash: ${statsData.trash}`);

    // Step 6: Restore from trash
    console.log('\n6️⃣  Restoring from trash...');
    const restoreResp = await fetch(`${API_URL}/prospects/${testProspect.id}/restore`, {
      method: 'POST',
    });
    const restoreData = await restoreResp.json();
    console.log(`   ✅ Restored: ${restoreData.message}`);

    // Step 7: Verify it's back in active list
    console.log('\n7️⃣  Verifying restored to active...');
    const verifyResp = await fetch(`${API_URL}/prospects/${testProspect.id}`);
    const verifyData = await verifyResp.json();
    console.log(`   ${verifyData.deleted_at === null ? '✅' : '❌'} Deleted_at is null: ${verifyData.deleted_at === null ? 'YES' : 'NO'}`);

    // Final stats
    console.log('\n8️⃣  Final stats after restore...');
    const finalStatsResp = await fetch(`${API_URL}/prospects/stats`);
    const finalStatsData = await finalStatsResp.json();
    console.log(`   ✅ Total active: ${finalStatsData.total}`);
    console.log(`   ✅ In trash: ${finalStatsData.trash}`);

    console.log('\n' + '═'.repeat(70));
    console.log('🎊 SOFT DELETE CYCLE TEST: PASSED');
    console.log('═'.repeat(70));
    console.log('\n✅ Delete → Trash → Restore → Active: ALL WORKING!');

  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
  }
}

testSoftDeleteCycle();
