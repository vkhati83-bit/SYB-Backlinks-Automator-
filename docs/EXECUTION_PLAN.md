# Execution Plan

Sergeant Claude's operational sequence for building Backlinks Gen.

---

## Phase 1: Foundation (Local Setup)

### Step 1.1: Project Initialization
- Create project folder structure
- Initialize `package.json`
- Set up TypeScript (`tsconfig.json`)
- Install core dependencies (Express, pg, ioredis, bullmq)
- Configure ESLint/Prettier
- Create `.gitignore`

**Output:** Empty but runnable Node.js/TypeScript project

### Step 1.2: Database Schema Design
- Design all tables based on APP_ARCHITECTURE.md + enhancements
- Create migration files
- Tables needed:
  - `prospects` - Target websites
  - `contacts` - Email addresses found
  - `emails` - Generated drafts
  - `sequences` - Follow-up tracking
  - `responses` - Received replies
  - `campaigns` - Group outreach efforts
  - `templates` - Email template library
  - `ab_tests` - A/B test tracking
  - `link_checks` - Backlink verification
  - `audit_log` - All actions logged
  - `blocklist` - Domains/emails to never contact
  - `settings` - App configuration

**Output:** SQL migration files ready to run

### Step 1.3: Create Railway Project
- Create new `syb-backlinks-gen` project on Railway
- Provision Postgres database
- Provision Redis instance
- Get connection strings
- Update `.env` with real values
- Run migrations on Railway Postgres

**Output:** Live database ready for use

---

## Phase 2: Core Infrastructure

### Step 2.1: Database Layer
- Create database connection pool
- Build TypeScript models/interfaces
- Create repository classes (CRUD operations)
- Test connection to both:
  - Backlinks Gen DB (read/write)
  - SEO Command Center DB (read-only)

**Output:** Working data layer

### Step 2.2: SEO Command Center Recon
- Connect to SEO Command Center database
- Explore schema (list all tables)
- Understand data structure
- Identify useful data for prospecting
- Document findings in `SEO_COMMAND_CENTER.md`

**Output:** Know exactly what SEO data we can leverage

### Step 2.3: Job Queue Setup
- Connect to Redis
- Set up BullMQ queues:
  - `prospecting` - Find websites
  - `contact-finder` - Find emails
  - `email-generator` - Write emails
  - `email-sender` - Send approved emails
  - `follow-up` - Schedule follow-ups
  - `link-checker` - Verify backlinks

**Output:** Job infrastructure ready

### Step 2.4: API Foundation
- Set up Express server
- Health check endpoint (`/health`)
- Basic middleware (CORS, JSON parsing, error handling)
- Environment config loader
- Logging setup

**Output:** API server that starts and responds

---

## Phase 3: Workers (The 8-Step Pipeline)

### Step 3.1: Prospecting Worker
- Query SEO Command Center for relevant pages
- Apply quality filters (DA, traffic, relevance)
- Calculate quality score
- Check against blocklist
- Check for duplicates
- Insert new prospects into database
- Status: `new`

**Input:** Search criteria / SEO data
**Output:** Prospects in database

### Step 3.2: Contact Finder Worker
- Take prospect from queue
- Scrape target website for contact pages
- Extract email addresses (regex + mailto:)
- Try common patterns if none found
- Validate emails (syntax, MX record)
- Assign confidence tier
- Store in `contacts` table
- Update prospect status: `contact_found`

**Input:** Prospect record
**Output:** Contact record with email

### Step 3.3: Email Generator Worker
- Take prospect+contact from queue
- Scrape target page for context
- Build Claude prompt with:
  - Page content summary
  - Contact name
  - Opportunity type (research citation / broken link)
  - SYB research database info
- Call Claude API
- Parse response (subject + body)
- Store in `emails` table
- Status: `pending_review`

**Input:** Prospect + Contact
**Output:** Email draft ready for review

### Step 3.4: Email Sender Worker
- Take approved email from queue
- Check daily send limit
- Call Resend API
- Store Resend message ID
- Create follow-up sequence record
- Update email status: `sent`
- Log to audit trail

**Input:** Approved email
**Output:** Sent email + sequence created

### Step 3.5: Follow-up Scheduler
- Cron job runs hourly
- Find sequences due for follow-up
- Check if recipient replied (skip if yes)
- Check if bounced (skip if yes)
- Generate follow-up email via Claude
- Queue for sending
- Update sequence step

**Input:** Time trigger
**Output:** Follow-up emails queued

### Step 3.6: Reply Detection
- Resend webhook endpoint
- OR: IMAP inbox monitor (every 15 min)
- Match reply to original email
- Stop follow-up sequence
- Create response record
- Flag for human review

**Input:** Incoming email
**Output:** Response record

---

## Phase 4: Dashboard (GUI)

### Step 4.1: Next.js Setup
- Initialize Next.js project (inside main project or separate folder)
- Set up Tailwind CSS
- Create basic layout
- Connect to backend API

**Output:** Empty dashboard shell

