import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from parent directory (where our main .env lives)
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const envSchema = z.object({
  // Node
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000').transform(Number),

  // Database - Backlinks Gen (our own)
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Database - SEO Command Center (read-only)
  SEO_DATABASE_URL: z.string().min(1, 'SEO_DATABASE_URL is required'),

  // Database - Research DB (shieldyourbody.com/research)
  RESEARCH_DATABASE_URL: z.string().optional(),

  // Redis
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  // Resend
  RESEND_API_KEY: z.string().min(1, 'RESEND_API_KEY is required'),
  OUTREACH_FROM_EMAIL: z.string().email().default('outreach@shieldyourbody.com'),
  TEST_EMAIL_RECIPIENT: z.string().email().default('vicky@shieldyourbody.com'),

  // Anthropic
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
  CLAUDE_MODEL: z.string().default('claude-sonnet-4-20250514'),

  // App Config
  DAILY_SEND_LIMIT: z.string().default('20').transform(Number),
  FOLLOWUP_1_DELAY_DAYS: z.string().default('4').transform(Number),
  FOLLOWUP_2_DELAY_DAYS: z.string().default('8').transform(Number),

  // Snov.io (paid contact finder + email verifier)
  SNOV_CLIENT_ID: z.string().optional(),
  SNOV_CLIENT_SECRET: z.string().optional(),

  // Safety
  SAFETY_MODE: z.enum(['test', 'live']).default('test'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

// Safety check - in test mode, all emails go to test recipient
export const getEmailRecipient = (intendedRecipient: string): string => {
  if (env.SAFETY_MODE === 'test') {
    console.log(`🛡️ SAFETY MODE: Redirecting email from ${intendedRecipient} to ${env.TEST_EMAIL_RECIPIENT}`);
    return env.TEST_EMAIL_RECIPIENT;
  }
  return intendedRecipient;
};

export default env;
