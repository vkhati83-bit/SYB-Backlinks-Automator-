/**
 * Snov.io API Service
 *
 * Handles OAuth token management and wraps all Snov.io endpoints:
 * - Domain Search (find emails at a domain)
 * - Email Finder (find email by name + domain)
 * - Email Verification
 * - Domain Email Count (free)
 *
 * Rate limit: 60 requests per minute
 * All search endpoints are async (start → poll for result)
 */

import logger from '../utils/logger.js';

const SNOV_CLIENT_ID = process.env.SNOV_CLIENT_ID;
const SNOV_CLIENT_SECRET = process.env.SNOV_CLIENT_SECRET;

const API_BASE = 'https://api.snov.io';
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 15; // 30s max wait

// Token cache
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

/**
 * Get a valid OAuth access token (auto-refreshes when expired)
 */
async function getAccessToken(): Promise<string | null> {
  if (!SNOV_CLIENT_ID || !SNOV_CLIENT_SECRET) {
    return null;
  }

  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  try {
    const response = await fetch(`${API_BASE}/v1/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: SNOV_CLIENT_ID,
        client_secret: SNOV_CLIENT_SECRET,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      logger.error(`Snov.io auth failed: ${response.status}`);
      return null;
    }

    const data = await response.json() as any;
    cachedToken = data.access_token;
    tokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;
    logger.debug('Snov.io token refreshed');
    return cachedToken;
  } catch (error) {
    logger.error('Snov.io auth error:', error);
    return null;
  }
}

/**
 * Make an authenticated request to Snov.io
 */
async function snovRequest(
  method: 'GET' | 'POST',
  path: string,
  body?: Record<string, any>
): Promise<any> {
  const token = await getAccessToken();
  if (!token) return null;

  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const options: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(15000),
  };

  if (body && method === 'POST') {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Snov.io API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Poll an async task until it completes or times out
 */
async function pollForResult(resultUrl: string): Promise<any> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const result = await snovRequest('GET', resultUrl);
    if (!result) return null;

    if (result.status === 'completed' || result.status === 'ready' || !result.status) {
      return result;
    }

    if (result.status === 'error' || result.status === 'failed') {
      logger.error('Snov.io task failed:', result);
      return null;
    }

    // Still in progress — wait and retry
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }

  logger.warn('Snov.io poll timed out');
  return null;
}

// ─── Public API ───────────────────────────────────────────────

export function isSnovConfigured(): boolean {
  return !!(SNOV_CLIENT_ID && SNOV_CLIENT_SECRET);
}

/**
 * Domain Email Count (FREE — no credits)
 * Returns how many emails Snov knows about at this domain
 */
export async function getDomainEmailCount(domain: string): Promise<number> {
  try {
    const data = await snovRequest('POST', '/v1/get-domain-emails-count', { domain });
    return data?.result || 0;
  } catch (error) {
    logger.debug(`Snov domain count failed for ${domain}:`, error);
    return 0;
  }
}

/**
 * Domain Email Search — find all known emails at a domain
 * Uses /v2/domain-search/domain-emails (returns actual emails)
 * Cost: 1 credit per unique domain search
 */
export async function domainSearch(domain: string): Promise<{
  contacts: Array<{
    email: string;
    name: string;
    firstName: string;
    lastName: string;
    position?: string;
    sourceUrl?: string;
    status?: string;
  }>;
  cost_credits: number;
}> {
  try {
    // Start the async domain-emails task (NOT /domain-search which returns company info)
    const startResult = await snovRequest('POST', '/v2/domain-search/domain-emails/start', { domain });
    const taskHash = startResult?.meta?.task_hash || startResult?.task_hash;
    if (!taskHash) {
      logger.debug(`Snov.io domain-emails: no task_hash returned for ${domain}`);
      return { contacts: [], cost_credits: 0 };
    }

    // Poll for results
    const result = await pollForResult(`/v2/domain-search/domain-emails/result/${taskHash}`);
    if (!result?.data || !Array.isArray(result.data)) {
      return { contacts: [], cost_credits: 1 };
    }

    const contacts = result.data
      .filter((item: any) => item.email)
      .map((item: any) => ({
        email: item.email,
        name: `${item.first_name || ''} ${item.last_name || ''}`.trim(),
        firstName: item.first_name || '',
        lastName: item.last_name || '',
        position: item.position || undefined,
        sourceUrl: item.source_url || undefined,
        status: item.smtp_status || undefined,
      }));

    logger.info(`Snov.io domain search found ${contacts.length} emails for ${domain}`);
    return { contacts, cost_credits: 1 };
  } catch (error) {
    logger.error(`Snov.io domain search failed for ${domain}:`, error);
    return { contacts: [], cost_credits: 0 };
  }
}

/**
 * Find email by first name + last name + domain
 * Cost: 1 credit per email found with valid/unknown status
 */
export async function findEmailByName(
  firstName: string,
  lastName: string,
  domain: string
): Promise<{
  email?: string;
  status?: string;
  cost_credits: number;
}> {
  try {
    const startResult = await snovRequest('POST', '/v2/emails-by-domain-by-name/start', {
      items: [{ first_name: firstName, last_name: lastName, domain }],
    });

    const taskHash = startResult?.meta?.task_hash || startResult?.task_hash;
    if (!taskHash) {
      return { cost_credits: 0 };
    }

    const result = await pollForResult(
      `/v2/emails-by-domain-by-name/result?task_hash=${taskHash}`
    );

    if (!result?.data || !Array.isArray(result.data) || result.data.length === 0) {
      return { cost_credits: 1 };
    }

    const item = result.data[0];
    if (item?.email) {
      logger.info(`Snov.io found email for ${firstName} ${lastName} @ ${domain}: ${item.email}`);
      return {
        email: item.email,
        status: item.smtp_status,
        cost_credits: 1,
      };
    }

    return { cost_credits: 1 };
  } catch (error) {
    logger.error(`Snov.io email finder failed for ${firstName} ${lastName} @ ${domain}:`, error);
    return { cost_credits: 0 };
  }
}

/**
 * Verify an email address
 * Cost: 1 credit per verification
 */
export async function verifyEmail(email: string): Promise<{
  status: 'valid' | 'invalid' | 'risky' | 'unknown';
  isValidFormat: boolean;
  isDisposable: boolean;
  isWebmail: boolean;
  cost_credits: number;
}> {
  const fallback = {
    status: 'unknown' as const,
    isValidFormat: true,
    isDisposable: false,
    isWebmail: false,
    cost_credits: 0,
  };

  try {
    const startResult = await snovRequest('POST', '/v2/email-verification/start', {
      emails: [email],
    });

    const taskHash = startResult?.meta?.task_hash || startResult?.task_hash;
    if (!taskHash) {
      return fallback;
    }

    const result = await pollForResult(
      `/v2/email-verification/result?task_hash=${taskHash}`
    );

    if (!result?.data || !Array.isArray(result.data) || result.data.length === 0) {
      return { ...fallback, cost_credits: 1 };
    }

    const item = result.data[0];

    // Map Snov smtp_status to our status
    let mappedStatus: 'valid' | 'invalid' | 'risky' | 'unknown' = 'unknown';
    const smtpStatus = (item.smtp_status || '').toLowerCase();
    if (smtpStatus === 'valid') mappedStatus = 'valid';
    else if (smtpStatus === 'invalid') mappedStatus = 'invalid';
    else if (smtpStatus === 'risky' || smtpStatus === 'catch-all') mappedStatus = 'risky';

    return {
      status: mappedStatus,
      isValidFormat: item.is_valid_format !== false,
      isDisposable: item.is_disposable === true,
      isWebmail: item.is_webmail === true,
      cost_credits: 1,
    };
  } catch (error) {
    logger.error(`Snov.io email verification failed for ${email}:`, error);
    return fallback;
  }
}

/**
 * Get profile info by email (enrichment)
 * Cost: 1 credit (no charge if no data found)
 */
export async function getProfileByEmail(email: string): Promise<{
  name?: string;
  firstName?: string;
  lastName?: string;
  currentJobs?: Array<{ companyName: string; position: string }>;
  social?: Array<{ link: string; type: string }>;
  cost_credits: number;
} | null> {
  try {
    const data = await snovRequest('POST', '/v1/get-profile-by-email', { email });
    if (!data?.success || !data.data) return null;

    const profile = data.data;
    return {
      name: profile.name || undefined,
      firstName: profile.firstName || undefined,
      lastName: profile.lastName || undefined,
      currentJobs: profile.currentJobs?.map((j: any) => ({
        companyName: j.companyName,
        position: j.position,
      })),
      social: profile.social?.map((s: any) => ({
        link: s.link,
        type: s.type,
      })),
      cost_credits: 1,
    };
  } catch (error) {
    logger.debug(`Snov.io profile lookup failed for ${email}:`, error);
    return null;
  }
}

export default {
  isSnovConfigured,
  getDomainEmailCount,
  domainSearch,
  findEmailByName,
  verifyEmail,
  getProfileByEmail,
};
