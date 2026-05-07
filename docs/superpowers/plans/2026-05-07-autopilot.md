# Autopilot Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a daily auto-pilot mode that researches prospects (up to 2 rounds), generates emails, and sends up to 20/day without manual review, with failure notifications to vicky@shieldyourbody.com.

**Architecture:** A new `autopilot.worker.ts` runs a `node-cron` daily job. It checks a DB settings toggle, finds ready prospects, triggers up to 2 rounds of prospecting if needed (polling for contact-finding to complete), then queues email generation with `{ autopilot: true }`. The email-generator and email-sender workers detect this flag and skip manual review / send failure notifications.

**Tech Stack:** Node.js, TypeScript, BullMQ, node-cron, Resend, PostgreSQL

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `app/src/types/index.ts` | Modify | Add `autopilot_enabled`, `autopilot_run_hour` to `Settings` |
| `app/src/db/migrations/011_autopilot_settings.sql` | Create | Insert default autopilot settings rows |
| `app/src/db/repositories/settings.repository.ts` | Modify | Return autopilot fields from `getAll()` |
| `app/src/workers/email-generator.worker.ts` | Modify | Auto-approve + queue to sender when `autopilot: true` |
| `app/src/workers/email-sender.worker.ts` | Modify | Send failure notification email on job failure |
| `app/src/workers/autopilot.worker.ts` | Create | Daily cron pipeline: research → generate → send |
| `app/src/index.ts` | Modify | Start autopilot scheduler on boot |

---

## Task 1: Types + Migration + Settings Repository

**Files:**
- Modify: `app/src/types/index.ts`
- Create: `app/src/db/migrations/011_autopilot_settings.sql`
- Modify: `app/src/db/repositories/settings.repository.ts`

- [ ] **Step 1: Add autopilot fields to `Settings` interface**

In `app/src/types/index.ts`, find the `Settings` interface and add two fields at the end:

```typescript
export interface Settings {
  sender_name: string;
  sender_email: string;
  daily_send_limit: number;
  followup_1_delay_days: number;
  followup_2_delay_days: number;
  followup_mode: 'manual' | 'smart_auto' | 'full_auto';
  min_domain_authority: number;
  max_spam_score: number;
  min_monthly_traffic: number;
  claude_model: string;
  warmup_enabled: boolean;
  warmup_week: number;
  email_signature?: string;
  sender_title?: string;
  email_template_research?: string;
  email_template_broken_link?: string;
  email_template_followup_1?: string;
  email_template_followup_2?: string;
  autopilot_enabled: boolean;
  autopilot_run_hour: number;
}
```

- [ ] **Step 2: Create migration file**

Create `app/src/db/migrations/011_autopilot_settings.sql`:

```sql
-- Autopilot settings
INSERT INTO settings (key, value, description) VALUES
  ('autopilot_enabled', 'false', 'Auto-pilot mode: researches, generates, and sends emails daily without manual review'),
  ('autopilot_run_hour', '8', 'UTC hour (0-23) when auto-pilot runs each day')
ON CONFLICT (key) DO NOTHING;
```

- [ ] **Step 3: Update `settingsRepository.getAll()`**

In `app/src/db/repositories/settings.repository.ts`, add the two new fields to the return object inside `getAll()`:

```typescript
async getAll(): Promise<Settings> {
  const result = await db.query<{ key: string; value: unknown }>(
    'SELECT key, value FROM settings'
  );

  const settings: Record<string, unknown> = {};
  for (const row of result.rows) {
    settings[row.key] = row.value;
  }

  return {
    sender_name: settings.sender_name as string || 'SYB Research Team',
    sender_email: settings.sender_email as string || 'outreach@shieldyourbody.com',
    daily_send_limit: settings.daily_send_limit as number || 9999,
    followup_1_delay_days: settings.followup_1_delay_days as number || 4,
    followup_2_delay_days: settings.followup_2_delay_days as number || 8,
    followup_mode: (settings.followup_mode as Settings['followup_mode']) || 'manual',
    min_domain_authority: settings.min_domain_authority as number || 20,
    max_spam_score: settings.max_spam_score as number || 30,
    min_monthly_traffic: settings.min_monthly_traffic as number || 1000,
    claude_model: settings.claude_model as string || 'claude-sonnet-4-20250514',
    warmup_enabled: settings.warmup_enabled as boolean ?? true,
    warmup_week: settings.warmup_week as number || 1,
    email_signature: settings.email_signature as string || '',
    sender_title: settings.sender_title as string || 'EMF Research Specialist',
    email_template_research: settings.email_template_research as string || '',
    email_template_broken_link: settings.email_template_broken_link as string || '',
    email_template_followup_1: settings.email_template_followup_1 as string || '',
    email_template_followup_2: settings.email_template_followup_2 as string || '',
    autopilot_enabled: settings.autopilot_enabled as boolean ?? false,
    autopilot_run_hour: settings.autopilot_run_hour as number ?? 8,
  };
}
```

