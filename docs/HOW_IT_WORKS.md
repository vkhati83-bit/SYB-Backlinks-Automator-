# Backlink App - How It Works (Detailed)

---

## Scope

**Building now:**
- **Research citation outreach** - Find pages discussing EMF/radiation topics, pitch SYB's research database as a credible source to link to
- **Broken link outreach** - Find dead links on relevant pages, offer SYB research as replacement

**The asset we're pitching:**
- **shieldyourbody.com/research** - Database of 3,600+ scientist-reviewed research studies on EMF and health

**Future (not building yet):**
- Guest post outreach

---

## Step 1: Find Websites

### Who does it?
**Our code** (a script we write) calls the **DataForSEO API** and processes the results.

### What happens exactly?

```
┌──────────────┐      API call      ┌──────────────┐      raw data      ┌──────────────┐
│  Our Script  │ ─────────────────▶ │  DataForSEO  │ ─────────────────▶ │  Our Script  │
│  (Node.js)   │                    │     API      │                    │  filters &   │
│              │◀───────────────────│              │                    │  saves to DB │
└──────────────┘    returns data    └──────────────┘                    └──────────────┘
```

### The script does TWO different searches:

#### Search A: Pages Discussing EMF/Radiation Topics (SERP Search)
**Input parameters we provide:**
```
search_queries: [
  "EMF exposure health effects",
  "cell phone radiation dangers",
  "5G health risks",
  "WiFi radiation health",
  "electromagnetic radiation studies",
  "EMF and cancer research",
  "phone radiation safety",
  "EMF protection science",
  "wireless radiation health effects",
  "are cell phones safe",
  "EMF sensitivity symptoms"
]
```

**What DataForSEO returns:**
- Top 100 Google results for each query
- Each result includes: URL, title, domain metrics

**Our script then filters:**
- Domain Authority > 20
- Spam Score < 30
- Monthly Traffic > 1,000
- Not already in our database
- English language sites
- Page discusses EMF/radiation topics (good candidate to cite research)

#### Search B: Broken Link Finder
**Input parameters we provide:**
```
target_domains: ["defendershield.com"]  // competitor
```

**What DataForSEO returns:**
- All backlinks pointing to that competitor
- Status code for each (200 = working, 404 = broken)

**Our script then filters:**
- Only 404 (broken) links
- The linking site must pass our quality filters
- We must have content that could replace the dead link

### Output saved to database:

| Field | Example |
|-------|---------|
| domain | healthmaven.com |
| url | healthmaven.com/emf-exposure-guide |
| opportunity_type | research_citation |
| source | serp_search |
| domain_authority | 45 |
| monthly_traffic | 12,000 |
| spam_score | 8 |
| status | new |

---

## Step 2: Find Contact Information

### Who does it?
**Our code** (a scraper script we write). No external API. No AI.

### What happens exactly?

```
┌──────────────┐                    ┌──────────────┐                    ┌──────────────┐
│  Our Script  │ ── HTTP request ─▶│   Target     │ ── HTML page ────▶ │  Our Script  │
│  (scraper)   │                    │   Website    │                    │  extracts    │
│              │                    │              │                    │  emails      │
└──────────────┘                    └──────────────┘                    └──────────────┘
```

### The script does this for each prospect:

**Step 2a: Fetch pages**

The script tries to load these URLs:
```
https://healthmaven.com/contact
https://healthmaven.com/contact-us
https://healthmaven.com/about
https://healthmaven.com/about-us
https://healthmaven.com/write-for-us
https://healthmaven.com/guest-post
https://healthmaven.com/contribute
```

**Step 2b: Extract emails from HTML**

The script scans the page HTML for:
```
1. Email regex pattern: [a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}
   Finds: sarah@healthmaven.com, editor@healthmaven.com

2. Mailto links: <a href="mailto:sarah@healthmaven.com">
   Finds: sarah@healthmaven.com

3. Contact name (if near email): "Sarah Johnson" or "Editor: Sarah"
```

**Step 2c: If no email found, try common patterns**

The script generates guesses:
```
editor@healthmaven.com
contact@healthmaven.com
info@healthmaven.com
hello@healthmaven.com
admin@healthmaven.com
```

**Step 2d: Validate the email**

For each email found or guessed:
```
1. Syntax check - is it a valid email format?
2. MX record check - does healthmaven.com have mail servers?
3. Disposable check - is it a throwaway email service?
```

### Output saved to database:

