# SYB Backlinks Generator - Project Rubric

**Version:** 1.0
**Last Updated:** 2026-02-03
**Status:** Active Development

This document defines all requirements, standards, and evaluation criteria for the SYB Backlinks Generator project.

---

## 1. Project Scope & Goals

### What We're Building
- **Primary Goal:** Automated backlink outreach system for ShieldYourBody.com
- **Asset Being Pitched:** shieldyourbody.com/research (3,600+ peer-reviewed EMF studies)
- **Outreach Types (Current):**
  - Research citation outreach
  - Broken link outreach
- **Outreach Types (Future):** Guest post outreach
- **Automation Level:** Human review before sending (initially)

### Success Criteria
| Metric | Target | Notes |
|--------|--------|-------|
| Open Rate | > 40% | Industry standard is 20-30% |
| Reply Rate | > 5% | Cold outreach baseline |
| Positive Reply Rate | > 30% | Of all replies |
| Placement Rate | > 50% | Of positive replies |
| Cost Per Link | < $10 | All-in cost |
| Links Acquired | 10-20/month | Initial target |

---

## 2. Prospect Quality Rubric

### Minimum Requirements (Must Pass ALL)
| Criterion | Minimum | Why |
|-----------|---------|-----|
| Domain Authority | ≥ 20 | Low authority sites don't move the needle |
| Monthly Traffic | ≥ 1,000 | Low traffic = low value |
| Spam Score | ≤ 30 | High spam = risk to our sending reputation |
| Language | English | We only do English outreach |
| Not on Blocklist | Must pass | Never contact competitors, unsubscribed, etc. |

### Quality Score Formula
```
Quality Score = (DA × 0.3) + (Normalized_Traffic × 0.2) + (Relevance × 0.3) + (Freshness × 0.2)

Where:
- DA = Domain Authority (0-100)
- Normalized_Traffic = min(Traffic / 10000, 100)
- Relevance = Topic match score (0-100, based on keyword presence)
- Freshness = Page age score (0-100, newer = higher)
```

### Priority Tiers
| Tier | Score Range | Action |
|------|-------------|--------|
| Tier A | 70-100 | Priority prospects - contact first |
| Tier B | 50-69 | Good prospects - standard queue |
| Tier C | 30-49 | Marginal prospects - low priority |
| Tier D | < 30 | Reject - don't waste resources |

### Relevance Scoring
**High Relevance (80-100 points):**
- Page explicitly discusses EMF health effects
- Contains keywords: EMF, radiation, 5G, cell phone safety
- Target audience: health-conscious consumers or medical professionals

**Medium Relevance (50-79 points):**
- Page discusses related topics (general health, technology safety)
- Mentions EMF tangentially
- Target audience: general tech or wellness

**Low Relevance (< 50 points):**
- Barely related to EMF/health
- Wrong audience (e.g., electrical engineering)

---

## 3. Contact Quality Standards

### Confidence Tiers
| Tier | Source | Confidence | Send Priority | Example |
|------|--------|------------|---------------|---------|
| **A** | Scraped from page | 90-100% | High | sarah@healthmaven.com (found on /contact) |
| **B** | Author byline | 70-89% | High | Found in article byline with name |
| **C** | Pattern match | 40-69% | Medium | editor@domain.com (common pattern) |
| **D** | Generic fallback | 20-39% | Low | info@domain.com, contact@domain.com |

### Email Validation Requirements (All Tiers)
- Valid email format (RFC 5322)
- Domain has MX records
- Not a disposable email service
- Not on global email blocklist

### Contact Discovery Standards
**Must attempt to scrape these pages (in order):**
1. `/contact`
2. `/contact-us`
3. `/about`
4. `/about-us`
5. `/write-for-us`
6. `/contribute`

**If no email found, try these patterns:**
1. `editor@domain.com`
2. `contact@domain.com`
3. `info@domain.com`
4. `hello@domain.com`
5. `admin@domain.com`

---

## 4. Email Quality Standards

### Subject Line Requirements
| Criterion | Standard |
|-----------|----------|
| Length | 40-70 characters |
| Tone | Professional, helpful |
| Personalization | Reference their site or content |
| Clarity | Clear value proposition |
| No spam triggers | No "Free!", "Act Now!", ALL CAPS |

