# Contact Finder Worker — How It Works

**File:** `app/src/workers/contact-finder.worker.ts`

---

## What It Does

When you click **"Find Emails"** on a prospect in the dashboard, this worker runs in the background and tries to find a real, working email address for that website. It saves whatever it finds to the database so you can compose an outreach email.

It never guesses or invents email addresses. If it can't find anything real, it returns nothing.

---

## How It's Triggered

1. You click "Find Emails" on a prospect in the dashboard
2. The dashboard calls `POST /api/v1/contacts/:prospectId/find`
3. That endpoint drops a job into the **`contact-finder` BullMQ queue** (backed by Redis)
4. This worker picks up the job and runs the search
5. Found contacts are saved to the `contacts` database table
6. The prospect's status updates to `contact_found`

---

## The Search Process (7 Steps in Order)

The worker tries each step in sequence and **stops as soon as it finds something**. It never runs a later step if an earlier one already succeeded.

### Step 1 — Scrape the Article Page

The worker fetches the actual prospect URL (the specific article or page you're targeting, not just the homepage). It looks for:

- **`mailto:` links** — the most reliable source; directly embedded email links in the HTML
- **Plain email addresses** in the visible page text — some sites write their email as plain text

If an email is found here, the search stops.

### Step 2 — Follow Author Page Links

If Step 1 finds no email, the worker looks for links to the article author's profile page. Many blogs publish a "Written by Jane Smith" byline that links to a dedicated author page — and those author pages often have a contact email.

It finds author links four ways:
- `rel="author"` links (standard HTML attribute for author links)
- Schema.org `itemprop="author"` markup (structured data many WordPress sites use)
- JSON-LD schema embedded in `<script>` tags (used by news sites and modern blogs)
- CSS class patterns like `.author a`, `.byline a`, `.post-author a` — but only if the URL looks like a real author profile path (e.g. `/author/jane-smith`)

It follows up to 3 author URLs and scrapes each one for email addresses. Stops as soon as it finds one.

The author's name is saved for use in Step 6 (targeted name search).

### Step 3 — Try Standard Contact/About/Team Pages

If Steps 1 and 2 find nothing, the worker tries common contact page paths on the same domain:

```
/contact          /contact-us       /about
/about-us         /write-for-us     /contribute
/team             /our-team         /author
/staff            /people           /contributors
/writers          /editorial        /editorial-team
/masthead         /editors
```

It tries them one by one and stops at the first one that yields an email.

**New:** On team/staff/people pages, the worker also **follows links to individual profile pages** (e.g. `/team/jane-smith`). It follows up to 5 profile links per team page and scrapes each one for emails.

### Step 4 — WHOIS/RDAP Lookup

The worker queries the public **RDAP** (Registration Data Access Protocol) registry for the domain. Some domain registrations include an admin or registrant email — especially smaller or older sites that haven't enabled WHOIS privacy.

This is free, requires no API key, and is a quick JSON API call. Many domains will return nothing (GDPR privacy), but it catches some that the scraping steps miss.

### Step 5 — DuckDuckGo Web Search

The worker searches DuckDuckGo for the domain's email. Many email addresses are publicly indexed — in press releases, forum posts, social profiles, or pages cached by search engines.

It runs two searches:
1. `"@domain.com"` — finds any indexed mention of an email address at that domain
2. `contact email site:domain.com` — specifically looks for contact pages indexed by the search engine

It scans the search result snippets for any email address that matches `@domain.com`. This is completely free and requires no API key.

### Step 6 — Targeted Name Search

If an author name was found in Step 2 (e.g. "Jane Smith") but no email was found anywhere, the worker runs a **targeted search** combining that person's name with the domain:

1. `"Jane Smith" "@domain.com"` — finds indexed mentions of that person's email
2. `"Jane Smith" email domain.com` — broader search for the person's contact info

This is much more specific than the generic Step 5 search and can find emails that the domain-only search misses — for example, if the person's email appears on a conference speaker page or a guest post on another site.

### Step 7 — Social Handle Web Search

The worker extracts **Twitter/X handles** from the article page (looking for links to twitter.com or x.com). It then searches DuckDuckGo for that handle combined with the domain's email pattern:

`"@twitterhandle" email "@domain.com"`

This catches cases where someone's email appears alongside their social handle in directories, speaker bios, or public databases.

---

## Email Validation

Every email found goes through a basic validation check before being saved:

| Check | What it does |
|---|---|
| Format check | Must be a valid email format, under 254 characters |
| Disposable domain check | Rejects known throwaway email services (Mailinator, etc.) |
| Noreply check | Rejects `noreply@` and `no-reply@` addresses |
| Test domain check | Rejects anything `@example.com` or `@test.com` |
| Blocklist check | Rejects emails that have been manually blocked in your blocklist |

---

## Name Detection

When an email is found, the worker also tries to attach a real name to it. It looks:

- **In the surrounding text** — if the page says "Jane Smith — jane@domain.com", it captures "Jane Smith"
- **In the email address itself** — if the address is `jane.smith@domain.com`, it converts that to "Jane Smith"

Generic role-based addresses (`info@`, `contact@`, `editor@`, `admin@`, etc.) are never given a guessed name since the local part isn't a real person's name.

---

## Confidence Tiers

Every saved contact gets a confidence tier (shown in the dashboard):

| Tier | Meaning |
|---|---|
| **A** | Found by scraping and a real name was identified |
| **B** | Found by scraping but no name could be determined |
| **D** | Found by Hunter.io or another external API (if configured) |

---

## Caching

Results are cached in Redis for 30 days. If you click "Find Emails" on two different prospects from the same domain within that window, the second lookup is instant and costs nothing — it reuses the cached result.

---

## What It Does NOT Do

- **No pattern generation** — it will never invent `editor@domain.com` or `info@domain.com` and save those as contacts. If nothing real is found, the contact list stays empty.
- **No paid APIs (currently)** — Hunter.io and Google Custom Search are supported in the code but their API keys are not configured. All seven steps above are free.
- **No LinkedIn scraping** — LinkedIn blocks scraping. The Google LinkedIn search step (in the intelligence service) is available but requires a Google Custom Search API key.

---

## Paid API Upgrade Path

If you ever want better coverage, two API keys can be added to Railway environment variables:

| Variable | Service | Free tier | What it adds |
|---|---|---|---|
| `HUNTER_API_KEY` | Hunter.io | 25 searches/month | Email lookup by domain, verified with confidence scores, names and job titles |
| `GOOGLE_SEARCH_API_KEY` + `GOOGLE_SEARCH_CX` | Google Custom Search | 100 queries/day | LinkedIn profile discovery to find decision-makers by name |

Adding these does not require any code changes — the existing `contact-intelligence.service.ts` already handles them. Just set the env vars in Railway and they activate automatically.

---

## File Map

| File | Role |
|---|---|
| `app/src/workers/contact-finder.worker.ts` | Main worker — scraping, author discovery, WHOIS, DuckDuckGo, social handle search |
| `app/src/services/contact-intelligence.service.ts` | Paid API layer — Hunter.io, Google LinkedIn (activates when API keys are set) |
| `app/src/services/decision-maker.service.ts` | Scores and ranks contacts by quality when multiple are found |
| `app/src/services/email-validator.service.ts` | DNS and Hunter.io email verification |
| `app/src/services/contact-cache.service.ts` | Redis caching (30-day TTL) |
| `app/src/api/routes/contacts.routes.ts` | REST endpoints that trigger the worker |
