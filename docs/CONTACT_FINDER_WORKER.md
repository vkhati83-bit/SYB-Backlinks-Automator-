# How the Email Finder Works

You click "Find Emails" on a prospect. It goes through 12 steps, one by one. As soon as it finds a real email, it stops. It never makes up emails.

## The Steps

**Free stuff first (Steps 1-10):**

1. **Check the article page** — deep scans the HTML for emails hiding in mailto links, Cloudflare obfuscation, data attributes, JavaScript variables, hidden form inputs, JSON-LD, meta tags, HTML comments, and more
2. **Check the author's page** — follows "Written by..." links to their profile page
3. **Check common pages** — tries `/contact`, `/team`, `/about`, `/staff`, and 13 other paths. On team pages, clicks into each person's profile too
4. **WordPress API** — hits `/wp-json/wp/v2/users`. Many WordPress sites expose user info here
5. **RSS feed** — checks `/feed`, `/rss`, `/atom.xml`. Author emails are part of the RSS spec
6. **security.txt + DNS DMARC** — checks `/.well-known/security.txt` for contact emails, and the domain's DMARC DNS record for `mailto:` addresses
7. **Domain records** — asks WHOIS/RDAP "who registered this domain?" Sometimes there's an email
8. **Google it** — searches Google for `"@theirdomain.com"`. Falls back to DuckDuckGo if Google blocks us
9. **Google the author** — if Step 2 found a name like "Jane Smith", searches for `"Jane Smith" "@theirdomain.com"`
10. **Check their Twitter** — grabs their Twitter handle from the page and searches for it alongside their email

**Paid fallbacks (only if all 10 free steps found nothing):**

11. **Apollo.io** — searches their database for people at that company, then looks up the email. Costs 1 credit per email found
12. **Hunter.io** — absolute last resort. 25 free lookups per month

## How it reads a page

Every page it visits gets scanned 13 different ways. Not just visible text — it digs into the source code like a dev would with inspect:

- `mailto:` links
- Cloudflare email obfuscation (decodes `data-cfemail`)
- Data attributes (`data-email`, `data-contact`, etc.)
- Schema.org `itemprop="email"`
- Meta tags (`author`, `contact`, `reply-to`)
- JSON-LD structured data
- JavaScript variables and strings
- JS string concatenation (`"john" + "@" + "domain.com"`)
- Hidden form inputs (recipient emails baked into contact forms)
- HTML comments
- URL-encoded emails (`%40` instead of `@`)
- Visible text
- Raw HTML (catches anything in any attribute)

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

## Best upgrade option: Snov.io

If you want to seriously boost the hit rate, [Snov.io](https://snov.io/pricing) is the move.

- **Free trial:** 50 credits/month (renewable forever)
- **Starter:** $29/month for 1,000 credits
- **Pro S:** $74/month for 5,000 credits

What makes it good: domain search (give it a domain, get back emails), 50M+ company database, bulk search, and a clean REST API. One credit = one email lookup. Not integrated yet but easy to add before Apollo/Hunter.

## Files

| File | What it does |
|------|-------------|
| `app/src/workers/contact-finder.worker.ts` | The main worker |
| `app/src/services/contact-intelligence.service.ts` | Apollo + Hunter + Google LinkedIn |
| `app/src/services/decision-maker.service.ts` | Picks the best email when there are several |
| `app/src/services/contact-cache.service.ts` | 30-day cache |
| `app/src/api/routes/contacts.routes.ts` | API endpoints |
