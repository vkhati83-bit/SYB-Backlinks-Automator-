/**
 * Email Validator Service
 *
 * Validates email deliverability using:
 * 1. DNS MX record checks (free)
 * 2. Hunter.io Email Verifier (paid, optional)
 * 3. Pattern validation
 */

import dns from 'dns';
import { promisify } from 'util';
import logger from '../utils/logger.js';
import { getCachedEmailVerification, cacheEmailVerification } from './contact-cache.service.js';

const resolveMx = promisify(dns.resolveMx);

const HUNTER_API_KEY = process.env.HUNTER_API_KEY;
const HUNTER_VERIFY_COST_CENTS = 1; // ~$0.01 per verification

interface EmailValidationResult {
  email: string;
  status: 'valid' | 'invalid' | 'risky' | 'unknown';
  score: number; // 0-100
  reason?: string;
  deliverable: boolean;
  mx_records_exist: boolean;
  smtp_check?: boolean;
  free_email?: boolean;
  disposable?: boolean;
  role_email?: boolean;
  api_cost_cents: number;
  method: 'dns_only' | 'hunter_api' | 'pattern_only';
}

/**
 * Basic email pattern validation
 */
function isValidEmailPattern(email: string): boolean {
  const pattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return pattern.test(email);
}

/**
 * Check if email is a common role-based email
 */
function isRoleEmail(email: string): boolean {
  const rolePatterns = [
    'info@', 'contact@', 'support@', 'sales@', 'hello@', 'admin@',
    'team@', 'help@', 'service@', 'inquiries@', 'general@'
  ];
  return rolePatterns.some(pattern => email.toLowerCase().startsWith(pattern));
}

/**
 * Check if email is from a free provider
 */
function isFreeEmail(email: string): boolean {
  const freeProviders = [
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
    'icloud.com', 'mail.com', 'protonmail.com', 'zoho.com'
  ];
  const domain = email.split('@')[1]?.toLowerCase();
  return freeProviders.includes(domain);
}

/**
 * Check MX records (DNS validation - free)
 */
async function checkMXRecords(email: string): Promise<boolean> {
  try {
    const domain = email.split('@')[1];
    const mxRecords = await resolveMx(domain);
    return mxRecords && mxRecords.length > 0;
  } catch (error) {
    logger.debug(`MX check failed for ${email}:`, error);
    return false;
  }
}

/**
 * Validate email using Hunter.io API (paid)
 */
async function validateWithHunter(email: string): Promise<{
  status: 'valid' | 'invalid' | 'risky' | 'unknown';
  score: number;
  smtp_check?: boolean;
  free_email?: boolean;
  disposable?: boolean;
}> {
  if (!HUNTER_API_KEY) {
    throw new Error('Hunter.io API key not configured');
  }

  try {
    const response = await fetch(
      `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${HUNTER_API_KEY}`
    );

    if (!response.ok) {
      throw new Error(`Hunter API error: ${response.status}`);
    }

    const data = await response.json() as any;

    if (data.data) {
      const { status, score, smtp_check, mx_records, free, disposable } = data.data;

      // Map Hunter status to our status
      let mappedStatus: 'valid' | 'invalid' | 'risky' | 'unknown' = 'unknown';
      if (status === 'valid') mappedStatus = 'valid';
      else if (status === 'invalid') mappedStatus = 'invalid';
      else if (status === 'risky' || status === 'accept_all') mappedStatus = 'risky';
      else mappedStatus = 'unknown';

      return {
        status: mappedStatus,
        score: score || 0,
        smtp_check: smtp_check === true,
        free_email: free === true,
        disposable: disposable === true,
      };
    }

    throw new Error('Invalid response from Hunter API');
  } catch (error: any) {
    logger.error('Hunter email verification failed:', error);
    throw error;
  }
}

/**
 * Validate email with caching and multiple methods
 */