- [ ] **Step 4: Commit**

```bash
git add app/src/types/index.ts app/src/db/migrations/011_autopilot_settings.sql app/src/db/repositories/settings.repository.ts
git commit -m "feat: add autopilot settings types and migration"
```

---

## Task 2: Email Generator — Auto-Approve for Autopilot

**Files:**
- Modify: `app/src/workers/email-generator.worker.ts`

- [ ] **Step 1: Add `autopilot` flag to `EmailGeneratorJobData`**

In `app/src/workers/email-generator.worker.ts`, update the interface:

```typescript
export interface EmailGeneratorJobData {
  prospectId: string;
  contactId: string;
  campaignId?: string;
  templateId?: string;
  autopilot?: boolean;
}
```

- [ ] **Step 2: Auto-approve and queue to sender when `autopilot: true`**

In the same file, import `emailSenderQueue` at the top with the existing imports:

```typescript
import { QUEUE_NAMES, emailSenderQueue } from '../config/queues.js';
```

Then update `processEmailGeneratorJob`. Replace the block after `emailRepository.create(...)` that sets status and logs, inserting an autopilot branch. The full updated function body from the save email step onwards:

```typescript
  // Save email to database
  const email = await emailRepository.create({
    prospect_id: prospectId,
    contact_id: contactId,
    campaign_id: campaignId,
    template_id: templateId,
    subject: generated.subject,
    body: generated.body,
  });

  if (autopilot) {
    // Auto-approve: skip manual review, queue directly for sending
    await emailRepository.updateStatus(email.id, 'approved');
    await emailSenderQueue.add('send-email', { emailId: email.id });
    logger.info(`Autopilot: email ${email.id} auto-approved and queued for sending`);
  }

  // Update prospect status
  await prospectRepository.updateStatus(prospectId, 'email_generated');

  // Log audit
  await auditRepository.logEmailGenerated(email.id, prospectId);

  logger.info(`Email generated successfully: ${email.id}`, {
    jobId: job.id,
    subject: generated.subject.substring(0, 50),
    autopilot: autopilot ?? false,
  });

  return {
    emailId: email.id,
    subject: generated.subject,
  };
```

Make sure `autopilot` is destructured from `job.data` at the top of `processEmailGeneratorJob`:

```typescript
async function processEmailGeneratorJob(job: Job<EmailGeneratorJobData>): Promise<{ emailId: string; subject: string }> {
  const { prospectId, contactId, campaignId, templateId, autopilot } = job.data;
```

- [ ] **Step 3: Commit**

```bash
git add app/src/workers/email-generator.worker.ts
git commit -m "feat: auto-approve and queue emails when autopilot flag is set"
```

---

## Task 3: Email Sender — Failure Notification

**Files:**
- Modify: `app/src/workers/email-sender.worker.ts`

- [ ] **Step 1: Add failure notification in the worker's `failed` event handler**

In `app/src/workers/email-sender.worker.ts`, import Resend at the top:

```typescript
import { Resend } from 'resend';
import env from '../config/env.js';
```

Then update `createEmailSenderWorker()`. Replace the existing `worker.on('failed', ...)` handler with:

```typescript
  worker.on('failed', async (job, error) => {
    logger.error(`Email sender job ${job?.id} failed:`, error);

    // Send failure notification
    try {
      const resend = new Resend(env.RESEND_API_KEY);
      const emailId = job?.data?.emailId ?? 'unknown';

      // Try to get contact email for context
      let recipientInfo = 'unknown recipient';
      try {
        const { db } = await import('../db/index.js');
        const result = await db.query<{ email: string; subject: string }>(
          `SELECT c.email, e.subject
           FROM emails e
           JOIN contacts c ON c.id = e.contact_id
           WHERE e.id = $1`,
          [emailId]
        );
        if (result.rows[0]) {
          recipientInfo = `${result.rows[0].email} — "${result.rows[0].subject}"`;
        }
      } catch (_) {}

      await resend.emails.send({
        from: 'SYB Backlinks <outreach@shieldyourbody.com>',
        to: 'vicky@shieldyourbody.com',
        subject: `[SYB Backlinks] Email send failed — ${recipientInfo}`,
        text: [
          `A backlinks outreach email failed to send.`,
          ``,
          `Email ID: ${emailId}`,
          `Recipient: ${recipientInfo}`,
          `Error: ${error.message}`,
          `Job ID: ${job?.id ?? 'unknown'}`,
          `Time: ${new Date().toISOString()}`,
          ``,
          `Check the dashboard for details.`,
        ].join('\n'),
      });
    } catch (notifyError) {
      logger.error('Failed to send failure notification:', notifyError);
    }
  });
```

