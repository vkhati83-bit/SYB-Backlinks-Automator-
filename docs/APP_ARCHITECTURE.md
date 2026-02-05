# Backlink Automation App - Technical Architecture

**Date:** January 2026
**Status:** Technical Specification

---

## Scope

**Building now:**
- Research citation outreach
- Broken link outreach

**Primary asset being pitched:**
- **shieldyourbody.com/research** - Database of 3,600+ peer-reviewed scientific studies on EMF and health

**Future:**
- Guest post outreach

---

## Overview

A pipeline that finds pages discussing EMF/radiation topics, discovers contacts, generates personalized emails pitching our research database, and manages the outreach lifecycle.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DATA FLOW                                       │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
  │  FIND    │───▶│  FIND    │───▶│ GENERATE │───▶│  HUMAN   │───▶│   SEND   │
  │ PROSPECTS│    │ CONTACTS │    │  EMAILS  │    │  REVIEW  │    │ & TRACK  │
  └──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
       │               │               │               │               │
       ▼               ▼               ▼               ▼               ▼
  DataForSEO      Scraping +      Claude API      Dashboard        Resend
                  Validation                                     + Webhooks
```

---

## 1. Database Schema

### Core Tables

```sql
-- Websites we want to get backlinks from
CREATE TABLE prospects (
    id              UUID PRIMARY KEY,
    domain          VARCHAR(255) NOT NULL UNIQUE,
    url             TEXT,                          -- specific page URL if applicable

    -- Classification
    opportunity_type VARCHAR(50),                  -- 'research_citation', 'broken_link'
    source          VARCHAR(50),                   -- 'serp_search', 'broken_link_finder', 'manual'

    -- Quality metrics (from DataForSEO)
    domain_authority INT,
    monthly_traffic  INT,
    spam_score       INT,
    relevance_score  INT,                          -- calculated based on niche match

    -- For broken link opportunities
    broken_link_url  TEXT,
    broken_link_anchor TEXT,

    -- Status tracking
    status          VARCHAR(50) DEFAULT 'new',     -- 'new', 'contact_found', 'email_drafted',
                                                   -- 'email_sent', 'replied', 'placed', 'rejected', 'dead'

    -- Metadata
    notes           TEXT,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

-- Contact information for each prospect
CREATE TABLE contacts (
    id              UUID PRIMARY KEY,
    prospect_id     UUID REFERENCES prospects(id),

    email           VARCHAR(255) NOT NULL,
    name            VARCHAR(255),
    role            VARCHAR(100),                  -- 'editor', 'webmaster', 'owner', etc.

    -- Validation
    email_validated BOOLEAN DEFAULT FALSE,
    validation_date TIMESTAMP,
    source          VARCHAR(50),                   -- 'scraped', 'pattern_match', 'manual'
    confidence      INT,                           -- 1-100 confidence score

    created_at      TIMESTAMP DEFAULT NOW()
);

-- Email drafts and sent emails
CREATE TABLE emails (
    id              UUID PRIMARY KEY,
    prospect_id     UUID REFERENCES prospects(id),
    contact_id      UUID REFERENCES contacts(id),

    -- Content
    subject         TEXT NOT NULL,
    body            TEXT NOT NULL,
    email_type      VARCHAR(50),                   -- 'initial', 'followup_1', 'followup_2'

    -- Review status
    review_status   VARCHAR(50) DEFAULT 'pending', -- 'pending', 'approved', 'edited', 'rejected'
    reviewed_by     VARCHAR(100),
    reviewed_at     TIMESTAMP,
    rejection_reason TEXT,

    -- Sending status
    send_status     VARCHAR(50),                   -- 'queued', 'sent', 'delivered', 'bounced', 'failed'
    resend_id       VARCHAR(255),                  -- Resend's email ID
    sent_at         TIMESTAMP,

    -- Engagement (from Resend webhooks)
    opened          BOOLEAN DEFAULT FALSE,
    opened_at       TIMESTAMP,
    clicked         BOOLEAN DEFAULT FALSE,

    created_at      TIMESTAMP DEFAULT NOW()
);

-- Track follow-up sequences
CREATE TABLE sequences (
    id              UUID PRIMARY KEY,
    prospect_id     UUID REFERENCES prospects(id),

    status          VARCHAR(50) DEFAULT 'active',  -- 'active', 'paused', 'completed', 'replied'

    -- Scheduling
    initial_sent_at TIMESTAMP,
    followup_1_due  TIMESTAMP,
    followup_1_sent TIMESTAMP,
    followup_2_due  TIMESTAMP,
    followup_2_sent TIMESTAMP,

    -- Outcome
    reply_received  BOOLEAN DEFAULT FALSE,
    reply_date      TIMESTAMP,
    final_status    VARCHAR(50),                   -- 'positive', 'negative', 'no_response'

    created_at      TIMESTAMP DEFAULT NOW()
);

-- Track responses and outcomes
CREATE TABLE responses (
    id              UUID PRIMARY KEY,
    prospect_id     UUID REFERENCES prospects(id),
    email_id        UUID REFERENCES emails(id),

    response_type   VARCHAR(50),                   -- 'positive', 'negative', 'conditional', 'unsubscribe'
    response_text   TEXT,
    received_at     TIMESTAMP,

    -- Follow-up tracking
    requires_action BOOLEAN DEFAULT TRUE,
    action_taken    TEXT,
    action_date     TIMESTAMP,
    handled_by      VARCHAR(100),

    -- Outcome
    link_placed     BOOLEAN DEFAULT FALSE,
    link_url        TEXT,
    link_verified   BOOLEAN DEFAULT FALSE,

    created_at      TIMESTAMP DEFAULT NOW()
);

-- Note: We're pitching a single asset (shieldyourbody.com/research)
-- so no content_assets table needed. The research database URL is hardcoded in the email generation prompts.

-- Indexes for performance
CREATE INDEX idx_prospects_status ON prospects(status);
CREATE INDEX idx_prospects_domain ON prospects(domain);
CREATE INDEX idx_emails_review_status ON emails(review_status);
CREATE INDEX idx_emails_send_status ON emails(send_status);
CREATE INDEX idx_sequences_status ON sequences(status);
CREATE INDEX idx_sequences_followup_due ON sequences(followup_1_due, followup_2_due);
```

---

## 2. Application Components

### 2.1 Prospecting Worker

**Purpose:** Find websites that could link to SYB

**Trigger:** Scheduled (daily) or manual

**Process:**

```
┌─────────────────────────────────────────────────────────────────┐
│                    PROSPECTING WORKER                            │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
     ┌───────────────┐               ┌───────────────┐
     │    SERP       │               │   BROKEN      │
     │   SEARCH      │               │    LINK       │
     │ (EMF topics)  │               │   FINDER      │
     └───────────────┘               └───────────────┘
              │                               │
              ▼                               ▼
         DataForSEO                      DataForSEO
         SERP API                        Backlinks API
              │                               │
              └───────────────┬───────────────┘
                              ▼
                    ┌───────────────┐
                    │   FILTER &    │
                    │    SCORE      │
                    └───────────────┘
                              │
                              ▼
                    ┌───────────────┐
                    │  DEDUPLICATE  │
                    └───────────────┘
                              │
                              ▼
                    ┌───────────────┐
                    │ SAVE TO DB    │
                    └───────────────┘
```

**Methods:**

1. **SERP Search (Pages Discussing EMF Topics)**
   - Search queries like:
     - `"EMF exposure health effects"`
     - `"cell phone radiation dangers"`
     - `"5G health risks"`
     - `"WiFi radiation health"`
     - `"electromagnetic radiation studies"`
   - Parse SERP results
   - Extract relevant URLs
   - These are pages that could benefit from citing our research

2. **Broken Link Finding**
   - Get backlinks pointing to competitor EMF/health sites
   - Check for 404 status
   - Flag as broken link opportunity

**Quality Filters:**

```javascript
const qualityFilters = {
    minDomainAuthority: 20,
    maxSpamScore: 30,
    minMonthlyTraffic: 1000,
    relevantTopics: [
        'emf', 'radiation', '5g', 'cell phone', 'wifi',
        'electromagnetic', 'health effects', 'wireless'
    ],
    excludeDomains: [
        // spam domains, competitors, already contacted
    ]
};
```

---

### 2.2 Contact Finder Worker

**Purpose:** Find email addresses for prospects

**Trigger:** When prospect status = 'new'

**Process:**

```
┌─────────────────────────────────────────────────────────────────┐
│                    CONTACT FINDER WORKER                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌───────────────┐
                    │ FETCH PAGES   │
                    │ /contact      │
                    │ /about        │
                    │ /write-for-us │
                    └───────────────┘
                              │
                              ▼
                    ┌───────────────┐
                    │ EXTRACT       │
                    │ EMAILS        │
                    │ (regex, mailto)│
                    └───────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
        Found Email?                    No Email Found
              │                               │
              ▼                               ▼
    ┌───────────────┐               ┌───────────────┐
    │   VALIDATE    │               │ TRY PATTERNS  │
    │   - Syntax    │               │ editor@       │
    │   - MX record │               │ contact@      │
    │   - Disposable│               │ info@         │
    └───────────────┘               └───────────────┘
              │                               │
              └───────────────┬───────────────┘
                              ▼
                    ┌───────────────┐
                    │ SAVE CONTACT  │
                    │ Update status │
                    └───────────────┘
```

**Email Extraction:**

```javascript
// 1. Scrape common pages
const pagesToScrape = [
    `${domain}/contact`,
    `${domain}/contact-us`,
    `${domain}/about`,
    `${domain}/about-us`
];

// 2. Extract emails via regex
const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// 3. Extract from mailto: links
const mailtoRegex = /mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;

// 4. Try common patterns if nothing found
const commonPatterns = [
    'editor@',
    'contact@',
    'info@',
    'hello@',
    'admin@',
    'webmaster@'
];
```

**Validation:**

```javascript
async function validateEmail(email) {
    // 1. Syntax check
    if (!isValidEmailFormat(email)) return { valid: false, reason: 'invalid_format' };

    // 2. Check MX records
    const hasMX = await checkMXRecords(email.split('@')[1]);
    if (!hasMX) return { valid: false, reason: 'no_mx_record' };

    // 3. Check against disposable email list
    if (isDisposableEmail(email)) return { valid: false, reason: 'disposable' };

    return { valid: true, confidence: calculateConfidence(email, source) };
}
```

---

### 2.3 Email Generator Worker

**Purpose:** Generate personalized outreach emails using Claude

**Trigger:** When prospect has validated contact

**Process:**

```
┌─────────────────────────────────────────────────────────────────┐
│                   EMAIL GENERATOR WORKER                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌───────────────┐
                    │ SCRAPE TARGET │
                    │ PAGE FOR      │
                    │ CONTEXT       │
                    └───────────────┘
                              │
                              ▼
                    ┌───────────────┐
                    │ BUILD PROMPT  │
                    │ WITH CONTEXT  │
                    └───────────────┘
                              │
                              ▼
                    ┌───────────────┐
                    │  CLAUDE API   │
                    │  (Sonnet/     │
                    │   Haiku)      │
                    └───────────────┘
                              │
                              ▼
                    ┌───────────────┐
                    │ SAVE DRAFT    │
                    │ status:pending│
                    └───────────────┘
```

**Prompt Structure:**

```javascript
const systemPrompt = `You are an outreach specialist for ShieldYourBody. We have a research
database at shieldyourbody.com/research containing 3,600+ peer-reviewed scientific studies
on EMF and health effects.

Write personalized outreach emails that:
- Sound human and genuine, not templated
- Reference something specific from their article/page
- Position the research database as a credible source that adds value to their content
- Are concise (under 150 words)
- Have a clear, non-pushy call to action

Return JSON with "subject" and "body" fields.`;

// For research citation outreach
const researchCitationPrompt = `
OUTREACH TYPE: research_citation

TARGET WEBSITE: ${domain}
TARGET PAGE: ${pageUrl}
PAGE CONTENT SUMMARY: ${pageContentSummary}
CONTACT NAME: ${contactName || 'there'}

Write a personalized email pitching our research database (shieldyourbody.com/research)
as a credible source they could link to.
`;

// For broken link outreach
const brokenLinkPrompt = `
OUTREACH TYPE: broken_link

TARGET WEBSITE: ${domain}
TARGET PAGE: ${pageUrl}
PAGE CONTENT SUMMARY: ${pageContentSummary}
CONTACT NAME: ${contactName || 'there'}

BROKEN LINK DETAILS:
- Dead URL: ${brokenLinkUrl}
- Anchor text: ${brokenLinkAnchor}

Write a personalized email noting the broken link and suggesting our research database
(shieldyourbody.com/research) as a replacement.
`;
```

**Template Variations by Type:**

| Type | Angle | Key Elements |
|------|-------|--------------|
| Research Citation | Offer credible source | Reference their content, pitch research database as valuable addition |
| Broken Link | Helpful notification | Point out broken link, offer research database as replacement |

---

### 2.4 Review Dashboard (Frontend)

**Purpose:** Human review queue for email approval

**Tech:** Next.js on Vercel

**Screens:**

```
┌─────────────────────────────────────────────────────────────────┐
│                      REVIEW DASHBOARD                            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  NAVIGATION                                                      │
│  [Review Queue (24)] [Pipeline] [Responses (3)] [Metrics]       │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  REVIEW QUEUE                                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ healthmaven.com                    Research Citation     │    │
│  │ DA: 45  |  Traffic: 12K  |  Contact: sarah@healthmaven  │    │
│  │                                                          │    │
│  │ Subject: Research resource for your cell phone article   │    │
│  │ ─────────────────────────────────────────────────────── │    │
│  │ Hi Sarah,                                                │    │
│  │                                                          │    │
│  │ I came across your article on cell phone radiation -    │    │
│  │ you did a nice job breaking down a complex topic...      │    │
│  │                                                          │    │
│  │ [View Full Email]  [View Their Site]                     │    │
│  │                                                          │    │
│  │ [✓ Approve]  [✎ Edit]  [✗ Reject ▼]                     │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ techsafety.org                             Broken Link   │    │
│  │ DA: 38  |  Traffic: 8K  |  Contact: info@techsafety     │    │
│  │ Dead link: defunctsite.com/emf-studies                   │    │
│  │ ...                                                      │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Features:**
- Email preview with full context
- One-click approve
- Inline editing before approval
- Rejection with reason (feeds back to improve AI)
- Bulk actions for similar emails
- Quick link to target website

---

### 2.5 Send Worker

**Purpose:** Send approved emails via Resend

**Trigger:** When email review_status = 'approved'

**Process:**

```javascript
async function sendEmail(email) {
    // 1. Check daily sending limits
    const sentToday = await getSentCountToday();
    if (sentToday >= DAILY_LIMIT) {
        return { queued: true, reason: 'daily_limit_reached' };
    }

    // 2. Send via Resend
    const result = await resend.emails.send({
        from: 'outreach@mail.shieldyourbody.com',
        to: email.contact.email,
        subject: email.subject,
        html: formatEmailHtml(email.body),
        headers: {
            'X-Entity-Ref-ID': email.id  // for tracking
        }
    });

    // 3. Update database
    await updateEmail(email.id, {
        send_status: 'sent',
        resend_id: result.id,
        sent_at: new Date()
    });

    // 4. Create sequence for follow-ups
    await createSequence(email.prospect_id, {
        initial_sent_at: new Date(),
        followup_1_due: addDays(new Date(), 4),
        followup_2_due: addDays(new Date(), 8)
    });

    return { sent: true, resend_id: result.id };
}
```

**Sending Limits:**

| Phase | Daily Limit | Notes |
|-------|-------------|-------|
| Week 1-2 | 20/day | Domain warm-up |
| Week 3-4 | 50/day | Gradual increase |
| Week 5+ | 100/day | Full operation |

---

### 2.6 Follow-up Scheduler

**Purpose:** Send follow-up emails if no response

**Trigger:** Scheduled job (runs hourly)

**Process:**

```javascript
async function processFollowups() {
    const now = new Date();

    // Find sequences due for follow-up
    const dueFollowups = await db.sequences.findMany({
        where: {
            status: 'active',
            reply_received: false,
            OR: [
                { followup_1_due: { lte: now }, followup_1_sent: null },
                { followup_2_due: { lte: now }, followup_2_sent: null }
            ]
        }
    });

    for (const sequence of dueFollowups) {
        // Determine which follow-up
        const followupNumber = sequence.followup_1_sent ? 2 : 1;

        // Generate follow-up email
        const followupEmail = await generateFollowup(sequence, followupNumber);

        // Queue for review or auto-send based on confidence
        await queueEmail(followupEmail, {
            autoSend: followupNumber === 1 && sequence.initial_email_approved
        });
    }
}
```

**Follow-up Templates:**

```javascript
const followupTemplates = {
    1: {
        delay: 4, // days
        subject: "Re: {original_subject}",
        prompt: "Write a brief, friendly follow-up. Reference the original email. Keep it under 50 words."
    },
    2: {
        delay: 8, // days after initial
        subject: "Re: {original_subject}",
        prompt: "Write a final follow-up. Acknowledge they're busy. Offer clear value. Keep it under 40 words."
    }
};
```

---

### 2.7 Webhook Handler

**Purpose:** Process Resend webhook events

**Endpoint:** `POST /api/webhooks/resend`

**Events Handled:**

```javascript
app.post('/api/webhooks/resend', async (req, res) => {
    const event = req.body;

    switch (event.type) {
        case 'email.delivered':
            await updateEmail(event.data.email_id, {
                send_status: 'delivered'
            });
            break;

        case 'email.opened':
            await updateEmail(event.data.email_id, {
                opened: true,
                opened_at: new Date(event.data.timestamp)
            });
            break;

        case 'email.bounced':
            await handleBounce(event.data);
            break;

        case 'email.complained':
            await handleComplaint(event.data);
            break;
    }

    res.status(200).send('OK');
});

async function handleBounce(data) {
    // Mark email as bounced
    await updateEmail(data.email_id, { send_status: 'bounced' });

    // Mark contact as invalid
    await updateContact(data.contact_id, { email_validated: false });

    // Stop sequence
    await updateSequence(data.prospect_id, { status: 'completed', final_status: 'bounced' });
}
```

---

### 2.8 Reply Detection

**Purpose:** Detect when prospects reply

**Options:**

1. **Webhook-based (if Resend supports)**
   - Resend notifies on reply
   - Immediate detection

2. **Inbox Monitoring**
   - Check reply-to inbox periodically
   - Parse for matching threads
   - Extract and categorize

```javascript
async function checkForReplies() {
    // Connect to inbox (IMAP or API)
    const emails = await fetchNewEmails('outreach@mail.shieldyourbody.com');

    for (const email of emails) {
        // Match to original outreach
        const originalEmail = await matchToOutreach(email);

        if (originalEmail) {
            // Stop follow-up sequence
            await updateSequence(originalEmail.prospect_id, {
                status: 'replied',
                reply_received: true,
                reply_date: new Date()
            });

            // Create response record
            await createResponse({
                prospect_id: originalEmail.prospect_id,
                email_id: originalEmail.id,
                response_text: email.body,
                received_at: email.date
            });

            // Notify team
            await notifyTeam('New reply', originalEmail.prospect_id);
        }
    }
}
```

---

## 3. API Endpoints

### Backend API (Railway)

```
# Prospects
GET    /api/prospects              # List prospects with filters
GET    /api/prospects/:id          # Get single prospect
POST   /api/prospects              # Manual add prospect
PATCH  /api/prospects/:id          # Update prospect
DELETE /api/prospects/:id          # Remove prospect

# Emails
GET    /api/emails                 # List emails (filter by status)
GET    /api/emails/pending         # Get pending review queue
GET    /api/emails/:id             # Get single email
PATCH  /api/emails/:id             # Update email (edit content)
POST   /api/emails/:id/approve     # Approve email
POST   /api/emails/:id/reject      # Reject email with reason

# Responses
GET    /api/responses              # List responses
GET    /api/responses/pending      # Get responses needing action
PATCH  /api/responses/:id          # Update response (mark handled)

# Metrics
GET    /api/metrics/overview       # Dashboard stats
GET    /api/metrics/funnel         # Pipeline conversion rates
GET    /api/metrics/performance    # Email performance over time

# Webhooks
POST   /api/webhooks/resend        # Resend webhook receiver

# Jobs (manual triggers)
POST   /api/jobs/prospect          # Trigger prospecting run
POST   /api/jobs/find-contacts     # Trigger contact finding
POST   /api/jobs/generate-emails   # Trigger email generation
```

---

## 4. Job Queue Architecture

Using BullMQ (Redis-based) for job management:

```
┌─────────────────────────────────────────────────────────────────┐
│                        JOB QUEUES                                │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   prospecting   │  │ contact-finder  │  │ email-generator │
│      queue      │  │     queue       │  │     queue       │
│                 │  │                 │  │                 │
│ Schedule: daily │  │ Trigger: new    │  │ Trigger: contact│
│ or manual       │  │ prospect        │  │ found           │
└─────────────────┘  └─────────────────┘  └─────────────────┘

┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   send-email    │  │   followup      │  │  reply-check    │
│     queue       │  │    queue        │  │    queue        │
│                 │  │                 │  │                 │
│ Trigger: email  │  │ Schedule: hourly│  │ Schedule: 15min │
│ approved        │  │                 │  │                 │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

**Job Flow:**

```javascript
// When prospecting completes, queue contact finding
prospectingQueue.on('completed', async (job, result) => {
    for (const prospect of result.newProspects) {
        await contactFinderQueue.add('find-contact', {
            prospectId: prospect.id
        });
    }
});

// When contact found, queue email generation
contactFinderQueue.on('completed', async (job, result) => {
    if (result.contactFound) {
        await emailGeneratorQueue.add('generate-email', {
            prospectId: job.data.prospectId,
            contactId: result.contactId
        });
    }
});

// When email approved (via dashboard), queue sending
// This is triggered by the API endpoint, not a queue event
```

---

## 5. Environment Configuration

```env
# Database
DATABASE_URL=postgresql://user:pass@host:5432/backlinks

# Resend
RESEND_API_KEY=re_xxxxx
RESEND_WEBHOOK_SECRET=whsec_xxxxx
OUTREACH_FROM_EMAIL=outreach@mail.shieldyourbody.com

# Claude API
ANTHROPIC_API_KEY=sk-ant-xxxxx
CLAUDE_MODEL=claude-sonnet-4-5-20241022  # or claude-haiku for budget

# DataForSEO
DATAFORSEO_LOGIN=xxxxx
DATAFORSEO_PASSWORD=xxxxx

# Redis (for job queues)
REDIS_URL=redis://host:6379

# App
DAILY_SEND_LIMIT=50
FOLLOWUP_1_DELAY_DAYS=4
FOLLOWUP_2_DELAY_DAYS=8
```

---

## 6. Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         RAILWAY                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   API       │  │   Worker    │  │  PostgreSQL │             │
│  │   Server    │  │   Process   │  │  Database   │             │
│  │             │  │             │  │             │             │
│  │  Express/   │  │  BullMQ     │  │  prospects  │             │
│  │  Fastify    │  │  consumers  │  │  contacts   │             │
│  │             │  │             │  │  emails     │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│         │                │                │                     │
│         └────────────────┴────────────────┘                     │
│                          │                                      │
└──────────────────────────┼──────────────────────────────────────┘
                           │
                           │ Internal network
                           │
┌──────────────────────────┼──────────────────────────────────────┐
│                         VERCEL                                   │
├──────────────────────────┼──────────────────────────────────────┤
│                          │                                      │
│  ┌───────────────────────┴───────────────────────┐             │
│  │              Next.js Dashboard                 │             │
│  │                                                │             │
│  │  • Review queue UI                            │             │
│  │  • Pipeline visualization                     │             │
│  │  • Response management                        │             │
│  │  • Metrics & reporting                        │             │
│  └────────────────────────────────────────────────┘             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Metrics & Reporting

### Key Metrics

| Metric | Calculation | Target |
|--------|-------------|--------|
| Open Rate | Opened / Delivered | > 40% |
| Reply Rate | Replies / Delivered | > 5% |
| Positive Rate | Positive Replies / Total Replies | > 30% |
| Placement Rate | Links Placed / Positive Replies | > 50% |
| Cost per Link | Monthly Cost / Links Placed | < $10 |

### Dashboard Views

1. **Overview**
   - Emails in queue
   - Sent this week/month
   - Response rate trend
   - Links placed

2. **Funnel**
   - Prospects → Contacts → Emails Sent → Opened → Replied → Placed

3. **Performance**
   - By outreach type (research citation vs broken link)
   - By topic/niche
   - Over time

---

## 8. Future Enhancements

| Enhancement | Description | Priority |
|-------------|-------------|----------|
| Guest post outreach | Add support for pitching guest articles | High |
| Auto-categorize replies | Use Claude to classify response sentiment | High |
| A/B testing | Test subject lines, templates | Medium |
| Domain warm-up automation | Gradual send increase | Medium |
| CRM integration | Sync with HubSpot/etc | Low |
| Chrome extension | Quick-add prospects while browsing | Low |

---

*Document Version: 1.0*
*Last Updated: January 2026*
