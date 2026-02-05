/**
 * Check what EMF-relevant data exists in SEO Command Center
 */

import { seoDb } from '../db/index.js';

async function checkSEOData() {
  console.log('🔍 Checking SEO Command Center for EMF-relevant data...\n');

  try {
    // Check emf_serp_results - this should have EMF-relevant pages
    console.log('='.repeat(60));
    console.log('EMF SERP RESULTS (emf_serp_results table)');
    console.log('='.repeat(60));

    const serpCount = await seoDb.query('SELECT COUNT(*) as count FROM emf_serp_results');
    console.log(`Total rows: ${serpCount.rows[0].count}\n`);

    // Get sample with keywords
    const serpSample = await seoDb.query(`
      SELECT DISTINCT ON (domain)
        url, domain, title, keyword, position
      FROM emf_serp_results
      WHERE domain NOT LIKE '%shieldyourbody%'
        AND domain NOT LIKE '%amazon%'
        AND domain NOT LIKE '%wikipedia%'
        AND domain NOT LIKE '%youtube%'
        AND domain NOT LIKE '%facebook%'
        AND domain NOT LIKE '%reddit%'
        AND domain NOT LIKE '%pinterest%'
        AND position <= 30
      ORDER BY domain, position ASC
      LIMIT 20
    `);

    console.log('Sample EMF-relevant pages:');
    serpSample.rows.forEach((r: any, i: number) => {
      console.log(`${i+1}. ${r.domain}`);
      console.log(`   URL: ${r.url}`);
      console.log(`   Title: ${r.title}`);
      console.log(`   Keyword: "${r.keyword}" (position ${r.position})`);
      console.log('');
    });

    // Check what keywords are being tracked
    console.log('\n' + '='.repeat(60));
    console.log('KEYWORDS IN EMF SERP DATA');
    console.log('='.repeat(60));

    const keywords = await seoDb.query(`
      SELECT keyword, COUNT(*) as result_count
      FROM emf_serp_results
      GROUP BY keyword
      ORDER BY result_count DESC
      LIMIT 20
    `);

    console.log('Keywords tracked:');
    keywords.rows.forEach((r: any) => {
      console.log(`  - "${r.keyword}" (${r.result_count} results)`);
    });

    // Check broken backlinks for EMF relevance
    console.log('\n' + '='.repeat(60));
    console.log('COMPETITOR BROKEN BACKLINKS');
    console.log('='.repeat(60));

    const brokenCount = await seoDb.query('SELECT COUNT(*) as count FROM competitor_broken_backlinks');
    console.log(`Total rows: ${brokenCount.rows[0].count}\n`);

    // Get columns
    const brokenCols = await seoDb.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'competitor_broken_backlinks'
    `);
    console.log('Columns:', brokenCols.rows.map((r: any) => r.column_name).join(', '));

    const brokenSample = await seoDb.query(`
      SELECT *
      FROM competitor_broken_backlinks
      WHERE referring_domain NOT LIKE '%shieldyourbody%'
      LIMIT 5
    `);

    console.log('\nSample broken backlinks:');
    brokenSample.rows.forEach((r: any, i: number) => {
      console.log(`${i+1}. ${JSON.stringify(r, null, 2)}`);
    });

  } catch (error) {
    console.error('Error:', error);
  }

  process.exit(0);
}

checkSEOData();