### Step 4.2: Authentication
- Simple login (admin-created accounts)
- Session management
- Role-based access (admin, reviewer)

**Output:** Secure access

### Step 4.3: Review Queue Screen
- List pending emails
- Show prospect info (domain, DA, traffic, score)
- Show email preview
- Actions: Approve / Edit / Reject
- Rejection reason capture

**Output:** Core functionality for human review

### Step 4.4: Prospects Screen
- List all prospects
- Filter by status, score, campaign
- Manual add prospect
- View details

**Output:** Prospect management

### Step 4.5: Responses Screen
- List all replies
- Show full conversation thread
- Categorize: Positive / Negative / Conditional
- Mark link as verified

**Output:** Response management

### Step 4.6: Metrics Dashboard
- Emails sent (today/week/month)
- Open rate, reply rate
- Links acquired
- Cost per link
- Funnel visualization

**Output:** Analytics visibility

### Step 4.7: Settings Screen
- Configure sender info
- Set daily limits
- Manage blocklist
- View audit log

**Output:** Admin controls

---

## Phase 5: Enhancements

### Step 5.1: A/B Testing
- Create test variants for emails
- Random assignment
- Track performance per variant
- Auto-select winner

### Step 5.2: AI Response Classification
- Claude analyzes incoming replies
- Auto-categorize
- Route appropriately

### Step 5.3: Link Verification Crawler
- Daily job checks target URLs
- Detect if backlink exists
- Check dofollow/nofollow
- Alert if link removed

### Step 5.4: Domain Health Monitor
- Track bounce rate
- Track spam complaints
- Alert on issues
- Auto-throttle if needed

### Step 5.5: Weekly Digest
- Scheduled email to Captain
- Summary of activity
- Key metrics
- Action items

---

## Phase 6: Testing & Safety

### Step 6.1: Unit Tests
- Test each worker in isolation
- Mock external APIs

### Step 6.2: Integration Tests
- Test full pipeline flow
- Use test database

### Step 6.3: Safety Verification
- Confirm all emails route to vicky@shieldyourbody.com
- Test blocklist enforcement
- Verify daily limits work
- Test duplicate prevention

### Step 6.4: Manual QA
- Captain reviews full system
- Test with real (safe) data
- Verify UI/UX

---

## Phase 7: Deployment

### Step 7.1: Prepare for Railway
- Dockerfile or Railway config
- Environment variables
- Build scripts

### Step 7.2: Deploy Backend
- Push to Railway
- Verify health checks
- Monitor logs

### Step 7.3: Deploy Dashboard
- Push Next.js to Railway
- Configure domain
- Test access

### Step 7.4: Go Live Checklist
- Remove test email override (when Captain authorizes)
- Set production send limits
- Enable all workers
- Monitor first campaign

---

## Execution Order Summary

```
PHASE 1: Foundation
  1.1 Project Init............[  ]
  1.2 Database Schema.........[  ]
  1.3 Railway Project.........[  ]

PHASE 2: Core Infrastructure
  2.1 Database Layer..........[  ]
  2.2 SEO Command Center Recon[  ]
  2.3 Job Queue Setup.........[  ]
  2.4 API Foundation..........[  ]

PHASE 3: Workers
  3.1 Prospecting Worker......[  ]
  3.2 Contact Finder Worker...[  ]
  3.3 Email Generator Worker..[  ]
  3.4 Email Sender Worker.....[  ]
  3.5 Follow-up Scheduler.....[  ]
  3.6 Reply Detection.........[  ]

PHASE 4: Dashboard
  4.1 Next.js Setup...........[  ]
  4.2 Authentication..........[  ]
  4.3 Review Queue Screen.....[  ]
  4.4 Prospects Screen........[  ]
  4.5 Responses Screen........[  ]
  4.6 Metrics Dashboard.......[  ]
  4.7 Settings Screen.........[  ]

PHASE 5: Enhancements
  5.1 A/B Testing.............[  ]
  5.2 AI Response Class.......[  ]
  5.3 Link Verification.......[  ]
  5.4 Domain Health Monitor...[  ]
  5.5 Weekly Digest...........[  ]

PHASE 6: Testing
  6.1 Unit Tests..............[  ]
  6.2 Integration Tests.......[  ]
  6.3 Safety Verification.....[  ]
  6.4 Manual QA...............[  ]

PHASE 7: Deployment
  7.1 Prepare for Railway.....[  ]
  7.2 Deploy Backend..........[  ]
  7.3 Deploy Dashboard........[  ]
  7.4 Go Live.................[  ]
```

---

## Time Allocation (Relative)

| Phase | Portion |
|-------|---------|
| Phase 1: Foundation | 10% |
| Phase 2: Infrastructure | 15% |
| Phase 3: Workers | 35% |
| Phase 4: Dashboard | 25% |
| Phase 5: Enhancements | 10% |
| Phase 6-7: Testing & Deploy | 5% |

---

*Awaiting Captain's approval to commence operations.*
