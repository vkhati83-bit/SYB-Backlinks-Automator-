import env from '../config/env.js';
import logger from './logger.js';

// healthchecks.io ping wrapper.
//
// Why this exists: the 2026-05 → 06 stall was SILENT. Autopilot ran cleanly every day and
// exited 0, but queued 0 emails for seven weeks. A plain "the cron fired" liveness ping would
// have shown green the whole time. So these checks watch OUTCOMES, not mere execution:
//   - autopilot check: /start when a run begins, success when it produced work (or was
//     legitimately idle: disabled / daily cap reached), /fail when it was enabled and needed
//     to send but came up empty. A dead run pings nothing → healthchecks.io fires on the grace.
//   - emails check: a dead-man switch pinged on every real send. If no email flows within the
//     check's period (set to 3 days), healthchecks.io alerts — regardless of the upstream cause.
//
// Both URLs are optional. Unset (local dev, or before setup) → every call is a silent no-op,
// so monitoring never becomes a dependency of the pipeline itself.

type PingSuffix = '' | '/start' | '/fail';

async function ping(baseUrl: string | undefined, suffix: PingSuffix, body?: string): Promise<void> {
  if (!baseUrl) return; // monitoring not configured — no-op

  const url = `${baseUrl}${suffix}`;
  try {
    await fetch(url, {
      method: 'POST',
      body: body ?? '',
      // Never let a slow/unreachable monitoring endpoint stall the worker.
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    // A monitoring outage must never break outreach. Log and move on.
    logger.warn(`healthcheck ping failed (${suffix || 'success'}): ${(err as Error).message}`);
  }
}

export const healthcheck = {
  autopilotStart: (body?: string) => ping(env.HEALTHCHECKS_AUTOPILOT_URL, '/start', body),
  autopilotSuccess: (body?: string) => ping(env.HEALTHCHECKS_AUTOPILOT_URL, '', body),
  autopilotFail: (body?: string) => ping(env.HEALTHCHECKS_AUTOPILOT_URL, '/fail', body),
  emailSent: (body?: string) => ping(env.HEALTHCHECKS_EMAILS_URL, '', body),
};

export default healthcheck;
