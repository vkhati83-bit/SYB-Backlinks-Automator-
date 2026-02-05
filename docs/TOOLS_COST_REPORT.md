# Backlink Automation Tools - Cost & Build vs Buy Analysis

**Prepared for:** CEO Review
**Date:** January 2026
**Purpose:** Evaluate tools for backlink automation system

---

## Executive Summary

| Tool | Purpose | Status | NEW Monthly Cost |
|------|---------|--------|------------------|
| **Resend** | Email sending | Already paying | $0 (existing) |
| **DataForSEO API** | Prospecting data | Already paying | $0 (existing) |
| **Claude API** | AI email writing | Need API access | $5-30 |
| **Railway** | Backend hosting | Already paying | $0 (existing) |
| **Vercel** | Dashboard hosting | Already paying | $0 (existing) |
| **PostgreSQL** | Database | Included in Railway | $0 |

**Total NEW Monthly Cost: $5-30/month** (Claude API only)

### Important Note on Claude
The Claude Max subscription (5 seats @ $100/user) provides access to claude.ai chat interface. **API access is billed separately** on a pay-per-token basis. The Max subscription does NOT include API credits.

---

## 1. Resend (Email Sending)

### What It Does
Sends emails via API. Handles deliverability, bounce management, and provides webhooks for tracking opens/clicks.

### Pricing

| Plan | Cost | Emails Included | Overage |
|------|------|-----------------|---------|
| Free | $0 | 3,000/month (100/day limit) | N/A |
| Pro | $20/month | 50,000/month | ~$0.40 per 1,000 |
| Scale | $90/month | 100,000/month | ~$0.40 per 1,000 |

**Add-ons:**
- Dedicated IP: +$30/month (recommended for cold outreach)

### For Our Use Case
- Estimated volume: 500-3,000 emails/month
- **Recommended plan: Pro ($20/month) + Dedicated IP ($30/month) = $50/month**

### Build vs Buy

| Option | Feasibility | Notes |
|--------|-------------|-------|
| **Buy (Resend)** | Recommended | Handles deliverability, reputation, compliance |
| Build (own SMTP) | Not recommended | Requires managing mail servers, IP warming, deliverability issues, blacklist monitoring. High complexity, low ROI. |

**Verdict: BUY** - Email infrastructure is complex. Resend handles SPF/DKIM/DMARC, bounce handling, suppression lists, and deliverability optimization.

---

## 2. DataForSEO API (Prospecting Data)

### What It Does
Provides SEO data including:
- Competitor backlink profiles
- SERP results for finding "write for us" pages
- Domain metrics (DA, traffic, etc.)

### Pricing

| Method | Cost per Request |
|--------|------------------|
| Standard Queue | $0.0006 per SERP |
| Priority Queue | $0.0012 per SERP |
| Live/Real-time | $0.002 per SERP |
| Backlink data | ~$0.001 per domain |

**Minimum deposit:** $50 (pay-as-you-go, no subscription)

### For Our Use Case
- Competitor backlink pulls: ~$10-30/month
- SERP scraping for opportunities: ~$20-50/month
- Domain quality checks: ~$10-20/month
- **Estimated: $50-100/month**

### Build vs Buy

| Option | Feasibility | Notes |
|--------|-------------|-------|
| **Buy (DataForSEO)** | Only option | They aggregate data from multiple sources |
| Build | Not possible | Would need to scrape Google (TOS violation, blocked), build own crawler infrastructure, index the web. Impossible at our scale. |

**Verdict: BUY** - This is aggregated SEO data. Cannot be replicated in-house.

---

## 3. Claude API (AI Email Generation)

### What It Does
Generates personalized outreach emails using AI. Takes target website context and creates customized pitches.

### Pricing (per million tokens)

| Model | Input | Output | Best For |
|-------|-------|--------|----------|
| Haiku 4.5 | $1 | $5 | Simple tasks, high volume |
| **Sonnet 4.5** | $3 | $15 | Balanced quality/cost |
| Opus 4.5 | $5 | $25 | Complex reasoning |

**Cost optimizations available:**
- Batch API: 50% discount (async processing)
- Prompt caching: 90% savings on repeated content

### For Our Use Case
- ~500-2,000 emails/month
- ~1,000-2,000 tokens per email (input + output)
- Using Sonnet with prompt caching
- **Estimated: $20-50/month**

### Build vs Buy

| Option | Feasibility | Notes |
|--------|-------------|-------|
| **Buy (Claude API)** | Only option | State-of-the-art language model |
| Build own AI | Not possible | Would cost millions to train comparable model |
| Use templates only | Possible but inferior | No personalization = lower response rates |

**Verdict: BUY** - AI capabilities cannot be replicated. Claude provides high-quality personalization that improves response rates.

---