### Email Body Requirements
| Criterion | Standard |
|-----------|----------|
| Length | 100-150 words (body only, excluding signature) |
| Personalization | MUST reference something specific from their page |
| Tone | Human, genuine, non-salesy |
| Value proposition | Clear benefit for the recipient |
| Call to action | Soft, non-pushy ask |
| Grammar | Perfect - no typos or errors |

### Email Structure
**Required elements:**
1. Personalized greeting (use their name if found)
2. Specific reference to their content
3. Clear explanation of our research database value
4. Soft call to action
5. Professional signature

**Forbidden elements:**
- Generic templates ("Dear Webmaster")
- Obvious copy-paste
- Aggressive sales language
- Multiple CTAs (keep it simple)
- Links other than shieldyourbody.com/research

### Email Type Standards

#### Research Citation Email
- Reference specific article/page
- Position research database as credible source
- Emphasize peer-reviewed nature (3,600+ studies)
- Suggest as valuable resource for their readers

#### Broken Link Email
- Point out the broken link specifically
- Provide exact URL that's broken
- Offer research database as helpful replacement
- Tone: helpful notification, not sales pitch

---

## 5. System Requirements

### Core Features (Must Have)
- [ ] Prospect discovery from SEO Command Center
- [ ] Broken link detection for competitors
- [ ] Contact information scraping
- [ ] AI-generated personalized emails
- [ ] Human review queue
- [ ] Email approval/rejection workflow
- [ ] Email sending via Resend
- [ ] Automatic follow-up sequences
- [ ] Response detection and tracking
- [ ] Basic metrics dashboard

### Pipeline Flow (Must Work)
```
Prospects → Contacts Found → Emails Drafted → Human Review → Sent → Follow-ups → Responses
```

Each step must:
- Complete automatically (except human review)
- Handle failures gracefully
- Log all actions
- Trigger next step when ready

### Data Integrity (Must Enforce)
- No duplicate prospects (same domain)
- No duplicate contacts (same email per prospect)
- No sending to blocklisted domains/emails
- No sending without human approval
- No exceeding daily send limits

---

## 6. Safety & Compliance Requirements

### Email Safety (CRITICAL)
| Requirement | Implementation | Status |
|-------------|----------------|--------|
| Test mode | All emails redirect to internal address | Required for dev/testing |
| Production mode | Require explicit enablement | Only after approval |
| Blocklist enforcement | Check before every send | Always active |
| Daily send limits | Enforce at send time | Configurable |
| Unsubscribe handling | Stop all sequences immediately | Auto-process |
| Bounce handling | Mark contact invalid, stop sequence | Auto-process |

### Domain Warm-up Protocol
| Week | Max Daily Sends | Notes |
|------|-----------------|-------|
| 1-2 | 20 | Initial warm-up |
| 3-4 | 50 | Gradual increase |
| 5+ | 100 | Full operation |

**Rules:**
- Never skip warm-up phase
- Monitor bounce rate (alert if > 5%)
- Monitor spam complaints (alert if > 0.1%)
- Auto-throttle if metrics decline

### Data Protection
- Never commit `.env` files
- Never log email addresses in plain text
- Never store passwords (use API keys)
- Implement audit trail for all actions

---

## 7. Technical Standards

### Tech Stack (Decided)
| Component | Technology | Version | Notes |
|-----------|------------|---------|-------|
| Backend | Node.js + Express + TypeScript | Latest LTS | |
| Frontend | Next.js 14 + React + Tailwind | 14.x | |
| Database | PostgreSQL | Latest | Railway hosted |
| Queue | Redis + BullMQ | Latest | Railway hosted |
| AI | Claude API (Anthropic) | Sonnet 4.5 | Configurable to Haiku |
| Email | Resend | Latest | Already have account |
| SEO Data | DataForSEO | N/A | Read-only access |

### Code Quality Standards
- TypeScript strict mode enabled
- No `any` types (use proper typing)
- ESLint rules enforced
- All workers must have error handling
- All API endpoints must validate input
- All database queries must use parameterized queries (SQL injection prevention)