| Field | Example |
|-------|---------|
| prospect_id | (links to prospect) |
| email | sarah@healthmaven.com |
| name | Sarah Johnson |
| source | scraped (or "pattern_guess") |
| confidence | 90 (or 40 if guessed) |
| validated | true |

---

## Step 3: Write Personalized Emails

### Who does it?
**Our code** prepares the context, then **Claude API** writes the email.

### What happens exactly?

```
┌──────────────┐                    ┌──────────────┐                    ┌──────────────┐
│  Our Script  │ ── scrapes ──────▶│   Target     │                    │              │
│              │                    │   Website    │                    │              │
│              │◀── page content ──│              │                    │              │
│              │                    └──────────────┘                    │              │
│              │                                                        │   Claude     │
│              │ ── prompt + context ─────────────────────────────────▶│     API      │
│              │                                                        │              │
│              │◀── generated email ───────────────────────────────────│              │
└──────────────┘                                                        └──────────────┘
```

### Step 3a: Our script scrapes the target page

**Input:** The prospect's URL (e.g., healthmaven.com/write-for-us)

**Script extracts:**
```
- Page title: "Write For Us - Health Maven"
- Meta description: "We accept guest posts on health, wellness..."
- First 500 words of content
- Topics/categories mentioned
- Any specific guidelines they list
```

### Step 3b: The asset we're pitching

**Primary asset:**
```
SYB Research Database
URL: shieldyourbody.com/research
Description: Database of 3,600+ scientist-reviewed peer-reviewed studies on EMF and health
Credibility: All studies are from peer-reviewed scientific journals
```

This is the main thing we pitch. It's a credible research source that adds value to any page discussing EMF topics.

### Step 3c: Our script builds the prompt for Claude

**System prompt (same every time, cached for cost savings):**
```
You are an outreach specialist for ShieldYourBody. We have a research database
at shieldyourbody.com/research containing 3,600+ peer-reviewed scientific studies
on EMF and health effects.

Write personalized outreach emails that:
- Sound human and genuine, not templated
- Reference something specific from their article/page
- Position the research database as a credible source that adds value to their content
- Are concise (under 150 words for body)
- Have a clear but non-pushy ask

Return JSON: {"subject": "...", "body": "..."}
```

**User prompt (unique per email) - RESEARCH CITATION example:**
```
OUTREACH TYPE: research_citation

TARGET WEBSITE: healthmaven.com
PAGE URL: healthmaven.com/cell-phone-radiation-health
PAGE CONTENT: "Cell Phone Radiation and Your Health - Many people wonder if cell
phones are safe. Studies have shown mixed results, but there's growing concern
about long-term exposure. Here's what we know about the potential risks..."

CONTACT NAME: Sarah

Write a personalized email pitching our research database as a credible source
they could link to.
```

### Step 3d: Claude returns the email

**Research citation example:**
```json
{
  "subject": "Research resource for your cell phone radiation article",
  "body": "Hi Sarah,\n\nI came across your article on cell phone radiation and health - you did a nice job breaking down a complex topic.\n\nI wanted to share a resource that might be useful: we've compiled a database of 3,600+ peer-reviewed studies on EMF and health at shieldyourbody.com/research. It's searchable by topic (cell phones, WiFi, 5G, etc.) and all studies are from scientific journals.\n\nMight be a helpful reference to link to for readers who want to dig deeper into the research.\n\nEither way, thanks for covering this topic!\n\nBest,\n[Name]"
}
```

**User prompt - BROKEN LINK example:**
```
OUTREACH TYPE: broken_link

TARGET WEBSITE: techsafety.org
PAGE URL: techsafety.org/emf-health-guide
PAGE CONTENT: "Guide to EMF and health... [link to defunctsite.com/emf-studies - BROKEN]..."

CONTACT NAME: Mike

BROKEN LINK:
- Dead URL: defunctsite.com/emf-studies
- Anchor text: "EMF research studies"

Write a personalized broken link outreach email, suggesting our research database
as a replacement.
```

**Broken link example:**
```json
{
  "subject": "Broken link on your EMF health guide",
  "body": "Hi Mike,\n\nI was reading your EMF health guide and noticed the link to \"EMF research studies\" (defunctsite.com) is no longer working.\n\nWe have a research database at shieldyourbody.com/research with 3,600+ peer-reviewed studies on EMF and health - might work as a replacement since it covers similar ground.\n\nEither way, wanted to give you a heads up about the dead link!\n\nBest,\n[Name]"
}
```

### Output saved to database:

