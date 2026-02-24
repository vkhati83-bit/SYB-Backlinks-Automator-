/**
 * Decision Maker Service
 *
 * Scores contacts based on role, title, and source to identify
 * the best decision-makers for outreach
 */

import logger from '../utils/logger.js';

interface ContactCandidate {
  email: string;
  name?: string;
  title?: string;
  role?: string;
  linkedin_url?: string;
  source: string;
  confidence_tier?: string;
  source_metadata?: Record<string, any>;
}

export interface ScoredContact extends ContactCandidate {
  confidence_score: number;
  score_breakdown: {
    base_score: number;
    title_bonus: number;
    source_bonus: number;
    linkedin_bonus: number;
    role_penalty: number;
    final_score: number;
  };
  tier: 'A+' | 'A' | 'B' | 'C' | 'D';
}

// Decision-maker keywords (highest priority)
const DECISION_MAKER_TITLES = [
  'founder', 'ceo', 'chief executive', 'owner', 'president', 'principal',
  'editor-in-chief', 'editorial director', 'managing editor'
];

// Content decision-makers (high priority)
const CONTENT_DECISION_TITLES = [
  'editor', 'content director', 'content manager', 'managing partner',
  'head of content', 'editorial', 'publisher', 'writer', 'author',
  'blog manager', 'communications director'
];

// Marketing/PR roles (medium priority)
const MARKETING_TITLES = [
  'marketing', 'communications', 'pr manager', 'outreach', 'partnerships',
  'business development', 'growth', 'digital marketing'
];

// Generic/low priority
const ROLE_EMAILS = [
  'info', 'contact', 'hello', 'team', 'support', 'general', 'admin'
];

/**
 * Calculate title bonus based on role keywords
 */
function calculateTitleBonus(title?: string, role?: string): number {
  if (!title && !role) return 0;

  const combined = `${title || ''} ${role || ''}`.toLowerCase();

  // Decision maker = +40 points
  if (DECISION_MAKER_TITLES.some(keyword => combined.includes(keyword))) {
    return 40;
  }

  // Content decision maker = +30 points
  if (CONTENT_DECISION_TITLES.some(keyword => combined.includes(keyword))) {
    return 30;
  }

  // Marketing/PR = +20 points
  if (MARKETING_TITLES.some(keyword => combined.includes(keyword))) {
    return 20;
  }

  // Has a title but not a strong one = +10 points
  if (title && title.length > 0) {
    return 10;
  }

  return 0;
}

/**
 * Calculate source bonus based on where contact was found
 */
function calculateSourceBonus(source: string): number {
  switch (source.toLowerCase()) {
    case 'linkedin':
    case 'snov_domain_search':
    case 'snov_email_finder':
      return 20; // API-sourced with structured data

    case 'scraped':
    case 'scraped_author':
    case 'scraped_team_page':
      return 15; // Website scraping with context

    case 'claude_analysis':
      return 10; // AI-extracted from content

    case 'pattern':
    case 'generated':
      return 0; // Generic pattern-based

    default:
      return 5; // Unknown source
  }
}

/**
 * Check if email is role-based (penalize generic emails)
 */
function calculateRolePenalty(email: string): number {
  const emailLocal = email.split('@')[0].toLowerCase();

  if (ROLE_EMAILS.some(role => emailLocal === role || emailLocal.startsWith(role))) {
    return -20; // Generic role emails get penalized
  }

  return 0;
}

/**
 * Score a single contact candidate
 */
export function scoreContact(contact: ContactCandidate): ScoredContact {
  const baseScore = 30; // Start at 30

  const titleBonus = calculateTitleBonus(contact.title, contact.role);
  const sourceBonus = calculateSourceBonus(contact.source);
  const linkedinBonus = contact.linkedin_url ? 15 : 0;
  const rolePenalty = calculateRolePenalty(contact.email);

  const finalScore = Math.max(0, Math.min(100,
    baseScore + titleBonus + sourceBonus + linkedinBonus + rolePenalty
  ));

  // Assign tier based on score
  let tier: 'A+' | 'A' | 'B' | 'C' | 'D';
  if (finalScore >= 90) tier = 'A+';
  else if (finalScore >= 70) tier = 'A';
  else if (finalScore >= 50) tier = 'B';
  else if (finalScore >= 30) tier = 'C';
  else tier = 'D';

  return {
    ...contact,
    confidence_score: finalScore,
    score_breakdown: {
      base_score: baseScore,
      title_bonus: titleBonus,
      source_bonus: sourceBonus,
      linkedin_bonus: linkedinBonus,
      role_penalty: rolePenalty,
      final_score: finalScore,
    },
    tier,
  };
}