- [ ] **Step 2: Commit**

```bash
git add app/src/workers/email-sender.worker.ts
git commit -m "feat: send failure notification email on email send failure"
```

---

## Task 4: Autopilot Worker (Core Pipeline)

**Files:**
- Create: `app/src/workers/autopilot.worker.ts`

- [ ] **Step 1: Create the autopilot worker file**

Create `app/src/workers/autopilot.worker.ts` with the full content:

```typescript
import cron from 'node-cron';
import { db } from '../db/index.js';
import { settingsRepository } from '../db/repositories/index.js';
import { prospectingQueue, emailGeneratorQueue } from '../config/queues.js';
import logger from '../utils/logger.js';

// Count emails sent today (UTC)
async function countEmailsSentToday(): Promise<number> {
  const result = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM emails
     WHERE sent_at >= CURRENT_DATE AND sent_at < CURRENT_DATE + INTERVAL '1 day'`
  );
  return parseInt(result.rows[0].count, 10);
}

// Get prospects ready for email generation:
// status = contact_found, no existing email, not deleted
// DISTINCT ON (p.id) picks the primary contact per prospect to avoid duplicates
async function getReadyProspects(): Promise<Array<{ prospect_id: string; contact_id: string }>> {
  const result = await db.query<{ prospect_id: string; contact_id: string }>(
    `SELECT prospect_id, contact_id
     FROM (
       SELECT DISTINCT ON (p.id)
         p.id AS prospect_id,
         c.id AS contact_id,
         p.quality_score
       FROM prospects p
       JOIN contacts c ON c.prospect_id = p.id
       WHERE p.status = 'contact_found'
         AND p.deleted_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM emails e
           WHERE e.prospect_id = p.id
             AND e.status IN ('pending_review', 'approved', 'sent')
         )
       ORDER BY p.id, c.is_primary DESC NULLS LAST
     ) sub
     ORDER BY quality_score DESC NULLS LAST
     LIMIT 50`
  );
  return result.rows;
}

// Trigger all 3 prospecting types
async function triggerProspecting(): Promise<void> {
  await Promise.all([
    prospectingQueue.add('prospect', { type: 'broken_links', limit: 30 }),
    prospectingQueue.add('prospect', { type: 'competitor_domains', limit: 30 }),
    prospectingQueue.add('prospect', { type: 'serp_results', limit: 30 }),
  ]);
  logger.info('Autopilot: triggered prospecting (all 3 types)');
}