| Field | Example |
|-------|---------|
| prospect_id | (links to prospect) |
| contact_id | (links to contact) |
| subject | Guest post idea: Children's screen time... |
| body | Hi Sarah, I've been reading... |
| email_type | initial |
| review_status | pending |

---

## Step 4: Human Review Dashboard

### Who does it?
**A person** using a **web dashboard** we build.

### What the dashboard looks like:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  BACKLINK OUTREACH                                            [Logout]          │
├────────────────────┬────────────────────────────────────────────────────────────┤
│                    │                                                            │
│  NAVIGATION        │  REVIEW QUEUE                                    24 pending│
│                    │                                                            │
│  ▶ Review Queue    │  ┌────────────────────────────────────────────────────────┐│
│    24 pending      │  │                                                        ││
│                    │  │  healthmaven.com                      Research Citation││
│    Pipeline        │  │  DA: 45  •  Traffic: 12K/mo  •  Spam: 8%              ││
│                    │  │  Their article: "Cell Phone Radiation and Health"     ││
│    Responses       │  │                                                        ││
│    3 new           │  │  To: sarah@healthmaven.com                             ││
│                    │  │  Subject: Research resource for your cell phone...    ││
│    Sent            │  │  ───────────────────────────────────────────────────── ││
│    127 this month  │  │                                                        ││
│                    │  │  Hi Sarah,                                             ││
│    Metrics         │  │                                                        ││
│                    │  │  I came across your article on cell phone radiation   ││
│                    │  │  and health - you did a nice job breaking down a      ││
│                    │  │  complex topic.                                        ││
│                    │  │                                                        ││
│                    │  │  I wanted to share a resource that might be useful... ││
│                    │  │                                                        ││
│                    │  │  [View Full Email]                                     ││
│                    │  │                                                        ││
│                    │  │  ┌─────────────────────────────────────────────────┐  ││
│                    │  │  │ [Visit Their Site]  [See Their Article]        │  ││
│                    │  │  └─────────────────────────────────────────────────┘  ││
│                    │  │                                                        ││
│                    │  │  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐ ││
│                    │  │  │ ✓ Approve│  │ ✎ Edit   │  │ ✗ Reject         ▼  │ ││
│                    │  │  └──────────┘  └──────────┘  └──────────────────────┘ ││
│                    │  │                                                        ││
│                    │  └────────────────────────────────────────────────────────┘│
│                    │                                                            │
│                    │  ┌────────────────────────────────────────────────────────┐│
│                    │  │                                                        ││
│                    │  │  techsafety.org                            Broken Link ││
│                    │  │  DA: 38  •  Traffic: 8K/mo  •  Spam: 12%              ││
│                    │  │  Dead link: defunctsite.com/emf-studies                ││
│                    │  │  ...                                                   ││
│                    │  └────────────────────────────────────────────────────────┘│
│                    │                                                            │
└────────────────────┴────────────────────────────────────────────────────────────┘
```

### What each button does:

#### [✓ Approve]
- Marks email as approved
- Moves it to the send queue
- Email gets sent within the hour (respecting daily limits)

#### [✎ Edit]
Opens an edit modal:
```
┌─────────────────────────────────────────────────────────────────┐
│  EDIT EMAIL                                              [X]    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Subject:                                                       │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Research resource for your cell phone radiation article    ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  Body:                                                          │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Hi Sarah,                                                   ││
│  │                                                             ││
│  │ I came across your article on cell phone radiation and     ││
│  │ health - you did a nice job breaking down a complex topic. ││
│  │                                                             ││
│  │ I wanted to share a resource that might be useful: we've   ││
│  │ compiled a database of 3,600+ peer-reviewed studies...     ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│                        [Cancel]  [Save & Approve]               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### [✗ Reject ▼]
Dropdown with reasons:
```
┌─────────────────────────┐
│ ✗ Wrong tone            │
│ ✗ Factual error         │
│ ✗ Bad personalization   │
│ ✗ Site not relevant     │
│ ✗ Already contacted     │
│ ✗ Other...              │
└─────────────────────────┘
```

Rejection reason gets saved - helps us improve prompts over time.

### Other dashboard screens:

