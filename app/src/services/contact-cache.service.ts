/**
 * Contact Cache Service
 *
 * Caches contact finding results to reduce API costs
 * Uses Redis with 30-day TTL
 */

import redis from '../config/redis.js';
import logger from '../utils/logger.js';

const CACHE_PREFIX = 'contact:';
const CACHE_TTL = 30 * 24 * 60 * 60; // 30 days in seconds

interface CachedContact {
  email: string;
  name?: string;
  title?: string;
  role?: string;
  linkedin_url?: string;
  confidence_score: number;
  source: string;
  source_metadata?: Record<string, any>;
  cached_at: string;
}

interface CachedDomainSearch {
  contacts: CachedContact[];
  total_found: number;
  searched_at: string;
}

/**
 * Generate cache key for domain contact search
 */
function getDomainCacheKey(domain: string): string {
  return `${CACHE_PREFIX}domain:${domain.toLowerCase()}`;
}

/**
 * Generate cache key for email verification
 */
function getEmailVerificationCacheKey(email: string): string {
  return `${CACHE_PREFIX}verify:${email.toLowerCase()}`;
}

/**
 * Generate cache key for name + domain lookup
 */
function getNameDomainCacheKey(name: string, domain: string): string {
  const normalized = name.toLowerCase().replace(/\s+/g, '-');
  return `${CACHE_PREFIX}name:${normalized}@${domain.toLowerCase()}`;
}

/**
 * Cache contact search results for a domain
 */
export async function cacheDomainSearch(
  domain: string,
  contacts: CachedContact[]
): Promise<void> {
  try {
    const key = getDomainCacheKey(domain);
    const data: CachedDomainSearch = {
      contacts,
      total_found: contacts.length,
      searched_at: new Date().toISOString(),
    };

    await redis.setex(key, CACHE_TTL, JSON.stringify(data));
    logger.debug(`Cached ${contacts.length} contacts for domain: ${domain}`);
  } catch (error) {
    logger.error('Error caching domain search:', error);
  }
}

/**
 * Get cached contact search results for a domain
 */
export async function getCachedDomainSearch(
  domain: string
): Promise<CachedDomainSearch | null> {
  try {
    const key = getDomainCacheKey(domain);
    const cached = await redis.get(key);

    if (cached) {
      logger.debug(`Cache HIT for domain: ${domain}`);
      return JSON.parse(cached);
    }

    logger.debug(`Cache MISS for domain: ${domain}`);
    return null;
  } catch (error) {
    logger.error('Error getting cached domain search:', error);
    return null;
  }
}

/**
 * Cache email verification result
 */
export async function cacheEmailVerification(
  email: string,
  result: {
    status: 'valid' | 'invalid' | 'risky' | 'unknown';
    score: number;
    metadata?: Record<string, any>;
  }
): Promise<void> {
  try {
    const key = getEmailVerificationCacheKey(email);
    const data = {
      ...result,
      verified_at: new Date().toISOString(),
    };

    await redis.setex(key, CACHE_TTL, JSON.stringify(data));
    logger.debug(`Cached email verification for: ${email}`);
  } catch (error) {
    logger.error('Error caching email verification:', error);
  }
}

/**
 * Get cached email verification result
 */
export async function getCachedEmailVerification(
  email: string
): Promise<{
  status: 'valid' | 'invalid' | 'risky' | 'unknown';
  score: number;
  metadata?: Record<string, any>;
  verified_at: string;
} | null> {
  try {
    const key = getEmailVerificationCacheKey(email);
    const cached = await redis.get(key);

    if (cached) {
      logger.debug(`Cache HIT for email verification: ${email}`);
      return JSON.parse(cached);
    }

    logger.debug(`Cache MISS for email verification: ${email}`);
    return null;
  } catch (error) {
    logger.error('Error getting cached email verification:', error);
    return null;
  }
}

/**
 * Cache name + domain lookup result
 */
export async function cacheNameDomainLookup(
  name: string,
  domain: string,
  email: string,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    const key = getNameDomainCacheKey(name, domain);
    const data = {
      email,
      name,
      domain,
      metadata,
      found_at: new Date().toISOString(),
    };

    await redis.setex(key, CACHE_TTL, JSON.stringify(data));
    logger.debug(`Cached name+domain lookup: ${name} @ ${domain}`);
  } catch (error) {
    logger.error('Error caching name+domain lookup:', error);
  }
}

/**
 * Get cached name + domain lookup result
 */
export async function getCachedNameDomainLookup(
  name: string,
  domain: string
): Promise<{
  email: string;
  name: string;
  domain: string;
  metadata?: Record<string, any>;
  found_at: string;
} | null> {
  try {
    const key = getNameDomainCacheKey(name, domain);
    const cached = await redis.get(key);

    if (cached) {
      logger.debug(`Cache HIT for name+domain: ${name} @ ${domain}`);
      return JSON.parse(cached);
    }

    logger.debug(`Cache MISS for name+domain: ${name} @ ${domain}`);
    return null;
  } catch (error) {
    logger.error('Error getting cached name+domain lookup:', error);
    return null;
  }
}

/**
 * Clear all cached data for a domain
 */
export async function clearDomainCache(domain: string): Promise<void> {
  try {
    const keys = await redis.keys(`${CACHE_PREFIX}*${domain.toLowerCase()}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
      logger.info(`Cleared ${keys.length} cache entries for domain: ${domain}`);
    }
  } catch (error) {
    logger.error('Error clearing domain cache:', error);
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  total_keys: number;
  domain_searches: number;
  email_verifications: number;
  name_lookups: number;
}> {
  try {
    const allKeys = await redis.keys(`${CACHE_PREFIX}*`);
    const domainKeys = allKeys.filter(k => k.includes(':domain:'));
    const verifyKeys = allKeys.filter(k => k.includes(':verify:'));
    const nameKeys = allKeys.filter(k => k.includes(':name:'));

    return {
      total_keys: allKeys.length,
      domain_searches: domainKeys.length,
      email_verifications: verifyKeys.length,
      name_lookups: nameKeys.length,
    };
  } catch (error) {
    logger.error('Error getting cache stats:', error);
    return {
      total_keys: 0,
      domain_searches: 0,
      email_verifications: 0,
      name_lookups: 0,
    };
  }
}

/**
 * Clear ALL contact cache entries (domain searches + email verifications + name lookups)
 */
export async function clearAllContactCache(): Promise<number> {
  try {
    const allKeys = await redis.keys(`${CACHE_PREFIX}*`);
    if (allKeys.length > 0) {
      await redis.del(...allKeys);
      logger.info(`Cleared ALL ${allKeys.length} contact cache entries`);
    }
    return allKeys.length;
  } catch (error) {
    logger.error('Error clearing all contact cache:', error);
    return 0;
  }
}

export default {
  cacheDomainSearch,
  getCachedDomainSearch,
  cacheEmailVerification,
  getCachedEmailVerification,
  cacheNameDomainLookup,
  getCachedNameDomainLookup,
  clearDomainCache,
  clearAllContactCache,
  getCacheStats,
};
