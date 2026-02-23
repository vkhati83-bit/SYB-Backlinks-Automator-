import Anthropic from '@anthropic-ai/sdk';
import env from '../config/env.js';
import logger from '../utils/logger.js';

const anthropic = new Anthropic({
  apiKey: env.ANTHROPIC_API_KEY,
});

export interface EmailGenerationInput {
  prospectUrl: string;
  prospectDomain: string;
  prospectTitle: string | null;
  prospectDescription: string | null;
  contactName: string | null;
  contactEmail: string;
  opportunityType: 'research_citation' | 'broken_link' | 'guest_post';
  pageContent?: string;
  suggestedArticleUrl?: string | null;
  suggestedArticleTitle?: string | null;
  matchReason?: string | null;
  brokenUrl?: string | null;
  researchCategoryName?: string;
  researchStudyCount?: number;
  emailTemplate?: string;
}

export interface GeneratedEmail {
  subject: string;
  body: string;
}

// System prompt for email generation
const SYSTEM_PROMPT = `You are an expert outreach specialist for ShieldYourBody (SYB), a company dedicated to EMF education and protection. Your task is to write personalized, professional outreach emails that feel genuine and helpful, not salesy.

ABOUT SYB:
- ShieldYourBody.com is a trusted resource on EMF (electromagnetic field) research
- shieldyourbody.com/research contains 3,600+ peer-reviewed scientific studies on EMF health effects
- The research database is freely accessible and is a valuable resource for anyone writing about EMF topics
- SYB also sells EMF protection products, but the outreach should focus on the research value, not products

TONE GUIDELINES:
- Professional but friendly
- Genuinely helpful, not pushy
- Acknowledge their work specifically
- Be concise - busy professionals appreciate brevity
- No aggressive CTAs or desperate language
- Never use phrases like "I hope this email finds you well" or "I stumbled upon your article"

EMAIL STRUCTURE:
1. Opening greeting: "Hi [FirstName]," on its own line — use the first name only, never the full name (use "Hi there," if no name is provided)
2. Brief, personalized opener referencing their specific work
3. Value proposition - how SYB's research can help their readers
4. Soft call-to-action
5. Professional sign-off (added automatically — do NOT include)

IMPORTANT:
- Keep emails under 150 words
- Subject lines should be specific and intriguing, not generic
- Include 1-2 specific details from their content to show you actually read it
- The goal is to start a conversation, not close a deal
- Do NOT include a closing sign-off or signature block (no "Best regards", "Sincerely", "[Your name]", etc.) — the signature is added automatically

URL RULE:
- Only use URLs explicitly provided in the prompt or marked as placeholders (e.g. [RESEARCH_URL]).
- Never invent SYB URLs from your own knowledge.`;

// Generate email for research citation opportunity
async function generateResearchCitationEmail(input: EmailGenerationInput): Promise<GeneratedEmail> {
  // Validate we have a real research DB URL — never allow a blog article URL through
  const isResearchUrl = (url?: string | null) => !!url && url.includes('shieldyourbody.com/research');
  const researchUrl = isResearchUrl(input.suggestedArticleUrl)
    ? input.suggestedArticleUrl!
    : 'https://shieldyourbody.com/research';

  const researchLabel = input.researchStudyCount && input.researchCategoryName
    ? `${input.researchCategoryName} research (${input.researchStudyCount}+ peer-reviewed studies)`
    : `EMF research database (3,600+ peer-reviewed studies)`;

  const templateSection = input.emailTemplate
    ? `\nEMAIL TEMPLATE TO FOLLOW:\nFollow this structure. Fill in {{placeholders}}. Where a research URL is needed, write the placeholder [RESEARCH_URL] exactly as shown.\n\n${input.emailTemplate}\n`
    : '';

  const prompt = `Write an outreach email for this research citation opportunity:

TARGET WEBSITE:
- URL: ${input.prospectUrl}
- Domain: ${input.prospectDomain}
- Page title: ${input.prospectTitle || 'Unknown'}
- Page description: ${input.prospectDescription || 'Unknown'}
${input.pageContent ? `- Page content excerpt: ${input.pageContent.substring(0, 1000)}` : ''}

CONTACT:
- Name: ${input.contactName || 'Editor/Content Team'}
- Email: ${input.contactEmail}

INSTRUCTIONS:
1. The FIRST sentence of the body MUST reference their article by name AND include this exact URL: ${input.prospectUrl}
   Format example: I read your article "[Title]" (${input.prospectUrl}) and ...
2. Mention that SYB maintains a curated page of peer-reviewed studies: "${researchLabel}" — a free resource they can cite to strengthen their article.
3. Where the research page URL should appear, write the exact placeholder text: [RESEARCH_URL]
   This placeholder is REQUIRED and will be replaced automatically. Do NOT write any real URL in its place.
4. Keep the email under 150 words.
5. End with a soft, helpful CTA.
${templateSection}
Generate a JSON response with "subject" and "body" fields.`;

  const result = await generateEmail(prompt);

  // Inject the actual research URL — Claude only wrote the placeholder
  result.body = result.body.replace(/\[RESEARCH_URL\]/g, researchUrl);
  result.subject = result.subject.replace(/\[RESEARCH_URL\]/g, researchUrl);

  return result;
}