// Poll until we have enough ready prospects or time runs out
async function waitForProspects(needed: number, timeoutMs: number): Promise<Array<{ prospect_id: string; contact_id: string }>> {
  const deadline = Date.now() + timeoutMs;
  const pollInterval = 30_000; // 30 seconds

  while (Date.now() < deadline) {
    const ready = await getReadyProspects();
    if (ready.length >= needed) {
      return ready;
    }
    logger.info(`Autopilot: waiting for prospects — have ${ready.length}, need ${needed}`);
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  return getReadyProspects(); // Return whatever we have after timeout
}

// Main autopilot pipeline
async function runAutopilot(): Promise<void> {
  logger.info('Autopilot: starting daily run');

  try {
    const settings = await settingsRepository.getAll();

    if (!settings.autopilot_enabled) {
      logger.info('Autopilot: disabled, skipping');
      return;
    }

    // Calculate how many emails to send today
    const sentToday = await countEmailsSentToday();
    const dailyCap = Math.min(settings.daily_send_limit, 20);
    const needed = dailyCap - sentToday;

    if (needed <= 0) {
      logger.info(`Autopilot: daily cap reached (${sentToday}/${dailyCap}), skipping`);
      return;
    }

    logger.info(`Autopilot: need to send ${needed} emails (${sentToday} already sent today)`);

    // Check current ready prospects
    let ready = await getReadyProspects();
    let researchRounds = 0;

    // Research round 1
    if (ready.length < needed) {
      researchRounds++;
      logger.info(`Autopilot: not enough ready prospects (${ready.length}/${needed}), starting research round 1`);
      await triggerProspecting();
      ready = await waitForProspects(needed, 30 * 60 * 1000); // wait up to 30 min
    }

    // Research round 2
    if (ready.length < needed) {
      researchRounds++;
      logger.info(`Autopilot: still not enough (${ready.length}/${needed}), starting research round 2`);
      await triggerProspecting();
      ready = await waitForProspects(needed, 30 * 60 * 1000); // wait up to 30 min
    }

    // Queue email generation for up to `needed` prospects
    const toProcess = ready.slice(0, needed);

    logger.info(`Autopilot: queuing ${toProcess.length} email generation jobs (${researchRounds} research round(s) used)`);

    for (const { prospect_id, contact_id } of toProcess) {
      await emailGeneratorQueue.add('generate-email', {
        prospectId: prospect_id,
        contactId: contact_id,
        autopilot: true,
      });
    }

    logger.info(`Autopilot: run complete — ${toProcess.length} emails queued, ${researchRounds} research round(s)`);
  } catch (error) {
    logger.error('Autopilot: run failed:', error);
  }
}

// Start the autopilot scheduler
export async function startAutopilotScheduler(): Promise<void> {
  // Read the run hour from settings at start time, then re-read each day
  // node-cron doesn't support dynamic schedules, so we use hourly check pattern
  cron.schedule('0 * * * *', async () => {
    try {
      const settings = await settingsRepository.getAll();
      const currentHour = new Date().getUTCHours();

      if (currentHour === settings.autopilot_run_hour) {
        await runAutopilot();
      }
    } catch (error) {
      logger.error('Autopilot scheduler tick failed:', error);
    }
  });

  logger.info('✅ Autopilot scheduler started (checks every hour, runs at configured UTC hour)');
}

export { runAutopilot };
export default { startAutopilotScheduler, runAutopilot };
```

- [ ] **Step 2: Commit**

```bash
git add app/src/workers/autopilot.worker.ts
git commit -m "feat: add autopilot worker with daily pipeline"
```

---

## Task 5: Wire Autopilot into index.ts

**Files:**
- Modify: `app/src/index.ts`

- [ ] **Step 1: Import and start autopilot scheduler**

In `app/src/index.ts`, add the import alongside the other worker imports at the top:

```typescript
import { startAutopilotScheduler } from './workers/autopilot.worker.js';
```

Then inside the `start()` function, after the `startTrashCleanupScheduler()` block, add:

```typescript
    // Start autopilot scheduler
    try {
      await startAutopilotScheduler();
    } catch (autopilotError) {
      logger.warn('Autopilot scheduler failed to start:', autopilotError);
    }
```

Also add the autopilot status to the startup log block (after the workers line):

```typescript
      logger.info(`🤖 Autopilot: ${env.SAFETY_MODE === 'live' ? 'armed' : 'standby (safety mode)'}`);
```

- [ ] **Step 2: Commit**

```bash
git add app/src/index.ts
git commit -m "feat: start autopilot scheduler on boot"
```

---

## Task 6: Run Migration + Deploy

- [ ] **Step 1: Run migration against production DB**

```bash
cd "/c/Users/VICKY/Desktop/SYB Posts/Backlinks Gen/app"
DATABASE_URL="postgresql://postgres:BacklinksGen2026Secure@crossover.proxy.rlwy.net:58662/backlinks" npx tsx src/db/migrate.ts
```

Expected output includes:
```
📄 Running: 011_autopilot_settings.sql
✅ 011_autopilot_settings.sql completed successfully
```

- [ ] **Step 2: Verify settings rows inserted**

```bash
node -e "
const { Pool } = require('./node_modules/pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:BacklinksGen2026Secure@crossover.proxy.rlwy.net:58662/backlinks' });
pool.query(\"SELECT key, value FROM settings WHERE key LIKE 'autopilot%'\")
  .then(r => { console.log(r.rows); pool.end(); });
"
```

Expected:
```
[ { key: 'autopilot_enabled', value: false }, { key: 'autopilot_run_hour', value: 8 } ]
```

- [ ] **Step 3: Deploy to Railway**

```bash
railway link --project syb-backlinks-gen
railway service redeploy --service api --yes
```

- [ ] **Step 4: Verify deployment logs show autopilot started**

```bash
sleep 20 && railway service logs --service api 2>&1 | grep -i autopilot | tail -5
```

Expected:
```
✅ Autopilot scheduler started (checks every hour, runs at configured UTC hour)
```

- [ ] **Step 5: Enable autopilot via API**

```bash
curl -X PUT https://syb-backlinks-gen-api.up.railway.app/api/v1/settings/autopilot_enabled \
  -H "Content-Type: application/json" \
  -d '{"value": true}'
```

Expected: `{"success":true,"key":"autopilot_enabled","value":true}`

- [ ] **Step 6: Final commit (deploy marker)**

```bash
git add -A
git commit -m "feat: autopilot mode — research, generate, send 20/day with failure notifications"
```