#### Pipeline View
```
┌─────────────────────────────────────────────────────────────────┐
│  PIPELINE                                                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Prospects    →    Contacts Found    →    Emails Drafted       │
│     847              612                     489                │
│                                                                 │
│       ↓                                                         │
│                                                                 │
│  Pending Review    →    Sent    →    Replied    →    Placed    │
│       24               127            18              6         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Responses View
```
┌─────────────────────────────────────────────────────────────────┐
│  RESPONSES                                          3 need action│
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  🟢 POSITIVE  •  healthmaven.com  •  2 hours ago           ││
│  │                                                             ││
│  │  "Thanks for sharing this! That's an impressive research   ││
│  │   database. I've added a link to it in my article."         ││
│  │                                                             ││
│  │  [Mark as Handled]  [View Full Thread]                      ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  🟢 POSITIVE  •  techsafety.org  •  1 day ago              ││
│  │                                                             ││
│  │  "Good catch on the broken link! I've updated it to point  ││
│  │   to your research database. Thanks for letting me know."   ││
│  │                                                             ││
│  │  [Mark as Handled]  [View Full Thread]                      ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Metrics View
```
┌─────────────────────────────────────────────────────────────────┐
│  METRICS                                           January 2026 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  This Month                                                     │
│  ───────────────────────────────────────────────────────────── │
│  Emails Sent:        127                                        │
│  Open Rate:          43% ██████████░░░░░░░░░░                  │
│  Reply Rate:         14% ███░░░░░░░░░░░░░░░░░                  │
│  Positive Replies:   18                                         │
│  Links Placed:       6                                          │
│                                                                 │
│  Cost                                                           │
│  ───────────────────────────────────────────────────────────── │
│  Claude API:         $12.40                                     │
│  Cost per Link:      $2.07                                      │
│                                                                 │
│  By Outreach Type                                               │
│  ───────────────────────────────────────────────────────────── │
│  Research Citation:  89 sent → 14 replies → 5 placed (5.6%)    │
│  Broken Link:        38 sent → 4 replies → 1 placed (2.6%)     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Step 5: Send Emails

### Who does it?
**Our code** calls the **Resend API**. Resend delivers the email.

### What happens exactly?

```
┌──────────────┐                    ┌──────────────┐                    ┌──────────────┐
│  Our Script  │ ── API call ─────▶│   Resend     │ ── delivers ─────▶│  Recipient   │
│  (sender     │                    │     API      │                    │   Inbox      │
│   worker)    │◀── confirmation ──│              │                    │              │
└──────────────┘                    └──────────────┘                    └──────────────┘
```

### What our script sends to Resend:

```javascript
{
  from: "outreach@mail.shieldyourbody.com",
  to: "sarah@healthmaven.com",
  subject: "Guest post idea: Children's screen time and EMF exposure",
  html: "<p>Hi Sarah,</p><p>I've been reading Health Maven...",
  reply_to: "outreach@shieldyourbody.com"
}
```

### What Resend returns:

```javascript
{
  id: "a1b2c3d4-e5f6-7890",  // Resend's ID for tracking
  status: "sent"
}
```

### Sending limits (our script enforces):

| Week | Max per day | Why |
|------|-------------|-----|
| 1-2 | 20 | Warm up the sending domain |
| 3-4 | 50 | Gradual increase |
| 5+ | 100 | Full operation |

---

## Step 6: Automatic Follow-ups

### Who does it?
**Our code** (a scheduled job). Same process as Step 5, but triggered by time.

### What happens exactly?

```
┌──────────────┐                    ┌──────────────┐
│  Scheduler   │ ── runs hourly ──▶│  Check DB:   │
│  (cron job)  │                    │  any follow- │
│              │                    │  ups due?    │
└──────────────┘                    └──────┬───────┘
                                          │
                                          ▼
                                   ┌──────────────┐
                        Yes ──────│  Generate    │
                                  │  follow-up   │
                                  │  email       │
                                  └──────┬───────┘
                                         │
                                         ▼
                                  ┌──────────────┐
                                  │  Send via    │
                                  │  Resend      │
                                  └──────────────┘
```

### The schedule our script follows:

| After initial send | Action |
|--------------------|--------|
| Day 4 | Send follow-up #1 |
| Day 8 | Send follow-up #2 |
| Day 14 | Stop, mark "no response" |

### Follow-up emails are also generated by Claude:

**Prompt for follow-up #1:**
```
Write a brief follow-up email (under 50 words).
Reference that you emailed a few days ago about [original topic].
Keep it friendly, not pushy.
```

**Example output:**
```
Subject: Re: Research resource for your cell phone radiation article

Hi Sarah,

Just wanted to bump this in case it got buried - thought our research database
might be useful for your readers.

Happy to answer any questions about it.

Best,
[Name]
```

### When follow-ups STOP:

Our script checks before sending:
- Did they reply? → Stop
- Did email bounce? → Stop
- Did they unsubscribe? → Stop
- Already sent 2 follow-ups? → Stop

---

## Step 7: Handle Responses

### Who does it?
**Our code** detects replies. **A person** handles positive responses.

### How we detect replies:

**Option A: Webhook from Resend**
```
Resend sends us a notification when someone replies
     │
     ▼
