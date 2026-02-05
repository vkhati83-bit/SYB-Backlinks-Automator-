/**
 * Check broken link data - understand what we have
 */
import { seoDb } from '../db/index.js';

async function checkBrokenLinks() {
  console.log('🔗 Checking Broken Link Data\n');
  console.log('Finding LIVE pages that contain BROKEN outbound links...\n');

  try {
    const result = await seoDb.query(`
      SELECT
        referring_page_url,
        referring_domain,
        referring_domain_rank,
        broken_url,
        broken_url_title,
        anchor_text,
        is_dofollow
      FROM competitor_broken_backlinks
      WHERE referring_domain_rank >= 25
        AND referring_domain NOT LIKE '%prlog%'
        AND referring_domain NOT LIKE '%shieldyourbody%'
        AND referring_domain NOT LIKE '%safesleeve%'
      ORDER BY referring_domain_rank DESC
      LIMIT 30
    `);

    console.log(`Found ${result.rows.length} broken link opportunities:\n`);
    console.log('='.repeat(80));

    result.rows.forEach((r: any, i: number) => {
      console.log(`\n${i + 1}. TARGET (Live page with broken link):`);
      console.log(`   URL: ${r.referring_page_url}`);
      console.log(`   Domain: ${r.referring_domain} (DA: ${r.referring_domain_rank})`);
      console.log(`   DoFollow: ${r.is_dofollow}`);
      console.log(`\n   THE BROKEN LINK on their page:`);
      console.log(`   Dead URL: ${r.broken_url}`);
      console.log(`   Anchor text: "${r.anchor_text}"`);
      if (r.broken_url_title) {
        console.log(`   Original title: "${r.broken_url_title}"`);
      }
      console.log('-'.repeat(80));
    });

    // Check what competitors the broken links point to
    console.log('\n\nBROKEN LINKS BY COMPETITOR:');
    const byCompetitor = await seoDb.query(`
      SELECT
        CASE
          WHEN broken_url LIKE '%defendershield%' THEN 'DefenderShield'
          WHEN broken_url LIKE '%safesleeve%' THEN 'SafeSleeve'
          WHEN broken_url LIKE '%techwellness%' THEN 'TechWellness'
          ELSE 'Other'
        END as competitor,
        COUNT(*) as count
      FROM competitor_broken_backlinks
      GROUP BY 1
      ORDER BY count DESC
    `);

    byCompetitor.rows.forEach((r: any) => {
      console.log(`  ${r.competitor}: ${r.count} broken links`);
    });

  } catch (error) {
    console.error('Error:', error);
  }

  process.exit(0);
}

checkBrokenLinks();
