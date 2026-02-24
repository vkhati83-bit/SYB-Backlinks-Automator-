/**
 * Email Validator Service
 *
 * Validates email deliverability using:
 * 1. DNS MX record checks (free)
 * 2. Snov.io Email Verifier (paid, optional)
 * 3. Pattern validation
 */

import dns from 'dns';
import { promisify } from 'util';
import logger from '../utils/logger.js';
import { getCachedEmailVerification, cacheEmailVerification } from './contact-cache.service.js';
import { isSnovConfigured, verifyEmail as snovVerifyEmail } from './snov.service.js';

const resolveMx = promisify(dns.resolveMx);

const SNOV_VERIFY_COST_CENTS = 1; // 1 credit ≈ $0.01 per verification

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
  method: 'dns_only' | 'snov_api' | 'pattern_only';
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
 * Validate email using Snov.io API (paid)
 */
async function validateWithSnov(email: string): Promise<{
  status: 'valid' | 'invalid' | 'risky' | 'unknown';
  score: number;
  free_email?: boolean;
  disposable?: boolean;
}> {
  if (!isSnovConfigured()) {
    throw new Error('Snov.io API not configured');
  }

  const result = await snovVerifyEmail(email);

  // Convert Snov status to a score
  let score = 50;
  if (result.status === 'valid') score = 95;
  else if (result.status === 'risky') score = 50;
  else if (result.status === 'invalid') score = 0;
  else score = 30; // unknown

  return {
    status: result.status,
    score,
    free_email: result.isWebmail,
    disposable: result.isDisposable,
  };
}

/**
 * Validate email with caching and multiple methods
 */
export async function validateEmail(
  email: string,
  useSnovAPI: boolean = false
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

  // If Snov.io is enabled and available, use it for detailed validation
  if (useSnovAPI && isSnovConfigured()) {
    try {
      const snovResult = await validateWithSnov(email);

      const result: EmailValidationResult = {
        email,
        status: snovResult.status,
        score: snovResult.score,
        deliverable: snovResult.status === 'valid',
        mx_records_exist: true,
        free_email: snovResult.free_email,
        disposable: snovResult.disposable,
        role_email: isRole,
        api_cost_cents: SNOV_VERIFY_COST_CENTS,
        method: 'snov_api',
      };

      await cacheEmailVerification(email, {
        status: result.status,
        score: result.score,
        metadata: {
          free_email: result.free_email,
          disposable: result.disposable,
          role_email: result.role_email,
        },
      });

      return result;
    } catch (error) {
      logger.warn('Snov.io API failed, falling back to DNS only:', error);
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
  useSnovAPI: boolean = false
): Promise<EmailValidationResult[]> {
  const results: EmailValidationResult[] = [];

  for (const email of emails) {
    try {
      const result = await validateEmail(email, useSnovAPI);
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
