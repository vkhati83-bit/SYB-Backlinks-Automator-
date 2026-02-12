/**
 * Test Broken Link Data Structure
 * Shows exactly what you get for broken link opportunities
 */

const API_URL = 'http://localhost:3000/api/v1';

async function testBrokenLinkStructure() {
  console.log('🔗 Testing Broken Link Data Structure\n');
  console.log('═'.repeat(70));

  try {
    // Fetch broken link opportunities
    console.log('\n📡 Fetching broken link opportunities...\n');

    const response = await fetch(`${API_URL}/prospects/broken-links?limit=3`);
    const data = await response.json();

    if (data.opportunities && data.opportunities.length > 0) {
      console.log(`✅ Found ${data.total} broken link opportunities\n`);
      console.log('═'.repeat(70));
      console.log('EXAMPLE BROKEN LINK OPPORTUNITY:');
      console.log('═'.repeat(70));

      const example = data.opportunities[0];

      console.log('\n1️⃣  REFERRING ARTICLE (where the broken link is):');
      console.log('   ├─ URL:', example.referring_page.url);
      console.log('   ├─ Title:', example.referring_page.title);
      console.log('   ├─ Domain:', example.referring_page.domain);
      console.log('   └─ Domain Authority:', example.referring_page.domain_authority);

      console.log('\n2️⃣  BROKEN LINK DETAILS:');
      console.log('   ├─ Broken URL:', example.broken_link_details.broken_url);
      console.log('   ├─ Anchor Text:', `"${example.broken_link_details.anchor_text}"`);
      console.log('   ├─ Status Code:', example.broken_link_details.status_code, '(404 = broken)');
      console.log('   ├─ Verified:', example.broken_link_details.verified ? '✅ YES' : '❌ NO');
      console.log('   └─ Verified At:', example.broken_link_details.verified_at || 'Not verified');

      console.log('\n3️⃣  REPLACEMENT SUGGESTION:');
      if (example.replacement_suggestion) {
        console.log('   ├─ SYB Article:', example.replacement_suggestion.article_title);
        console.log('   ├─ URL:', example.replacement_suggestion.article_url);
        console.log('   └─ Why:', example.replacement_suggestion.match_reason);
      } else {
        console.log('   └─ No suggestion yet (article matcher will add this)');
      }

      console.log('\n4️⃣  PROSPECT METADATA:');
      console.log('   ├─ Quality Score:', example.quality_score);
      console.log('   ├─ Filter Status:', example.filter_status);
      console.log('   ├─ Approval Status:', example.approval_status);
      console.log('   ├─ Contacts Found:', example.contact_count);
      console.log('   └─ Prospect ID:', example.id);

      console.log('\n' + '═'.repeat(70));
      console.log('📋 OUTREACH PITCH STRUCTURE:');
      console.log('═'.repeat(70));
      console.log(`
Hi [Contact Name],

I noticed your article "${example.referring_page.title}"
(${example.referring_page.url})

has a broken link: "${example.broken_link_details.anchor_text}"
→ ${example.broken_link_details.broken_url} (Returns ${example.broken_link_details.status_code})

I have a great replacement that your readers would find valuable:
→ ${example.replacement_suggestion?.article_title || '[SYB Article]'}
   ${example.replacement_suggestion?.article_url || '[URL]'}

Would you be open to updating the link?

Best regards,
SYB Research Team
      `);

      console.log('═'.repeat(70));
      console.log('✅ Data structure is now CRYSTAL CLEAR!');
      console.log('═'.repeat(70));

      // Show full JSON for reference
      console.log('\n📄 Full JSON Response (first opportunity):');
      console.log(JSON.stringify(example, null, 2));

    } else {
      console.log('⚠️  No broken link opportunities found');
      console.log('   (This is expected if you haven\'t run broken link fetching yet)');
    }

  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
  }
}

testBrokenLinkStructure();