// Generate email for guest post opportunity
async function generateGuestPostEmail(input: EmailGenerationInput): Promise<GeneratedEmail> {
  const prompt = `Write an outreach email for this guest post opportunity:

TARGET WEBSITE:
- URL: ${input.prospectUrl}
- Domain: ${input.prospectDomain}
- Site focus: ${input.prospectTitle || 'Unknown'}
- Description: ${input.prospectDescription || 'Unknown'}
${input.pageContent ? `- Page content excerpt: ${input.pageContent.substring(0, 1000)}` : ''}

CONTACT:
- Name: ${input.contactName || 'Editor/Content Team'}
- Email: ${input.contactEmail}

PITCH:
Propose writing a valuable guest article on EMF health topics for their site. Mention that:
1. We're from ShieldYourBody, a trusted EMF education resource
2. We can offer well-researched content backed by our database of 3,600+ peer-reviewed studies
3. Suggest 2-3 specific article topic ideas relevant to their audience
4. The article would naturally include a link to our research database

Generate a JSON response with "subject" and "body" fields.`;

  return generateEmail(prompt);
}

// Generate email for broken link opportunity
async function generateBrokenLinkEmail(input: EmailGenerationInput): Promise<GeneratedEmail> {
  const brokenUrlInfo = input.brokenUrl ? `- Broken URL on their page: ${input.brokenUrl}` : '';

  const articleSection = input.suggestedArticleUrl
    ? `\nSUGGESTED REPLACEMENT ARTICLE:
- URL: ${input.suggestedArticleUrl}
- Title: ${input.suggestedArticleTitle || 'N/A'}
- Why it's a good replacement: ${input.matchReason || 'Relevant to the broken link topic'}
`
    : '';

  const pitch = input.suggestedArticleUrl
    ? `We noticed a broken link on their page. Politely point this out.${input.brokenUrl ? ` The broken URL MUST appear in the email exactly as written: ${input.brokenUrl}` : ''} Then suggest our specific article as a replacement. The article title MUST be followed immediately by its URL in parentheses, exactly like this: "${input.suggestedArticleTitle}" (${input.suggestedArticleUrl}). Describe what the article covers. Then, as a final separate sentence before the CTA, suggest the research database as additional reading using the placeholder [RESEARCH_URL], for example: "For more information, you can also browse our EMF research database: [RESEARCH_URL]". Be helpful, not opportunistic.`
    : `We noticed a broken link on their page${input.brokenUrl ? ` (${input.brokenUrl})` : ''}. Politely point this out and suggest our research database at [RESEARCH_URL] as a relevant replacement resource. Be helpful, not opportunistic.`;

  const templateSection = input.emailTemplate
    ? `\nEMAIL TEMPLATE TO FOLLOW:\nFollow this structure exactly. Fill in all {{placeholders}} with contextually appropriate content based on the prospect and contact info above.\n\n${input.emailTemplate}\n`
    : '';

  const prompt = `Write an outreach email for this broken link opportunity:

TARGET WEBSITE:
- URL: ${input.prospectUrl}
- Domain: ${input.prospectDomain}
- Issue: ${input.prospectDescription || 'Has a broken link'}
${brokenUrlInfo}
${articleSection}
CONTACT:
- Name: ${input.contactName || 'Editor/Webmaster'}
- Email: ${input.contactEmail}

PITCH:
${pitch}

NOTE: If you include [RESEARCH_URL] in the body, it will be replaced automatically with the real URL. Do NOT write any real shieldyourbody.com URL — use the placeholder or omit it.
${templateSection}
Generate a JSON response with "subject" and "body" fields.`;

  const result = await generateEmail(prompt);

  // Inject the actual research URL — Claude only wrote the placeholder
  result.body = result.body.replace(/\[RESEARCH_URL\]/g, 'https://shieldyourbody.com/research');
  result.subject = result.subject.replace(/\[RESEARCH_URL\]/g, 'https://shieldyourbody.com/research');

  return result;
}

