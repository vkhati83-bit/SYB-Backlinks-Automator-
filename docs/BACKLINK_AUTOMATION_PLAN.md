# Backlink Automation Plan

**For:** ShieldYourBody
**Date:** January 2026

---

## What We're Building

A system that automatically finds websites that might want to link to SYB, writes personalized outreach emails, and helps us manage the whole process.

**The main thing we're pitching:** Our research database at shieldyourbody.com/research, which has 3,600+ peer-reviewed scientific studies on EMF and health. This is genuinely valuable to anyone writing about EMF topics.

---

## Why This Matters

Backlinks (other sites linking to us) help SYB rank higher in Google. Right now we don't have a system for getting them. This automation will let us reach out to hundreds of relevant websites each month without it becoming a full-time job.

---

## The Two Strategies We're Starting With

### 1. Research Citation Outreach

**The idea:** Find pages that talk about EMF, cell phone radiation, 5G health effects, etc. These pages would benefit from linking to credible research. We have that research.

**Example:**
> "Hi Sarah, I read your article on cell phone radiation. If you're looking for scientific sources to cite, we've put together a database of 3,600+ peer-reviewed studies at shieldyourbody.com/research. Might be useful for your readers."

### 2. Broken Link Outreach

**The idea:** Find pages that link to dead websites. Offer our research database as a replacement.

**Example:**
> "Hi Mike, I noticed the link to 'EMF studies' on your health guide is broken. We have a similar resource at shieldyourbody.com/research that might work as a replacement."

### What We're NOT Doing Yet

**Guest posts** - This requires actually writing articles, which is more work. We'll add this later once the basic system is running.

---

## How It Works (The Simple Version)

```
Step 1: Find websites discussing EMF topics
        ↓
Step 2: Find contact emails for those websites
        ↓
Step 3: AI writes personalized outreach emails
        ↓
Step 4: Human reviews and approves each email
        ↓
Step 5: System sends approved emails
        ↓
Step 6: Automatic follow-ups if no response
        ↓
Step 7: Track results (who replied, who linked to us)
```

---

## What Happens at Each Step

### Step 1: Find Websites

The system searches for pages that discuss EMF topics using DataForSEO (same tool we use for SEO Command Center).

**It looks for:**
- Pages ranking for searches like "EMF health effects", "cell phone radiation dangers", "5G health risks"
- Pages linking to competitor sites that now have broken links

**It filters out:**
- Low-quality sites (spam score too high, no traffic)
- Sites we've already contacted
- Harmonizer sellers, EMF sticker sellers, scams

### Step 2: Find Contacts

The system visits each website and looks for email addresses on their contact page, about page, etc.

If it can't find one, it tries common patterns like editor@domain.com or contact@domain.com.

### Step 3: Write Emails

Claude AI writes a personalized email for each prospect. It reads their page first so the email feels genuine, not like a mass template.

### Step 4: Human Review

Every email goes to a dashboard where someone on our team can:
- Approve it (send as-is)
- Edit it (fix something, then send)
- Reject it (don't send, with a reason why)

This keeps quality high and prevents embarrassing mistakes.

### Step 5: Send

Approved emails get sent through Resend (email service). We start slow (20/day) to warm up our sending reputation, then gradually increase.

### Step 6: Follow-ups

If someone doesn't respond:
- Day 4: Send a short follow-up
- Day 8: Send a final follow-up
- Day 14: Stop, mark as "no response"

If they reply at any point, follow-ups stop automatically.

### Step 7: Track Results

The dashboard shows:
- How many emails sent
- Open rates
- Reply rates
- How many links we actually got

---

## The Dashboard

An internal web app where the team can:

**Review Queue** - See pending emails, approve/edit/reject them

**Pipeline** - See how many prospects are at each stage

**Responses** - See who replied and whether it was positive/negative

**Metrics** - Track success rates and ROI

**Settings** - Configure everything (see next section)

---

## What's Configurable

Almost everything can be changed in the dashboard settings:

| Setting | What It Controls |
|---------|------------------|
| Sender name & email | Who the emails come from |
| Email signature | What appears at the bottom |
| Search queries | What topics to search for |
| Competitor list | Which sites to check for broken links |
| Exclude list | Domains/keywords to avoid |
| Quality filters | Minimum traffic, max spam score, etc. |
| Daily send limit | How many emails per day |
| Follow-up timing | Days between follow-ups |
| Claude model | Which AI model (affects cost/quality) |
| Team access | Who can use the dashboard |
| Alert notifications | Where to send error alerts |

---

## What It Costs

**New monthly cost: $5-30** (Claude API only)

Everything else we already pay for:
- Resend (email service) - existing subscription
- DataForSEO - existing subscription via SEO Command Center
- Railway (hosting) - existing subscription
- Vercel (dashboard) - existing subscription

**Cost per backlink:** Probably $2-10 based on volume and success rate.

---

## Expected Results

| Timeframe | Goal |
|-----------|------|
| First month | System working, 500 emails sent |
| 3 months | 1,500+ emails sent, 15-30 backlinks |
| 6 months | 50+ total backlinks, process refined |

Industry average for cold outreach is 1-3% placement rate. Our personalized approach should do better.

---

## Risks and How We Handle Them

| Risk | How We Handle It |
|------|------------------|
| Emails go to spam | Warm up domain slowly, follow best practices |
| AI writes bad emails | Human reviews every email before sending |
| Low response rate | Test different approaches, improve personalization |
| Someone complains | Professional tone, easy opt-out, respect "no" |

---

## Who Does What

| Task | Who |
|------|-----|
| Build the system | Development (using Claude Code) |
| Review outreach emails | Team member (configured in settings) |
| Handle positive responses | Team member (when someone wants to link) |
| Monitor metrics | Team member (weekly check) |

---

## Next Steps

1. Check if Railway has Redis (ask CEO/tech)
2. Set up Resend sending domain
3. Get Claude API key
4. Build the system
5. Test with small batch
6. Scale up

---

*Last updated: January 2026*
