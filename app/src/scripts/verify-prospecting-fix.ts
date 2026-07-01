// One-off verification for the prospecting-stall fix (no test framework in this repo).
// Reproduces the bug and proves the fix against the REAL databases (SEO queries are read-only).
//
// Run from app/:  npx tsx src/scripts/verify-prospecting-fix.ts
//
// Bug: getCompetitorReferringDomains / getEmfSerpResults had no exclusion, so the top 30
// rows (all already prospected since Apr/May) came back every run and were discarded as
// dupes -> 0 new prospects. Fix: pass the already-prospected set as an exclusion list.

import { prospectRepository } from '../db/repositories/index.js';
import { seoDataService } from '../services/seo-data.service.js';
import { closeConnections } from '../db/index.js';

const strip = (d: string) => d.replace(/^www\./, '');

async function main(): Promise<void> {
  const excludeDomains = await prospectRepository.getProspectedDomains();
  const excludeUrls = await prospectRepository.getProspectedUrls();
  const domainSet = new Set(excludeDomains);
  const urlSet = new Set(excludeUrls);
  console.log(`Already-prospected: ${excludeDomains.length} domains, ${excludeUrls.length} urls\n`);

  // --- COMPETITOR REFERRING DOMAINS ---
  const oldComp = await seoDataService.getCompetitorReferringDomains(20, 30, []); // pre-fix behavior
  const oldWasted = oldComp.filter(r => domainSet.has(strip(r.referring_domain))).length;
  const newComp = await seoDataService.getCompetitorReferringDomains(20, 30, excludeDomains);
  const compLeaked = newComp.filter(r => domainSet.has(strip(r.referring_domain))).length;
  console.log(`COMPETITOR pre-fix : ${oldComp.length} rows, ${oldWasted} already-prospected (wasted) -> ${oldComp.length - oldWasted} usable`);
  console.log(`COMPETITOR fixed   : ${newComp.length} rows, ${compLeaked} leaked, ${newComp.length - compLeaked} fresh\n`);

  // --- EMF SERP RESULTS ---
  const oldSerp = await seoDataService.getEmfSerpResults(1, 30, 30, []); // pre-fix behavior
  const oldSerpWasted = oldSerp.filter(r => urlSet.has(r.url)).length;
  const newSerp = await seoDataService.getEmfSerpResults(1, 30, 30, excludeUrls);
  const serpLeaked = newSerp.filter(r => urlSet.has(r.url)).length;
  console.log(`SERP pre-fix : ${oldSerp.length} rows, ${oldSerpWasted} already-prospected (wasted) -> ${oldSerp.length - oldSerpWasted} usable`);
  console.log(`SERP fixed   : ${newSerp.length} rows, ${serpLeaked} leaked, ${newSerp.length - serpLeaked} fresh\n`);

  // Fix is verified when the exclusion leaks nothing AND (given untapped inventory) returns fresh rows.
  const leaksNothing = compLeaked === 0 && serpLeaked === 0;
  const returnsFresh =
    (excludeDomains.length === 0 || newComp.length > 0) &&
    (excludeUrls.length === 0 || newSerp.length > 0);
  const pass = leaksNothing && returnsFresh;

  console.log(pass
    ? '✅ FIX VERIFIED: exclusion leaks 0 already-prospected rows and reaches fresh inventory.'
    : `❌ FAIL: leaksNothing=${leaksNothing} returnsFresh=${returnsFresh}`);

  await closeConnections();
  process.exit(pass ? 0 : 1);
}

main().catch(async (err) => {
  console.error('verify script error:', err);
  try { await closeConnections(); } catch { /* ignore */ }
  process.exit(1);
});