### Performance Standards
| Metric | Target |
|--------|--------|
| API response time | < 500ms (p95) |
| Email generation time | < 10s per email |
| Contact scraping time | < 30s per prospect |
| Dashboard load time | < 2s |

---

## 8. Feature Completeness Checklist

### Phase 1: Core Pipeline (REQUIRED)
- [x] Database schema with all tables
- [x] Backend API server running
- [x] SEO Command Center integration
- [x] Prospect discovery (research citation)
- [x] Broken link detection
- [x] Article matching for broken links
- [ ] Contact finder worker (automated)
- [x] Email generator using Claude
- [ ] Review queue dashboard
- [ ] Email approval workflow
- [ ] Email sending via Resend
- [ ] Follow-up sequences
- [ ] Response tracking
- [ ] Basic metrics

### Phase 2: Enhancements (NICE TO HAVE)
- [ ] A/B testing for subject lines
- [ ] AI response classification
- [ ] Link verification crawler
- [ ] Domain health monitoring
- [ ] Send time optimization
- [ ] Weekly digest reports
- [ ] Slack notifications

### Phase 3: Advanced (FUTURE)
- [ ] Guest post outreach type
- [ ] AI learning loop (feedback integration)
- [ ] CRM integration
- [ ] Chrome extension for manual prospect adds

---

## 9. Email Template Standards

### Research Citation Template Pattern
**Structure:**
1. Personalized greeting
2. Compliment on their content (specific)
3. Introduce research database
4. Explain value (credible, peer-reviewed, 3,600+ studies)
5. Soft CTA (might be helpful for your readers)
6. Friendly sign-off

**Example:**
```
Subject: Research resource for your [specific topic] article

Hi [Name],

I came across your article on [specific topic] - [specific compliment].

I wanted to share a resource that might be useful: we've compiled a database
of 3,600+ peer-reviewed studies on EMF and health at shieldyourbody.com/research.
It's searchable by topic and all studies are from scientific journals.

Might be a helpful reference to link to for readers who want to dig deeper into
the research.

Best,
[Sender]
```

### Broken Link Template Pattern
**Structure:**
1. Personalized greeting
2. Mention reading their page
3. Point out the broken link (specific URL)
4. Offer research database as replacement
5. Emphasize helpfulness (not just sales)
6. Friendly sign-off

**Example:**
```
Subject: Broken link on your [page topic] guide

Hi [Name],

I was reading your [page topic] guide and noticed the link to "[anchor text]"
at [broken URL] is no longer working.

We have a research database at shieldyourbody.com/research with 3,600+
peer-reviewed studies on EMF and health - might work as a replacement since
it covers similar ground.

Either way, wanted to give you a heads up about the dead link!

Best,
[Sender]
```

### Follow-up Email Standards

**Follow-up #1 (Day 4):**
- Length: < 50 words
- Tone: Friendly bump, not pushy
- Reference original email briefly

**Follow-up #2 (Day 8):**
- Length: < 40 words
- Tone: Final touch, acknowledge they're busy
- Offer value one last time

**Never:**
- Send more than 2 follow-ups
- Send if they replied
- Send if email bounced
- Send if they unsubscribed

---

## 10. Dashboard Requirements

### Review Queue Screen (CRITICAL)
**Must display:**
- Prospect domain + URL
- Domain metrics (DA, Traffic, Spam Score)
- Contact email + name
- Email subject + body preview
- Opportunity type badge
- Links to visit their site

**Must support:**
- Approve button (one-click)
- Edit button (inline editing)
- Reject button (with reason dropdown)
- Bulk actions (approve/reject multiple)

### Metrics Screen
**Must show:**
- Emails sent (today/week/month)
- Open rate, reply rate
- Positive replies count
- Links placed count
- Cost per link
- Pipeline funnel visualization
- Breakdown by outreach type

### Settings Screen
**Must allow configuration of:**
- Sender name, email, reply-to
- Email signature
- Claude model selection (Sonnet/Haiku)
- Daily send limits
- Follow-up timing (days between)
- Competitor domains (for broken link detection)
- Blocklist (domains + keywords)

---

## 11. Data Source Standards

### SEO Command Center Integration
**Requirements:**
- Read-only access (never write to SEO DB)
- Use existing article data for matching
- Query optimization (no full table scans)
- Error handling for connection failures

