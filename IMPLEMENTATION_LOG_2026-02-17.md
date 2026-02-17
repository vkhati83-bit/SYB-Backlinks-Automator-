# Implementation Log - February 17, 2026

## SESSION SUMMARY

**Date:** 2026-02-17
**Status:** DEPLOYED TO RAILWAY (both API + Dashboard)

---

## CHANGES MADE (2 Commits)

### Commit 1: `567da68` — Add prospect filter bar to all 3 prospect pages

**Why:** All 3 prospect pages (broken-links, research, prospects CRM) lacked filtering controls. Users could only switch tabs but couldn't filter by DA, score, date, or search by domain. The API already supported `min_score`, `sort_by`, `sort_order` but the UI didn't expose them.

**Backend changes (`app/src/api/routes/prospects.routes.ts`):**
- Extracted `buildProspectFilters(query, prefix)` shared helper so main query and count query stay in sync
- Added new query params: `max_score`, `min_da`/`max_da`, `date_from`/`date_to`, `search` (ILIKE on domain), `is_dofollow`, `has_article_match`, `filter_status`
- Added `filter_score` to valid sort fields
- Prefix parameter handles table alias (`p.`) for JOINed queries vs no prefix for count queries

**New component (`dashboard/src/components/ProspectFilterBar.tsx`):**
- Always-visible row: search input (300ms debounced), sort dropdown + asc/desc toggle, filters button with active count badge, result count
- Collapsible panel: DA range, score range, date range, dofollow toggle, article match toggle, filter status dropdown
- Clear All button resets to defaults
- Exports `filtersToQueryString()`, `defaultFilters`, `ProspectFilters` type
- `accentColor` prop for orange (broken-links) vs blue (research, CRM)
- `showFilters` prop to hide irrelevant controls per page

**Page integrations:**
- `dashboard/src/app/broken-links/page.tsx` — Removed "New" tab (per user request), added filter bar with orange accent, filters appended to all fetch URLs, filters reset on tab change
- `dashboard/src/app/research/page.tsx` — Added filter bar with blue accent, same pattern
- `dashboard/src/app/prospects/page.tsx` — Refactored from `/prospects/grouped` + `/prospects/approved` + `/prospects/completed` endpoints to unified `GET /prospects` endpoint with client-side grouping by `opportunity_type`. Added filter bar with blue accent.

### Commit 2: `5aeabc9` — Penalize broken link prospects without EMF/health signals (-25 score)

**Why:** Even when fetching from EMF competitor sites, the linking pages themselves might not be about EMF. A DA 50 dofollow page about cooking would score 65 (50 DA + 15 dofollow) and get auto-approved despite having zero EMF relevance.

**Changes (`app/src/api/routes/data-fetch.routes.ts`):**
- `no_health_keywords` now applies a -25 penalty (was: just missing the +20 bonus, no penalty)
- Also checks the referring page URL for health signals (not just anchor text + title)
- Applied to both `/broken-links` and `/backlinks-to-url` endpoints

**Scoring impact:**
- DA 50 dofollow page WITH health keywords: 50 + 15 + 20 = 85 → auto_approved ✓
- DA 50 dofollow page WITHOUT health keywords: 50 + 15 - 25 = 40 → needs_review (was 65 → auto_approved)
- DA 30 nofollow page WITHOUT health keywords: 30 - 25 = 5 → auto_rejected

---

## KEY TECHNICAL DECISIONS

1. **Shared filter helper with prefix:** `buildProspectFilters(query, prefix)` generates SQL clauses with optional table alias, avoiding duplication between main query and count query
2. **Client-side grouping for CRM:** Instead of a dedicated `/grouped` endpoint, CRM page now uses the same `/prospects` endpoint and groups by `opportunity_type` in React — simpler, and filters work automatically
3. **EMF relevance as gatekeeper:** A -25 penalty for missing health keywords creates a ~45-point swing vs having them (+20 vs -25), making EMF relevance the biggest single factor after DA
4. **URL text checked for health signals:** Added `url_from` to the text context checked for health keywords, catching cases like `healthblog.com/emf-dangers` where the URL signals relevance even if title/anchor don't

---

## FILES SUMMARY

### New files (1):
1. `dashboard/src/components/ProspectFilterBar.tsx`

### Modified files (4):
1. `app/src/api/routes/prospects.routes.ts` — shared filter builder + new query params
2. `app/src/api/routes/data-fetch.routes.ts` — EMF health signal penalty
3. `dashboard/src/app/broken-links/page.tsx` — filter bar + removed New tab
4. `dashboard/src/app/research/page.tsx` — filter bar
5. `dashboard/src/app/prospects/page.tsx` — filter bar + refactored to unified endpoint
