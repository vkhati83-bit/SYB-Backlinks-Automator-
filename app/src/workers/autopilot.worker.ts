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
// Uses hourly check pattern so run hour can be changed in settings without restart
export async function startAutopilotScheduler(): Promise<void> {
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