Our webhook endpoint receives it
     │
     ▼
Script updates database: "reply received"
     │
     ▼
Script stops follow-up sequence
     │
     ▼
Appears in dashboard "Responses" tab
```

**Option B: Inbox monitoring (if webhooks don't catch replies)**
```
Every 15 minutes, our script:
     │
     ▼
Connects to outreach@shieldyourbody.com inbox
     │
     ▼
Checks for new emails
     │
     ▼
Matches replies to original outreach (by subject line, email thread)
     │
     ▼
Updates database, stops sequence, notifies team
```

### What humans do with responses:

| Response type | Human action needed |
|---------------|---------------------|
| "Added a link to your research!" | Verify the link is live, log as success |
| "Interesting, tell me more" | Reply with more details about the research database |
| "Fixed the broken link, thanks!" | Verify they linked to our research, log as success |
| "Is this peer-reviewed?" | Reply confirming all 3,600+ studies are peer-reviewed |
| "Not interested" | Nothing - already marked closed |

---

## Step 8: Track Results

### Who does it?
**Our code** aggregates the data. **A person** views it in the dashboard.

### What we track:

| Metric | Where data comes from |
|--------|----------------------|
| Emails sent | Our database |
| Opens | Resend webhook (tracks pixel) |
| Replies | Inbox monitoring or webhook |
| Links placed | Human marks in dashboard when confirmed |

### How "link placed" gets recorded:

1. Someone replies positively
2. Human follows up, guest post gets published (or resource page updated)
3. Human clicks "Mark as Placed" in dashboard
4. Human pastes the live URL
5. Script verifies the link exists on the page
6. Logged as success

---

## Summary: Who Does What

| Step | Who/What Does It | External Service Used |
|------|------------------|----------------------|
| 1. Find websites | Our script | DataForSEO API |
| 2. Find contacts | Our script (scraper) | None |
| 3. Write emails | Our script + Claude | Claude API |
| 4. Review emails | Human | Dashboard (Vercel) |
| 5. Send emails | Our script | Resend API |
| 6. Follow-ups | Our script (scheduler) | Claude API + Resend API |
| 7. Detect replies | Our script | Resend webhooks |
| 8. Handle replies | Human | Dashboard |
| 9. Track metrics | Our script | Dashboard |

---

## What "Our Script" Means

All the automation runs as **backend code on Railway**:

```
┌─────────────────────────────────────────────────────────────────┐
│                         RAILWAY                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────────────┐  Runs daily at 2am                        │
│   │ Prospecting     │  Calls DataForSEO, saves new prospects    │
│   │ Script          │                                           │
│   └─────────────────┘                                           │
│                                                                  │
│   ┌─────────────────┐  Runs when new prospect appears           │
│   │ Contact Finder  │  Scrapes websites for emails              │
│   │ Script          │                                           │
│   └─────────────────┘                                           │
│                                                                  │
│   ┌─────────────────┐  Runs when contact is found               │
│   │ Email Generator │  Calls Claude API, saves draft            │
│   │ Script          │                                           │
│   └─────────────────┘                                           │
│                                                                  │
│   ┌─────────────────┐  Runs when email is approved              │
│   │ Send Worker     │  Calls Resend API                         │
│   │ Script          │                                           │
│   └─────────────────┘                                           │
│                                                                  │
│   ┌─────────────────┐  Runs every hour                          │
│   │ Follow-up       │  Checks for due follow-ups, sends them    │
│   │ Scheduler       │                                           │
│   └─────────────────┘                                           │
│                                                                  │
│   ┌─────────────────┐  Runs every 15 minutes                    │
│   │ Reply Checker   │  Monitors inbox for responses             │
│   │ Script          │                                           │
│   └─────────────────┘                                           │
│                                                                  │
│   ┌─────────────────┐  Always running                           │
│   │ API Server      │  Serves data to dashboard                 │
│   │                 │  Receives Resend webhooks                 │
│   └─────────────────┘                                           │
│                                                                  │
│   ┌─────────────────┐                                           │
│   │ PostgreSQL      │  Stores everything                        │
│   │ Database        │                                           │
│   └─────────────────┘                                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

All of this is code we write. The external services (DataForSEO, Claude, Resend) just provide APIs we call.

---

*Document Version: 2.0*
*Last Updated: January 2026*
