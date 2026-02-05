# Backlink Automation - Project Decisions

**Project:** ShieldYourBody Backlink Automation
**Started:** January 2026

---

## Question for CEO

### Do we have Redis on Railway?

**What is Redis?**
A fast storage system that keeps track of background jobs. When we queue up 50 prospects to process, Redis remembers what's done and what's still waiting. If something crashes, it picks up where it left off.

**Cost:** About $5/month on Railway

**What to check:** Look in the Railway dashboard for a Redis service. If we don't have one, we need to add it (one-click setup).

---

## Confirmed Decisions

### What We're Building

| Decision | Answer |
|----------|--------|
| Target site | ShieldYourBody.com |
| Asset to pitch | shieldyourbody.com/research (3,600+ peer-reviewed studies) |
| Outreach types (now) | Research citation, Broken link |
| Outreach types (later) | Guest posts |
| Automation level | Human review before sending (initially) |

### Tech Stack

| Component | Tool | Status |
|-----------|------|--------|
| Backend/Workers | Railway | Already have |
| Database | Railway Postgres | Already have |
| Job queues | Redis + BullMQ | Need Redis |
| Dashboard | Vercel (Next.js) | Already have |
| Email sending | Resend | Already have |
| Prospecting data | DataForSEO | Already have |
| AI emails | Claude API | Need API key |

### Budget

| Item | Status | Monthly Cost |
|------|--------|--------------|
| Railway | Existing | $0 new |
| Vercel | Existing | $0 new |
| Resend | Existing | $0 new |
| DataForSEO | Existing | $0 new |
| Claude API | **New** | $5-30 |
| Redis | **New** | ~$5 |
| **Total new cost** | | **$10-35/month** |

---

## Configuration Decisions

Everything below will be configurable in the dashboard settings (not hardcoded).

### Email Settings

| Setting | Default | Notes |
|---------|---------|-------|
| Sender name | (empty) | Enter in GUI |
| Sender email | (empty) | Enter in GUI |
| Reply-to email | (empty) | Enter in GUI |
| Email signature | (empty) | Enter in GUI |
| Claude model | Sonnet | Dropdown in GUI (Sonnet vs Haiku) |

### Prospecting Settings

| Setting | Default | Notes |
|---------|---------|-------|
| Geographic targeting | US only | Dropdown in GUI |
| Search queries | EMF-related list | Add/remove in GUI |
| Competitor domains | (empty) | Add/remove in GUI |
| Min domain authority | 20 | Adjustable |
| Max spam score | 30 | Adjustable |
| Min monthly traffic | 1,000 | Adjustable |

### Exclude List

| Type | Examples |
|------|----------|
| Blocked domains | Competitors, spam sites (add in GUI) |
| Disqualifying keywords | "harmonizer", "EMF sticker", "neutralizer pendant" |

If a prospect's page contains these keywords, it gets flagged or skipped automatically.

### Follow-up Settings

| Setting | Default |
|---------|---------|
| Mode | Smart Auto (see below) |
| First follow-up | 4 days |
| Second follow-up | 8 days |
| Stop sequence | 14 days |

**Follow-up modes:**
- **Manual** - Every follow-up needs human approval
- **Smart Auto** - Auto-send if initial was approved AND recipient opened it
- **Full Auto** - Auto-send all follow-ups (not recommended)

### User Management

| Setting | Notes |
|---------|-------|
| User accounts | Admin creates in GUI |
| Permission levels | Admin / Reviewer / Viewer |

**Roles:**
- Admin - Full access, manage settings and users
- Reviewer - Approve, edit, reject emails
- Viewer - Read-only dashboard access

### Alerts

| Setting | Notes |
|---------|-------|
| Notification method | Email or Slack (choose in GUI) |
| Alert triggers | Job failures, send limit reached, positive responses |

---

## What Resend Can Track

We get this data from Resend webhooks:
- Email delivered
- Email opened (pixel tracking)
- Link clicked
- Bounced
- Spam complaint

