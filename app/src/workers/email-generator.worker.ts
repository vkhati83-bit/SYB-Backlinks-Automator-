import { Worker, Job } from 'bullmq';
import redis from '../config/redis.js';
import { QUEUE_NAMES } from '../config/queues.js';
import { generateOutreachEmail } from '../services/claude.service.js';
import { findResearchCategory } from '../services/research-matcher.service.js';
import { emailRepository, prospectRepository, contactRepository, auditRepository, settingsRepository } from '../db/repositories/index.js';
import logger from '../utils/logger.js';

export interface EmailGeneratorJobData {
  prospectId: string;
  contactId: string;
  campaignId?: string;
  templateId?: string;
}

// Worker processor
async function processEmailGeneratorJob(job: Job<EmailGeneratorJobData>): Promise<{ emailId: string; subject: string }> {
  const { prospectId, contactId, campaignId, templateId } = job.data;

  logger.info(`Generating email for prospect: ${prospectId}`, { jobId: job.id });

  // Get prospect and contact
  const [prospect, contact] = await Promise.all([
    prospectRepository.findById(prospectId),
    contactRepository.findById(contactId),
  ]);

  if (!prospect) {
    throw new Error(`Prospect not found: ${prospectId}`);
  }

  if (!contact) {
    throw new Error(`Contact not found: ${contactId}`);
  }

  // Load settings to get email templates
  const settings = await settingsRepository.getAll();
  const emailTemplate = prospect.opportunity_type === 'broken_link'
    ? (settings.email_template_broken_link || undefined)
    : (settings.email_template_research || undefined);

  // Look up research category for research_citation emails
  // When found, use the research DB as the primary citation URL (not the blog article)
  let researchCategoryName: string | undefined;
  let researchStudyCount: number | undefined;
  let suggestedArticleUrl = prospect.suggested_article_url;
  let suggestedArticleTitle = prospect.suggested_article_title;
  let matchReason = prospect.match_reason;

  if (prospect.opportunity_type === 'research_citation') {
    const researchMatch = await findResearchCategory(
      (prospect as any).keyword || '',
      prospect.title || '',
      prospect.url || ''
    );
    if (researchMatch) {
      researchCategoryName = researchMatch.searchTerm;
      researchStudyCount = researchMatch.studyCount;
      suggestedArticleUrl = researchMatch.researchUrl;
      suggestedArticleTitle = `${researchMatch.studyCount}+ peer-reviewed studies on "${researchMatch.searchTerm}"`;
      matchReason = `Directly relevant to their ${researchMatch.searchTerm} content`;
    } else {
      suggestedArticleUrl = 'https://www.shieldyourbody.com/research/studies?q=radiofrequency';
      suggestedArticleTitle = 'SYB EMF Research Database (3,600+ peer-reviewed studies)';
      matchReason = matchReason || 'Relevant EMF research they can cite';
    }
  }

  // Generate email using Claude
  const generated = await generateOutreachEmail({
    prospectUrl: prospect.url,
    prospectDomain: prospect.domain,
    prospectTitle: prospect.title,
    prospectDescription: prospect.description,
    contactName: contact.name,
    contactEmail: contact.email,
    opportunityType: prospect.opportunity_type,
    pageContent: (prospect as any).page_content || undefined,
    suggestedArticleUrl,
    suggestedArticleTitle,
    matchReason,
    brokenUrl: (prospect as any).broken_url,
    researchCategoryName,
    researchStudyCount,
    emailTemplate: emailTemplate || undefined,
  });

  // Save email to database
  const email = await emailRepository.create({
    prospect_id: prospectId,
    contact_id: contactId,
    campaign_id: campaignId,
    template_id: templateId,
    subject: generated.subject,
    body: generated.body,
  });

  // Update prospect status
  await prospectRepository.updateStatus(prospectId, 'email_generated');

  // Log audit
  await auditRepository.logEmailGenerated(email.id, prospectId);

  logger.info(`Email generated successfully: ${email.id}`, {
    jobId: job.id,
    subject: generated.subject.substring(0, 50),
  });

  return {
    emailId: email.id,
    subject: generated.subject,
  };
}

// Create and start worker
export function createEmailGeneratorWorker() {
  const worker = new Worker(QUEUE_NAMES.EMAIL_GENERATOR, processEmailGeneratorJob, {
    connection: redis,
    concurrency: 3, // Limit concurrent API calls
    limiter: {
      max: 20, // Max 20 requests per
      duration: 60000, // per minute (API rate limiting)
    },
  });

  worker.on('completed', (job, result) => {
    logger.info(`Email generator job ${job.id} completed:`, result);
  });

  worker.on('failed', (job, error) => {
    logger.error(`Email generator job ${job?.id} failed:`, error);
  });

  logger.info('Email generator worker started');
  return worker;
}

// Run if executed directly
// @ts-ignore - tsx handles import.meta at runtime
if (import.meta.url === `file://${process.argv[1]}`) {
  createEmailGeneratorWorker();
}

export default createEmailGeneratorWorker;
