# How the Email Finder Works

You click "Find Emails" on a prospect. It goes through 9 steps, one by one. As soon as it finds a real email, it stops. It never makes up emails.

## The Steps

**Free stuff first (Steps 1-7):**

1. **Check the article page** — looks for email links and plain-text emails right on the page
2. **Check the author's page** — follows "Written by..." links to their profile page
3. **Check common pages** — tries `/contact`, `/team`, `/about`, `/staff`, and 13 other paths. On team pages, clicks into each person's profile too
4. **Check domain records** — asks the internet "who registered this domain?" Sometimes there's an email there
5. **Google it** — searches Google for `"@theirdomain.com"`. Falls back to DuckDuckGo if Google blocks us
6. **Google the author** — if Step 2 found a name like "Jane Smith", searches for `"Jane Smith" "@theirdomain.com"`
7. **Check their Twitter** — grabs their Twitter handle from the page and searches for it alongside their email

**Paid fallbacks (only if free steps found nothing):**

8. **Apollo.io** — searches their database for people at that company, then looks up the email. Costs 1 credit per email found
9. **Hunter.io** — absolute last resort. 25 free lookups per month

## Junk it ignores

- `abuse@`, `noreply@` addresses
- Emails from hosting companies (Namecheap, GoDaddy, Cloudflare, etc.)
- Throwaway email services (Mailinator, etc.)
- Anything you've manually blocked

## How good is the email?

| Grade | What it means |
|-------|--------------|
| **A** | Found it AND know the person's name |
| **B** | Found it but don't know who it belongs to |
| **D** | Came from Apollo or Hunter |

## Good to know

- Results are saved for 30 days. Same domain = instant lookup the second time
- If the email looks like `jane.smith@`, it turns that into "Jane Smith" automatically
- Generic prefixes like `info@` or `editor@` don't get a fake name attached

## Files

| File | What it does |
|------|-------------|
| `app/src/workers/contact-finder.worker.ts` | The main worker |
| `app/src/services/contact-intelligence.service.ts` | Apollo + Hunter + Google LinkedIn |
| `app/src/services/decision-maker.service.ts` | Picks the best email when there are several |
| `app/src/services/contact-cache.service.ts` | 30-day cache |
| `app/src/api/routes/contacts.routes.ts` | API endpoints |
