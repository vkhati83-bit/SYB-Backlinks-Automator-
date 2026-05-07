# Autopilot Mode — Design Spec
**Date:** 2026-05-07
**Status:** Approved

## Overview

Daily automated pipeline that researches new prospects, generates outreach emails, and sends up to 20 emails per day without manual review. Controlled by a settings toggle. Failures trigger an email notification to vicky@shieldyourbody.com.

---

## Settings

Two new keys in the `settings` DB table:

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `autopilot_enabled` | boolean | `false` | Master on/off toggle |
| `autopilot_run_hour` | number (0–23) | `8` | UTC hour to run daily |

Exposed via existing settings API — no new routes needed.
`Settings` interface and `settingsRepository.getAll()` updated to include both keys.

---

## Pipeline (`autopilot.worker.ts`)

New file. Scheduled via `node-cron` at `autopilot_run_hour` UTC daily. Started in `index.ts` alongside existing schedulers.

```
1. Read autopilot_enabled — exit if false
2. Count emails sent today (sent_at >= midnight UTC)
   needed = min(daily_send_limit, 20) - sent_today
   Exit if needed <= 0
3. Count ready prospects: status = 'contact_found', no existing email
4. Research round 1 (if ready < needed):
   - Queue prospecting jobs: broken_links, competitor_domains, serp_results
   - Poll DB every 30s, up to 30 min, until ready >= needed
5. Research round 2 (if still ready < needed):
   - Repeat step 4
6. Take up to `needed` ready prospects (ordered by quality_score DESC)
7. Queue email-generator jobs with { autopilot: true } for each
8. Log: rounds used, prospects found, emails queued
```

---

## Email Generator (`email-generator.worker.ts`)

**Change:** When `job.data.autopilot === true`:
- Save email with `status = 'approved'` instead of `'pending_review'`
- Immediately add to `emailSenderQueue` after saving
- No other changes to generation logic

---

## Email Sender (`email-sender.worker.ts`)

**Change:** On worker `failed` event, send notification via Resend:

- **To:** vicky@shieldyourbody.com
- **Subject:** `[SYB Backlinks] Email send failed — <recipient>`
- **Body:** Email ID, recipient address, subject line, error message, timestamp
- Applies to both autopilot and manual send failures

---

## Files Changed

| File | Change |
|------|--------|
| `src/workers/autopilot.worker.ts` | New — cron + pipeline |
| `src/workers/email-generator.worker.ts` | Auto-approve when `autopilot: true` |
| `src/workers/email-sender.worker.ts` | Failure notification email |
| `src/db/repositories/settings.repository.ts` | Add autopilot fields to `getAll()` |
| `src/types/index.ts` | Add autopilot fields to `Settings` interface |
| `src/index.ts` | Start autopilot scheduler on boot |
| `src/db/migrations/` | New migration: insert default autopilot settings |

---

## Out of Scope

- Dashboard UI changes (toggle can be flipped via existing settings API)
- Per-campaign autopilot targeting
- Autopilot dry-run mode