export async function validateEmail(
  email: string,
  useHunterAPI: boolean = false
): Promise<EmailValidationResult> {
  // Check cache first
  const cached = await getCachedEmailVerification(email);
  if (cached) {
    return {
      email,
      status: cached.status,
      score: cached.score,
      deliverable: cached.status === 'valid',
      mx_records_exist: true,
      api_cost_cents: 0, // Cache hit = no cost
      method: 'dns_only',
      ...cached.metadata,
    };
  }

  // Basic pattern validation
  if (!isValidEmailPattern(email)) {
    const result: EmailValidationResult = {
      email,
      status: 'invalid',
      score: 0,
      reason: 'Invalid email format',
      deliverable: false,
      mx_records_exist: false,
      api_cost_cents: 0,
      method: 'pattern_only',
    };
    await cacheEmailVerification(email, result);
    return result;
  }

  const isRole = isRoleEmail(email);
  const isFree = isFreeEmail(email);

  // Check MX records (free)
  const hasMX = await checkMXRecords(email);

  if (!hasMX) {
    const result: EmailValidationResult = {
      email,
      status: 'invalid',
      score: 0,
      reason: 'No MX records found',
      deliverable: false,
      mx_records_exist: false,
      api_cost_cents: 0,
      method: 'dns_only',
    };
    await cacheEmailVerification(email, result);
    return result;
  }

  // If Hunter.io is enabled and available, use it for detailed validation
  if (useHunterAPI && HUNTER_API_KEY) {
    try {
      const hunterResult = await validateWithHunter(email);

      const result: EmailValidationResult = {
        email,
        status: hunterResult.status,
        score: hunterResult.score,
        deliverable: hunterResult.status === 'valid',
        mx_records_exist: true,
        smtp_check: hunterResult.smtp_check,
        free_email: hunterResult.free_email,
        disposable: hunterResult.disposable,
        role_email: isRole,
        api_cost_cents: HUNTER_VERIFY_COST_CENTS,
        method: 'hunter_api',
      };

      await cacheEmailVerification(email, {
        status: result.status,
        score: result.score,
        metadata: {
          smtp_check: result.smtp_check,
          free_email: result.free_email,
          disposable: result.disposable,
          role_email: result.role_email,
        },
      });

      return result;
    } catch (error) {
      logger.warn('Hunter API failed, falling back to DNS only:', error);
      // Fall through to DNS-only result below
    }
  }

  // DNS-only validation (free)
  let score = 50; // Base score for valid MX
  let status: 'valid' | 'risky' | 'unknown' = 'valid';

  if (isRole) {
    score -= 20;
    status = 'risky';
  }
  if (isFree) {
    score -= 10;
  }

  const result: EmailValidationResult = {
    email,
    status,
    score: Math.max(0, score),
    deliverable: hasMX,
    mx_records_exist: hasMX,
    free_email: isFree,
    role_email: isRole,
    api_cost_cents: 0,
    method: 'dns_only',
  };

  await cacheEmailVerification(email, {
    status: result.status,
    score: result.score,
    metadata: {
      free_email: result.free_email,
      role_email: result.role_email,
    },
  });

  return result;
}

/**
 * Batch validate multiple emails
 */
export async function validateEmailsBatch(
  emails: string[],
  useHunterAPI: boolean = false
): Promise<EmailValidationResult[]> {
  const results: EmailValidationResult[] = [];

  for (const email of emails) {
    try {
      const result = await validateEmail(email, useHunterAPI);
      results.push(result);

      // Rate limit to avoid overwhelming APIs
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      logger.error(`Email validation failed for ${email}:`, error);
      results.push({
        email,
        status: 'unknown',
        score: 0,
        deliverable: false,
        mx_records_exist: false,
        api_cost_cents: 0,
        method: 'pattern_only',
        reason: 'Validation error',
      });
    }
  }

  return results;
}

export default {
  validateEmail,
  validateEmailsBatch,
};