/**
 * Score multiple contacts and rank them
 */
export function scoreAndRankContacts(
  contacts: ContactCandidate[]
): ScoredContact[] {
  const scored = contacts.map(contact => scoreContact(contact));

  // Sort by score (highest first)
  scored.sort((a, b) => b.confidence_score - a.confidence_score);

  logger.debug(`Scored ${contacts.length} contacts:`, {
    total: contacts.length,
    tier_A_plus: scored.filter(c => c.tier === 'A+').length,
    tier_A: scored.filter(c => c.tier === 'A').length,
    tier_B: scored.filter(c => c.tier === 'B').length,
    tier_C: scored.filter(c => c.tier === 'C').length,
    tier_D: scored.filter(c => c.tier === 'D').length,
  });

  return scored;
}

/**
 * Select best contacts for outreach
 * Returns 1-2 high-quality contacts instead of 3 random ones
 */
export function selectBestContacts(
  scoredContacts: ScoredContact[],
  maxContacts: number = 2
): ScoredContact[] {
  if (scoredContacts.length === 0) return [];

  const selected: ScoredContact[] = [];

  // Always take the best contact if score >= 50
  const best = scoredContacts[0];
  if (best.confidence_score >= 50) {
    selected.push(best);
  }

  // Take a second contact if:
  // 1. We have more than one contact
  // 2. Second contact score >= 50
  // 3. Second contact is different enough from first
  if (scoredContacts.length > 1 && selected.length < maxContacts) {
    const second = scoredContacts[1];
    if (second.confidence_score >= 50) {
      // Check if it's sufficiently different (not just info@ vs contact@)
      const isDifferent = second.email.split('@')[0] !== best.email.split('@')[0];
      if (isDifferent) {
        selected.push(second);
      }
    }
  }

  // If we still have no contacts, take the best one even if score < 50
  if (selected.length === 0 && scoredContacts.length > 0) {
    selected.push(scoredContacts[0]);
  }

  logger.debug(`Selected ${selected.length} contacts from ${scoredContacts.length} candidates:`, {
    scores: selected.map(c => c.confidence_score),
    tiers: selected.map(c => c.tier),
  });

  return selected;
}

/**
 * Analyze contact quality for a prospect
 */
export function analyzeContactQuality(contacts: ScoredContact[]): {
  has_decision_maker: boolean;
  has_content_decision_maker: boolean;
  best_contact_score: number;
  best_contact_tier: string;
  total_high_quality: number;
  needs_manual_search: boolean;
} {
  if (contacts.length === 0) {
    return {
      has_decision_maker: false,
      has_content_decision_maker: false,
      best_contact_score: 0,
      best_contact_tier: 'D',
      total_high_quality: 0,
      needs_manual_search: true,
    };
  }

  const best = contacts[0];
  const hasDecisionMaker = contacts.some(c => c.confidence_score >= 70);
  const hasContentDecisionMaker = contacts.some(c =>
    c.confidence_score >= 70 &&
    CONTENT_DECISION_TITLES.some(keyword =>
      `${c.title || ''} ${c.role || ''}`.toLowerCase().includes(keyword)
    )
  );

  const highQuality = contacts.filter(c => c.confidence_score >= 70);

  return {
    has_decision_maker: hasDecisionMaker,
    has_content_decision_maker: hasContentDecisionMaker,
    best_contact_score: best.confidence_score,
    best_contact_tier: best.tier,
    total_high_quality: highQuality.length,
    needs_manual_search: best.confidence_score < 50,
  };
}

export default {
  scoreContact,
  scoreAndRankContacts,
  selectBestContacts,
  analyzeContactQuality,
};