### DataForSEO API Usage
**Standards:**
- Cache results to avoid duplicate API calls
- Respect API rate limits
- Log all API calls for cost tracking
- Handle API errors gracefully

**Endpoints Used:**
- SERP data for research citations
- Backlinks data for broken link detection

---

## 12. Queue & Worker Standards

### Job Queue Requirements
**Must have these queues:**
1. `prospecting` - Find websites
2. `find-contacts` - Scrape for emails
3. `generate-emails` - Claude email generation
4. `send-email` - Resend API calls
5. `followup` - Scheduled follow-ups
6. `check-responses` - Reply detection

### Worker Behavior Standards
**Every worker must:**
- Have retry logic (3 attempts with backoff)
- Log errors with full context
- Update database status on success/failure
- Trigger next step in pipeline
- Handle graceful shutdown
- Report progress/metrics

### Error Handling
- Network errors: Retry with exponential backoff
- Validation errors: Log and skip (don't retry)
- API errors: Check rate limits, retry if appropriate
- Database errors: Log, alert, manual intervention

---

## 13. Security & Privacy Requirements

### Credentials Management
- All API keys in environment variables
- Never commit `.env` files
- Never log API keys or passwords
- Use separate keys for dev/production

### Email Address Protection
- Check blocklist before every send
- Honor unsubscribe requests immediately
- Remove bounced emails from rotation
- Strip www prefix from email domains

### Audit Trail
**Must log:**
- Who approved which emails
- When emails were sent
- What changes were made to drafts
- All blocklist additions
- Settings changes

---

## 14. API Endpoint Standards

### Required Endpoints
```
# Data Fetching
POST /api/data-fetch/research-citations  # Fetch from SEO Command Center
POST /api/data-fetch/broken-links         # Fetch broken links for competitors

# Prospects
GET  /api/prospects                       # List with filters
GET  /api/prospects/:id                   # Single prospect details
POST /api/prospects                       # Manual add

# Contacts
GET  /api/contacts                        # List contacts
POST /api/contacts                        # Manual add

# Emails
GET  /api/emails/pending                  # Review queue
GET  /api/emails/:id                      # Single email
PATCH /api/emails/:id                     # Edit draft
POST /api/emails/:id/approve              # Approve for sending
POST /api/emails/:id/reject               # Reject with reason

# Responses
GET  /api/responses                       # List responses
GET  /api/responses/pending               # Need action
PATCH /api/responses/:id                  # Mark handled

# Metrics
GET  /api/metrics/overview                # Dashboard stats
GET  /api/metrics/funnel                  # Conversion rates

# Settings
GET  /api/settings                        # Get all settings
PATCH /api/settings                       # Update settings

# Webhooks
POST /api/webhooks/resend                 # Resend webhook handler
```

### API Response Standards
- Always return proper HTTP status codes
- Always return JSON (except health check)
- Include error messages in standard format
- Use pagination for list endpoints (default 50/page)
- Include total count in paginated responses

---

## 15. Database Schema Requirements

### Core Tables (Must Implement)
1. **prospects** - Target websites
   - Unique constraint on `url`
   - Status tracking
   - Quality metrics

2. **contacts** - Email addresses
   - Foreign key to prospects
   - Confidence tier
   - Validation status

3. **emails** - Generated drafts
   - Foreign key to prospects + contacts
   - Review status
   - Send status
   - Engagement tracking (opened, clicked)

4. **sequences** - Follow-up tracking
   - Foreign key to prospects
   - Scheduling dates
   - Reply detection

5. **responses** - Received replies
   - Foreign key to prospects + emails
   - Categorization
   - Action tracking

6. **blocklist** - Never contact
   - Domains and email addresses
   - Reason for blocking

7. **settings** - App configuration
   - Key-value store
   - Version tracking

8. **audit_log** - All actions
   - Who, what, when
   - Change tracking

### Indexing Requirements
**Must index:**
- `prospects.status` (for queue processing)
- `prospects.domain` (for deduplication)
- `prospects.url` (for deduplication)
- `emails.review_status` (for review queue)
- `emails.send_status` (for send queue)
- `sequences.status` (for active sequences)
- `blocklist.domain` (for fast lookups)
- `blocklist.email` (for fast lookups)

---

## 16. Sending Limits & Throttling

### Daily Send Limits (Enforced)
| Phase | Limit | Enforcement |
|-------|-------|-------------|
| Week 1-2 | 20/day | Hard limit, reject excess |
| Week 3-4 | 50/day | Hard limit, reject excess |
| Week 5+ | 100/day | Hard limit, reject excess |
| Production | Configurable | Set in dashboard |

### Rate Limiting
- Max 1 email per domain per campaign
- Min 6 month cooldown between contacts to same domain
- Max 10 emails per minute to avoid spam flags

### Follow-up Limits
- Max 2 follow-ups per initial email
- Stop if recipient replies
- Stop if email bounces
- Stop if unsubscribe requested

---

## 17. Integration Requirements

### Claude API
- Model: `claude-sonnet-4-5-20251101` (default)
- Alternative: `claude-haiku-3-5` (budget mode)
- Prompt caching for cost optimization
- Response format: JSON `{"subject": "...", "body": "..."}`
- Timeout: 30s per request
- Retry on 429 (rate limit) or 5xx errors

### Resend API
- From address: `outreach@mail.shieldyourbody.com`
- Reply-to: `outreach@shieldyourbody.com` (or configured)
- Track: Opens, clicks, bounces, complaints
- Webhook endpoint configured for events
- Test mode: All emails to `vicky@shieldyourbody.com`

### DataForSEO API
- Backlinks endpoint for broken link detection
- SERP endpoint for research citation prospects
- Rate limit: Respect API quotas
- Cost tracking: Log all API calls

### SEO Command Center DB
- Read-only access
- Connection pooling
- Timeout: 10s per query
- Fallback: Continue without SEO data if unavailable

---

## 18. Testing Standards

### Unit Tests (Target Coverage)
- Email generation logic: 90%+
- Contact extraction logic: 80%+
- Quality scoring: 90%+
- Blocklist checking: 100%

### Integration Tests (Must Pass)
- Full pipeline from prospect → sent email
- Follow-up sequence triggering
- Response detection and sequence stopping
- Webhook processing

### Safety Tests (Must Pass)
- Test mode redirects ALL emails
- Blocklist enforcement (domain + email)
- Daily limit enforcement
- Duplicate prevention (URL, email)
- Send limit throttling

---

## 19. Operational Requirements

### Monitoring & Alerts
**Must alert on:**
- Daily send limit reached
- Bounce rate > 5%
- Spam complaint rate > 0.1%
- Worker failures (3+ consecutive)
- Database connection failures
- Redis connection failures
- API quota warnings

### Logging Standards
**Must log:**
- All API calls (external services)
- All emails sent (metadata only)
- All worker executions (start/complete/fail)
- All human actions (approve/reject/edit)
- All errors with stack traces

**Log format:**
```json
{
  "timestamp": "ISO 8601",
  "level": "info|warn|error",
  "component": "worker_name",
  "action": "email_sent",
  "metadata": {...}
}
```

### Backup Requirements
- Daily database backups
- Retention: 30 days
- Test restore monthly

---

## 20. Deployment Requirements

### Railway Backend
- Health check endpoint (`/health`)
- Graceful shutdown handling
- Environment variables configured
- Auto-restart on failure
- Separate worker process from API server

### Vercel Dashboard
- Environment variables configured
- API endpoint URL configured
- Build process succeeds
- Static optimization enabled

### Pre-Production Checklist
- [ ] All environment variables set
- [ ] Database migrations run
- [ ] Redis connected
- [ ] Health check passing
- [ ] Test mode enabled
- [ ] Send test emails to internal address
- [ ] Verify email delivery
- [ ] Verify webhooks working
- [ ] Dashboard accessible
- [ ] Review queue functional

### Go-Live Checklist
- [ ] Captain approval received
- [ ] Test mode disabled
- [ ] Production send limits configured
- [ ] Blocklist populated
- [ ] Settings configured
- [ ] Warm-up schedule active
- [ ] Monitoring alerts enabled
- [ ] Backup verified
- [ ] Team trained on dashboard

---

## 21. Current Implementation Status

### What's Working
- [x] Database schema complete
- [x] Backend API running (localhost:3000)
- [x] Frontend dashboard running (localhost:3001)
- [x] SEO Command Center connection
- [x] Research citation prospect discovery
- [x] Broken link detection (DataForSEO)
- [x] Article matching for broken links
- [x] Email generation via Claude
- [x] Basic metrics endpoints
- [x] Settings management

### What's In Progress
- [ ] Contact finder automation (manual seeding works)
- [ ] Review queue UI (needs connection to backend)
- [ ] Email sending workflow
- [ ] Follow-up sequences
- [ ] Response detection

### Known Issues
- Workers not auto-started (need process manager)
- Settings page not connected to backend
- Guest post email template missing
- Claude model outdated (using older haiku)
- Fetch timeout could be increased

---

## 22. Quality Gates (Must Pass Before Production)

### Gate 1: Core Functionality
- [ ] Can discover prospects from both sources
- [ ] Can find contact emails automatically
- [ ] Can generate emails via Claude
- [ ] Review queue shows pending emails
- [ ] Can approve emails in dashboard
- [ ] Can send approved emails via Resend
- [ ] Emails actually deliver to inbox

### Gate 2: Safety Verification
- [ ] Test mode works (all emails to internal)
- [ ] Blocklist enforcement verified
- [ ] Daily limits enforced
- [ ] No duplicate sends
- [ ] Unsubscribe stops sequences
- [ ] Bounces stop sequences

### Gate 3: Quality Assurance
- [ ] Generated emails sound human
- [ ] Personalization is accurate
- [ ] No template language or placeholders
- [ ] Grammar and spelling perfect
- [ ] Links work correctly
- [ ] Signature formatting correct

### Gate 4: Performance
- [ ] Dashboard loads in < 2s
- [ ] API responds in < 500ms
- [ ] Email generation in < 10s
- [ ] No memory leaks
- [ ] No database connection leaks

### Gate 5: Captain Approval
- [ ] Full demo completed
- [ ] All questions answered
- [ ] Concerns addressed
- [ ] Explicit go-ahead received

---

## 23. Success Metrics (30-Day Goals)

### Volume Targets
- Prospects discovered: 200+
- Contacts found: 150+ (75% success rate)
- Emails drafted: 120+ (80% contact success)
- Emails approved: 100+ (83% approval rate)
- Emails sent: 100
- Positive responses: 5+ (5% reply rate)
- Links placed: 2-3 (50% placement rate)

### Quality Targets
- Email approval rate: > 80%
- Open rate: > 40%
- Bounce rate: < 3%
- Spam complaint rate: < 0.1%
- Response time to positive replies: < 24 hours

### Cost Targets
- Claude API: < $30/month
- Redis: ~$5/month
- Total new cost: < $35/month
- Cost per link placed: < $10

---

## 24. Decision Log Reference

### Confirmed Decisions
- ✅ Use Resend (not Woodpecker)
- ✅ Human review required initially
- ✅ Pitch research database (not products)
- ✅ Research citation + broken links only (guest posts later)
- ✅ US-only targeting initially
- ✅ Dashboard on Vercel, backend on Railway
- ✅ PostgreSQL + Redis for infrastructure
- ✅ Claude for email generation
- ✅ Almost everything configurable in GUI

### Open Questions
- ❓ Do we have Redis on Railway? (Need to verify)

---

## Evaluation Rubric Summary

### For Prospects
**Accept if:** DA ≥ 20 AND Traffic ≥ 1K AND Spam ≤ 30 AND Relevant AND Not Blocklisted
**Prioritize by:** Quality Score (70-100 = high, 50-69 = medium, 30-49 = low)

### For Contacts
**Accept if:** Valid format AND MX records exist AND Not disposable AND Not blocklisted
**Prioritize by:** Confidence tier (A > B > C > D)

### For Emails
**Accept if:** Personalized AND Specific reference AND < 150 words AND No spam language AND Soft CTA
**Quality check:** Human approver makes final call

### For System
**Production ready if:** All Phase 1 features complete AND All safety tests pass AND Captain approves

---

*This rubric serves as the single source of truth for all project requirements, standards, and evaluation criteria.*
