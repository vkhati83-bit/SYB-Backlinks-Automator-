import { Resend } from 'resend';
import env, { getEmailRecipient } from '../config/env.js';
import logger from '../utils/logger.js';

const resend = new Resend(env.RESEND_API_KEY);

export interface SendEmailInput {
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
  fromName?: string;
  fromEmail?: string;
}

export interface SendEmailResult {
  success: boolean;
  resendId?: string;
  error?: string;
  // true = the failure is terminal (e.g. malformed recipient); retrying will never help,
  // so the caller should mark the email dead instead of re-queuing it.
  permanent?: boolean;
}

// Same pattern the email-validator uses, so "valid to send" means one thing everywhere.
const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

// Contacts occasionally get scraped with a scheme prefix or as outright junk
// (e.g. "mailto:info@eyesafe.com", "http://info@mdrt.org", an "smp://…onion" address).
// Strip a recoverable "mailto:" wrapper, then hard-validate. Returns the clean address or
// null if it can never be a real recipient — the last gate before Resend.
export function normalizeRecipient(raw: string): string | null {
  const cleaned = raw.trim().replace(/^mailto:/i, '').trim();
  return EMAIL_PATTERN.test(cleaned) ? cleaned : null;
}

// Convert plain text body to HTML with proper paragraph grouping
function textToHtml(text: string): string {
  // Split on double newlines for paragraph breaks
  const paragraphs = text.split(/\n\n+/);
  return paragraphs
    .map(para => {
      if (!para.trim()) return '';
      // Within a paragraph, convert single newlines to <br>
      const html = para.trim().replace(/\n/g, '<br>');
      return `<p>${html}</p>`;
    })
    .filter(p => p !== '')
    .join('\n');
}

// Send email via Resend
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  // Validate the INTENDED recipient before anything else. Doing it pre-redirect matters:
  // in test mode getEmailRecipient() rewrites the address to a known-good test inbox, which
  // would mask a garbage contact and let it sit in the queue forever.
  const cleanRecipient = normalizeRecipient(input.to);
  if (!cleanRecipient) {
    logger.warn(`Rejecting email — recipient is not a valid address: "${input.to}"`);
    return {
      success: false,
      error: `Invalid recipient address: "${input.to}"`,
      permanent: true,
    };
  }

  // Apply safety mode redirect (now reads from DB)
  const actualRecipient = await getEmailRecipient(cleanRecipient);

  try {
    logger.info(`Sending email to: ${actualRecipient}`, {
      originalRecipient: input.to,
      subject: input.subject.substring(0, 50),
    });

    const senderName = input.fromName || 'SYB Research Team';
    const senderEmail = input.fromEmail || env.OUTREACH_FROM_EMAIL;

    const result = await resend.emails.send({
      from: `${senderName} <${senderEmail}>`,
      to: actualRecipient,
      bcc: 'vicky@healthiertech.co',
      subject: input.subject,
      html: textToHtml(input.body),
      text: input.body,
      replyTo: input.replyTo || senderEmail,
      headers: {
        'X-Entity-Ref-ID': `syb-backlinks-${Date.now()}`,
      },
    });

    if (result.error) {
      logger.error('Resend API error:', result.error);
      return {
        success: false,
        error: result.error.message,
      };
    }

    logger.info(`Email sent successfully: ${result.data?.id}`, {
      recipient: actualRecipient,
    });

    return {
      success: true,
      resendId: result.data?.id,
    };
  } catch (error: any) {
    logger.error('Failed to send email:', error);
    return {
      success: false,
      error: error.message || 'Unknown error',
    };
  }
}

// Get email delivery status from Resend
export async function getEmailStatus(resendId: string): Promise<{
  status: string;
  deliveredAt?: Date;
  openedAt?: Date;
  clickedAt?: Date;
} | null> {
  try {
    const result = await resend.emails.get(resendId);

    if (result.error || !result.data) {
      return null;
    }

    return {
      status: (result.data as any).last_event || 'unknown',
      deliveredAt: (result.data as any).delivered_at ? new Date((result.data as any).delivered_at) : undefined,
      openedAt: (result.data as any).opened_at ? new Date((result.data as any).opened_at) : undefined,
      clickedAt: (result.data as any).clicked_at ? new Date((result.data as any).clicked_at) : undefined,
    };
  } catch (error) {
    logger.error(`Failed to get email status for ${resendId}:`, error);
    return null;
  }
}

export default {
  sendEmail,
  getEmailStatus,
};