## 4. Railway (Backend Hosting)

### What It Does
Hosts our backend workers that:
- Run prospecting jobs
- Find contacts
- Generate emails
- Manage queues and scheduling

### Pricing

| Plan | Base Cost | Included Credits | Overage |
|------|-----------|------------------|---------|
| Hobby | $5/month | $5 usage | Pay per use |
| Pro | $20/month | $20 usage | Pay per use |

**Usage-based billing:** CPU, RAM, storage. You pay for actual utilization, not reserved capacity.

### For Our Use Case
- Background workers running periodically
- PostgreSQL database
- Low-medium compute needs
- **Estimated: $5-20/month**

### Build vs Buy

| Option | Feasibility | Notes |
|--------|-------------|-------|
| **Buy (Railway)** | Recommended | Simple, affordable, we already use it |
| Self-host (VPS) | Possible | More management overhead, similar cost |
| AWS/GCP | Possible | More complex, potentially more expensive |

**Verdict: BUY** - Already in our stack. Cost-effective for our scale.

---

## 5. Vercel (Dashboard Hosting)

### What It Does
Hosts the review dashboard where team members:
- Review AI-generated emails
- Approve/edit before sending
- View metrics and pipeline status

### Pricing

| Plan | Cost | Notes |
|------|------|-------|
| Hobby | Free | Personal use, 1 user |
| Pro | $20/user/month | Team features, higher limits |

**Included in Pro:** $20 credit for bandwidth/compute overages

### For Our Use Case
- Simple dashboard, low traffic (internal tool)
- 1-3 users reviewing emails
- **Estimated: $0-20/month** (Free tier likely sufficient initially)

### Build vs Buy

| Option | Feasibility | Notes |
|--------|-------------|-------|
| **Buy (Vercel)** | Recommended | Zero-config deployment, we already use it |
| Self-host | Possible | Adds complexity, minimal savings |

**Verdict: BUY** - Free tier works. Upgrade only if needed.

---

## 6. Custom Development Required

Regardless of tools purchased, we need to build:

| Component | Description | Effort |
|-----------|-------------|--------|
| Prospector module | Queries DataForSEO, filters results | Medium |
| Contact finder | Scrapes websites for emails, validates | Medium |
| Email generator | Integrates Claude API with templates | Medium |
| Review dashboard | UI for approval workflow | Medium |
| Queue/scheduler | Manages follow-up sequences | Medium |
| Webhook handlers | Processes Resend events | Low |
| Database schema | Stores prospects, emails, status | Low |

**Note:** Woodpecker.co (original choice) had built-in follow-up sequences and reply detection. With Resend, we build these ourselves. This adds development effort but gives us more control and lower per-email costs.

---

## Cost Comparison: Minimal vs Full Operation

### What We Already Pay For (No New Cost)
| Item | Status |
|------|--------|
| Resend | Existing subscription |
| DataForSEO | Existing subscription (SEO Command Center) |
| Railway | Existing subscription (multiple apps) |
| Vercel | Existing subscription |

### NEW Costs Only: Claude API

**Cost per email:**
- ~1,000 input tokens (prompt + context) + ~400 output tokens (email)
- Sonnet 4.5: ~$0.009/email (~$0.006 with prompt caching)
- Haiku 4.5: ~$0.003/email (budget option)

| Volume | Emails/Month | Sonnet 4.5 | Haiku 4.5 |
|--------|--------------|------------|-----------|
| Minimal (Testing) | ~500 | **$3-5** | **$1.50** |
| Full Operation | ~1,500 | **$9-14** | **$4.50** |
| High Volume | ~3,000+ | **$18-27** | **$9** |

*Haiku is sufficient for straightforward email generation. Use Sonnet for higher personalization quality.*

---

## Recommendation Summary

| Tool | Decision | Reason |
|------|----------|--------|
| **Resend** | ALREADY HAVE | Existing subscription |
| **DataForSEO** | ALREADY HAVE | Existing subscription (SEO Command Center) |
| **Claude API** | NEW PURCHASE | Only new cost - $5-30/month |
| **Railway** | ALREADY HAVE | Existing subscription |
| **Vercel** | ALREADY HAVE | Existing subscription |

### What We Build In-House
- Pipeline orchestration (prospecting, contact finding, email generation flow)
- Review dashboard UI
- Follow-up sequence scheduler
- Integration glue between services

### Total Investment
- **New monthly cost:** $5-30/month (Claude API only)
- **Development:** Internal (using Claude Code for implementation)

---

## Sources

- [Resend Pricing](https://resend.com/pricing)
- [DataForSEO Pricing](https://dataforseo.com/pricing)
- [Claude API Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [Railway Pricing](https://railway.com/pricing)
- [Vercel Pricing](https://vercel.com/pricing)

---

*Report generated: January 2026*
