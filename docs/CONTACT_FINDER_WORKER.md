# Contact Finder Worker

**File:** `app/src/workers/contact-finder.worker.ts`

Click "Find Emails" on a prospect. The worker runs 7 free steps in order and **stops as soon as it finds a real email**. If all 7 fail, Hunter.io kicks in as the last resort.

---

## The 7 Steps

| Step | What it does |
|------|-------------|
| **1. Scrape the article page** | Looks for `mailto:` links and plain-text emails on the prospect URL |
| **2. Follow author links** | Finds the author's profile page (via `rel="author"`, JSON-LD, byline classes) and scrapes it. Saves the author name for Step 6 |
| **3. Contact/team pages** | Tries 17 common paths (`/contact`, `/team`, `/about`, `/staff`, `/writers`, etc.). On team pages, also follows links to individual profile pages |
| **4. WHOIS/RDAP lookup** | Queries domain registration records for an admin email |
| **5. Web search** | Searches Google (then DuckDuckGo as fallback) for `"@domain.com"` and `contact email site:domain.com` |
| **6. Targeted name search** | If Step 2 found an author name, searches Google/DDG for `"Jane Smith" "@domain.com"` |
| **7. Social handle search** | Finds Twitter/X handles on the page and searches for `"@handle" email "@domain.com"` |

**Step 8 (last resort):** Hunter.io API — only fires when all 7 free steps found nothing. 25 free lookups/month.

---

## What Gets Filtered Out

- `abuse@`, `noreply@`, `no-reply@` prefixes
- Disposable email services (Mailinator, etc.)
- Registrar/hosting domains (Namecheap, GoDaddy, Cloudflare, etc. — 30+ blocked)
- `@example.com`, `@test.com`
- Manually blocklisted emails

---

## Confidence Tiers

| Tier | Meaning |
|------|---------|
| **A** | Found by scraping + real name identified |
| **B** | Found by scraping, no name |
| **D** | Found by Hunter.io |

---

## Other Details

- **Caching:** Results cached in Redis for 30 days per domain
- **No guessing:** Never invents pattern emails like `editor@domain.com`
- **Name detection:** Extracts names from surrounding text or from the email itself (`jane.smith@` becomes "Jane Smith")

---

## Files

| File | Role |
|------|------|
| `app/src/workers/contact-finder.worker.ts` | Main worker |
| `app/src/services/contact-intelligence.service.ts` | Hunter.io + Google LinkedIn (paid APIs) |
| `app/src/services/decision-maker.service.ts` | Scores and ranks contacts |
| `app/src/services/contact-cache.service.ts` | Redis caching (30-day TTL) |
| `app/src/api/routes/contacts.routes.ts` | REST endpoints |