// Core email generation function
async function generateEmail(prompt: string): Promise<GeneratedEmail> {
  try {
    const response = await anthropic.messages.create({
      model: env.CLAUDE_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: prompt + '\n\nRespond with valid JSON only: {"subject": "...", "body": "..."}',
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    // Parse JSON from response
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const result = JSON.parse(jsonMatch[0]) as GeneratedEmail;

    if (!result.subject || !result.body) {
      throw new Error('Invalid email structure');
    }

    return result;
  } catch (error) {
    logger.error('Email generation failed:', error);
    throw error;
  }
}

// Extract first name from a full name string
function firstNameOnly(name: string | null): string | null {
  if (!name) return null;
  return name.trim().split(/\s+/)[0];
}

// Main generation function
export async function generateOutreachEmail(input: EmailGenerationInput): Promise<GeneratedEmail> {
  logger.info(`Generating ${input.opportunityType} email for ${input.prospectDomain}`);
  // Use first name only so greetings read "Hi Barak," not "Hi Barak Zuman,"
  input = { ...input, contactName: firstNameOnly(input.contactName) };

  switch (input.opportunityType) {
    case 'research_citation':
      return generateResearchCitationEmail(input);

    case 'broken_link':
      return generateBrokenLinkEmail(input);

    case 'guest_post':
      return generateGuestPostEmail(input);

    default:
      throw new Error(`Unknown opportunity type: ${input.opportunityType}`);
  }
}

// Generate follow-up email
export async function generateFollowupEmail(
  originalSubject: string,
  originalBody: string,
  contactName: string | null,
  stepNumber: number,
  template?: string
): Promise<GeneratedEmail> {
  const templateSection = template
    ? `\nEMAIL TEMPLATE TO FOLLOW:\nFollow this structure exactly. Fill in all {{placeholders}} with contextually appropriate content based on the original email and contact info above.\n\n${template}\n`
    : '';

  const prompt = `Write a follow-up email (follow-up #${stepNumber}) for this original outreach:

ORIGINAL EMAIL:
Subject: ${originalSubject}
Body: ${originalBody}

CONTACT NAME: ${contactName || 'there'}

FOLLOW-UP GUIDELINES:
- Follow-up #1 (day 4): Brief, friendly bump. Acknowledge they're busy.
- Follow-up #2 (day 8): Final follow-up. Offer to help if timing isn't right.

Keep it very short (under 75 words). Be respectful of their time.
${templateSection}
Generate a JSON response with "subject" and "body" fields.`;

  return generateEmail(prompt);
}

// Response classification result
export interface ClassificationResult {
  category: 'positive' | 'negotiating' | 'question' | 'declined' | 'negative' | 'auto_reply' | 'bounce' | 'unrelated';
  sentiment: 'positive' | 'neutral' | 'negative';
  confidence: number;
  suggestedAction: string;
  summary: string;
}

// Classify a response
export async function classifyResponse(
  responseSubject: string,
  responseBody: string,
  originalSubject?: string,
  originalBody?: string
): Promise<ClassificationResult> {
  const prompt = `Classify this email response to an outreach email:

ORIGINAL EMAIL (if available):
Subject: ${originalSubject || 'N/A'}
Body: ${originalBody || 'N/A'}

RESPONSE RECEIVED:
Subject: ${responseSubject}
Body: ${responseBody}

Classify the response into EXACTLY one of these categories:
- positive: They agreed to add a link or expressed clear interest
- negotiating: They want something in return (payment, guest post, reciprocal link)
- question: They have questions or need more information
- declined: Politely not interested
- negative: Hostile, angry, or demands removal
- auto_reply: Automated response (out of office, vacation, etc.)
- bounce: Email delivery failure
- unrelated: Wrong person or off-topic response

Also determine:
- sentiment: 'positive', 'neutral', or 'negative'
- confidence: 0.0 to 1.0 how confident you are
- suggestedAction: Brief actionable next step
- summary: One sentence summary of their response

Respond with JSON only:
{
  "category": "...",
  "sentiment": "...",
  "confidence": 0.95,
  "suggestedAction": "...",
  "summary": "..."
}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022', // Updated to current fast model for classification
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found');
    }

    return JSON.parse(jsonMatch[0]) as ClassificationResult;
  } catch (error) {
    logger.error('Response classification failed:', error);
    return {
      category: 'unrelated',
      sentiment: 'neutral',
      confidence: 0,
      suggestedAction: 'Manual review required',
      summary: 'Classification failed - manual review needed',
    };
  }
}

export default {
  generateOutreachEmail,
  generateFollowupEmail,
  classifyResponse,
};
