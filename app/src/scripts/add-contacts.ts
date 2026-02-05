/**
 * Add sample contacts to existing prospects
 * Since SEO Command Center doesn't have contact emails,
 * we generate pattern-based contacts for testing
 */

import { db } from '../db/index.js';

interface Prospect {
  id: string;
  domain: string;
  title: string | null;
}

// Common email patterns
function generateContactEmail(domain: string): { email: string; name: string; role: string; confidence: string } {
  // Clean up domain (remove www, subdomains for email)
  const baseDomain = domain.replace(/^(www\.|blog\.|news\.|support\.)/i, '');

  // Skip known problematic domains
  const skipDomains = ['wikipedia.org', 'pinterest.com', 'youtube.com', 'facebook.com', 'twitter.com', 'reddit.com', 'amazon.com'];
  if (skipDomains.some(d => baseDomain.includes(d))) {
    return { email: `contact@${baseDomain}`, name: 'Content Team', role: 'Editor', confidence: 'D' };
  }

  // Generate common email patterns based on domain type
  const patterns = [
    { prefix: 'editor', name: 'Editor', role: 'Content Editor', confidence: 'B' },
    { prefix: 'contact', name: 'Contact', role: 'General', confidence: 'C' },
    { prefix: 'info', name: 'Info', role: 'General', confidence: 'C' },
    { prefix: 'outreach', name: 'Outreach Team', role: 'Outreach', confidence: 'B' },
    { prefix: 'partnerships', name: 'Partnerships', role: 'Partnership Manager', confidence: 'A' },
  ];

  // Pick based on domain characteristics
  let pattern;
  if (baseDomain.includes('health') || baseDomain.includes('wellness')) {
    pattern = patterns[0]; // editor
  } else if (baseDomain.includes('blog') || baseDomain.includes('medium')) {
    pattern = patterns[0]; // editor
  } else {
    pattern = patterns[Math.floor(Math.random() * patterns.length)];
  }

  return {
    email: `${pattern.prefix}@${baseDomain}`,
    name: pattern.name,
    role: pattern.role,
    confidence: pattern.confidence as 'A' | 'B' | 'C' | 'D',
  };
}

async function addContacts() {
  console.log('📧 Adding contacts to existing prospects...\n');

  try {
    // Get all prospects without contacts
    const prospects = await db.query<Prospect>(`
      SELECT p.id, p.domain, p.title
      FROM prospects p
      LEFT JOIN contacts c ON p.id = c.prospect_id
      WHERE c.id IS NULL
      ORDER BY p.quality_score DESC NULLS LAST
    `);

    console.log(`Found ${prospects.rows.length} prospects without contacts\n`);

    let added = 0;
    let skipped = 0;

    for (const prospect of prospects.rows) {
      const contact = generateContactEmail(prospect.domain);

      try {
        await db.query(`
          INSERT INTO contacts (prospect_id, email, name, role, confidence_tier, source, is_primary)
          VALUES ($1, $2, $3, $4, $5, 'pattern', true)
          ON CONFLICT (prospect_id, email) DO NOTHING
        `, [prospect.id, contact.email, contact.name, contact.role, contact.confidence]);

        added++;
        console.log(`✅ ${prospect.domain} → ${contact.email} (${contact.confidence})`);
      } catch (error: any) {
        skipped++;
        console.log(`⚠️ Skipped ${prospect.domain}: ${error.message}`);
      }
    }

    // Also update prospect status to contact_found
    await db.query(`
      UPDATE prospects p
      SET status = 'contact_found'
      WHERE EXISTS (
        SELECT 1 FROM contacts c WHERE c.prospect_id = p.id
      )
      AND p.status = 'new'
    `);

    console.log(`\n${'='.repeat(50)}`);
    console.log(`✅ Added: ${added} contacts`);
    console.log(`⏭️  Skipped: ${skipped}`);
    console.log('='.repeat(50));

  } catch (error) {
    console.error('❌ Error:', error);
  }

  process.exit(0);
}

addContacts();