Reply detection requires inbox monitoring (we build this).

---

## Settings Dashboard Preview

```
┌─────────────────────────────────────────────────────────────────────────┐
│  SETTINGS                                                                │
├────────────────┬────────────────────────────────────────────────────────┤
│                │                                                        │
│  Sections      │  GENERAL                                               │
│                │                                                        │
│  > General     │  Sender Name:     [ R Blank                    ]      │
│                │  Sender Email:    [ outreach@mail.syb.com      ]      │
│    Prospecting │  Reply-To:        [ outreach@syb.com           ]      │
│                │  Claude Model:    [ Sonnet ▼                   ]      │
│    Competitors │  Daily Limit:     [ 50                         ]      │
│                │                                                        │
│    Exclude     │  Signature:                                            │
│                │  ┌──────────────────────────────────────────────┐     │
│    Follow-ups  │  │ Best,                                        │     │
│                │  │ {name}                                       │     │
│    Users       │  │ ShieldYourBody                               │     │
│                │  └──────────────────────────────────────────────┘     │
│    API Keys    │                                                        │
│                │                              [ Save Changes ]          │
│    Alerts      │                                                        │
│                │                                                        │
└────────────────┴────────────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────────────────────────┐
│  SETTINGS > COMPETITORS                                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Competitor domains to check for broken backlinks:       [ + Add ]      │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ defendershield.com                                         [x] │    │
│  │ (add competitors whose backlinks we scan for dead links)       │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────────────────────────┐
│  SETTINGS > EXCLUDE LIST                                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Blocked Domains (never contact):                        [ + Add ]      │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ competitor.com                                             [x] │    │
│  │ spamsite.com                                               [x] │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  Disqualifying Keywords (auto-skip if page contains):    [ + Add ]      │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ harmonizer                                                 [x] │    │
│  │ EMF sticker                                                [x] │    │
│  │ neutralizer pendant                                        [x] │    │
│  │ 5G shield sticker                                          [x] │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────────────────────────┐
│  SETTINGS > FOLLOW-UPS                                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Follow-up Mode:                                                         │
│                                                                          │
│  ○ Manual - All follow-ups need approval                                │
│                                                                          │
│  ● Smart Auto - Auto-send if:                                           │
│      ☑ Initial email was approved (not edited)                          │
│      ☑ Recipient opened the email                                       │
│                                                                          │
│  ○ Full Auto - Auto-send everything (not recommended)                   │
│                                                                          │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                          │
│  Timing:                                                                 │
│  First follow-up after:  [ 4  ] days                                    │
│  Second follow-up after: [ 8  ] days                                    │
│  Stop sequence after:    [ 14 ] days                                    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────────────────────────┐
│  SETTINGS > USERS                                                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Team Members:                                          [ + Invite ]    │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ admin@syb.com                    Admin                         │    │
│  │ reviewer@syb.com                 Reviewer              [Edit]  │    │
│  │ viewer@syb.com                   Viewer                [Edit]  │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  Roles:                                                                  │
│  • Admin - Full access, manage settings and users                       │
│  • Reviewer - Approve, edit, reject emails                              │
│  • Viewer - Read-only dashboard access                                  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Discussion Log

### January 12, 2026 - Initial Planning
- Established project in this directory
- Identified ShieldYourBody.com as target
- No current backlink efforts in place
- Goal: Automate as much as possible
- Decided on Resend for email sending (not Woodpecker.co)
- Start with human review, evolve to auto-send later

### January 19, 2026 - Scope Refinement
- Narrowed scope to research citation + broken links only
- Guest posts moved to future phase (requires content creation)
- Confirmed primary asset: shieldyourbody.com/research
- Decided almost everything should be configurable via GUI
- Exclude list: no harmonizer sellers, EMF sticker sellers, scams
- Simple internal auth (admin creates user accounts)

---

## Open Item

**Redis on Railway** - Need to confirm if we have it or need to add it (~$5/month).

---

*Last updated: January 2026*
