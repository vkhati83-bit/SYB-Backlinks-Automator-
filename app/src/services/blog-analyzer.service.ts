/**
 * Blog Analyzer Service
 *
 * Analyzes target blogs to create highly personalized outreach emails
 * Uses Claude to understand blog topics, style, and audience
 */

import Anthropic from '@anthropic-ai/sdk';
import * as cheerio from 'cheerio';
import { db } from '../db/index.js';
import logger from '../utils/logger.js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';

interface BlogAnalysis {
  main_topics: string[];
  writing_style: string;
  target_audience: string;
  recent_article_titles: string[];
  relevant_syb_articles: Array<{
    url: string;
    title: string;
    relevance_score: number;
    match_reason: string;
  }>;
  analyzed_at: Date;
  token_cost: number;
}

/**
 * Fetch and extract blog content
 */
async function fetchBlogContent(url: string): Promise<{
  title: string;
  content: string;
  articleTitles: string[];
} | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SYB Research Bot; +https://shieldyourbody.com)',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return null;

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract page title
    const title = $('title').text() || $('h1').first().text();

    // Extract main content (remove scripts, styles, nav, footer)
    $('script, style, nav, footer, aside, iframe').remove();

    // Get article titles from blog
    const articleTitles: string[] = [];
    $('article h2, article h3, .post-title, .entry-title, h2.title, h3.title').each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 10 && text.length < 200) {
        articleTitles.push(text);
      }
    });

    // Get main content text
    const content = $('article, .post-content, .entry-content, main, .content').first().text()
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 5000); // Limit to 5000 chars

    return {
      title,
      content: content || $('body').text().substring(0, 5000),
      articleTitles: articleTitles.slice(0, 10),
    };
  } catch (error) {
    logger.error('Error fetching blog content:', error);
    return null;
  }
}

/**
 * Get SYB research articles (from database or static list)
 */
async function getSYBResearchArticles(): Promise<Array<{ url: string; title: string; keywords: string[] }>> {
  // TODO: Load from database or API
  // For now, return static list of key SYB articles
  return [
    {
      url: 'https://www.shieldyourbody.com/health-risk-cell-phones/',
      title: 'Cell Phone EMF Risks & SYB Protection (2025)',
      keywords: ['cell phone', 'mobile phone', 'smartphone', 'emf radiation', 'health risks', 'cancer'],
    },
    {
      url: 'https://www.shieldyourbody.com/emf-protection-children/',
      title: 'EMF Protection for Children: Complete Parent Guide',
      keywords: ['children', 'kids', 'baby', 'pregnancy', 'pregnant', 'fetus', 'development'],
    },
    {
      url: 'https://www.shieldyourbody.com/5g-health-risks/',
      title: '5G Health Risks: What Science Shows',
      keywords: ['5g', '5g network', 'wireless', 'millimeter wave', '5g towers'],
    },
    {
      url: 'https://www.shieldyourbody.com/emf-sleep-quality/',
      title: 'How EMF Affects Sleep Quality',
      keywords: ['sleep', 'insomnia', 'melatonin', 'sleep quality', 'bedroom', 'wifi router'],
    },
    {
      url: 'https://www.shieldyourbody.com/wifi-radiation/',
      title: 'WiFi Radiation: Health Effects & Protection',
      keywords: ['wifi', 'wireless', 'router', 'home network', 'wireless radiation'],
    },
    {
      url: 'https://www.shieldyourbody.com/laptop-emf-protection/',
      title: 'Laptop EMF Radiation & How to Reduce Exposure',
      keywords: ['laptop', 'computer', 'desk', 'work from home', 'laptop pad'],
    },
    {
      url: 'https://www.shieldyourbody.com/emf-sensitivity-symptoms/',
      title: 'EMF Sensitivity: Symptoms & Solutions',
      keywords: ['emf sensitivity', 'electromagnetic hypersensitivity', 'ehs', 'symptoms', 'headaches'],
    },
    {
      url: 'https://www.shieldyourbody.com/bluetooth-radiation/',
      title: 'Bluetooth Radiation: Risks & Safety Tips',
      keywords: ['bluetooth', 'wireless headphones', 'earbuds', 'airpods', 'wireless devices'],
    },
  ];
}

/**
 * Analyze blog using Claude AI
 */
async function analyzeBlogWithClaude(
  blogContent: { title: string; content: string; articleTitles: string[] },
  sybArticles: Array<{ url: string; title: string; keywords: string[] }>
): Promise<Omit<BlogAnalysis, 'analyzed_at'>> {
  const prompt = `Analyze this blog for personalized outreach:

BLOG TITLE: ${blogContent.title}

RECENT ARTICLES:
${blogContent.articleTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}

CONTENT SAMPLE:
${blogContent.content}

SYB RESEARCH ARTICLES AVAILABLE:
${sybArticles.map((a, i) => `${i + 1}. ${a.title}\n   Keywords: ${a.keywords.join(', ')}`).join('\n\n')}

Analyze this blog and provide:

1. MAIN TOPICS (3-5 topics this blog covers)
2. WRITING STYLE (formal/conversational/technical/journalistic/etc.)
3. TARGET AUDIENCE (who reads this blog - be specific)
4. RELEVANT SYB ARTICLES (rank top 3 most relevant from the list above, with relevance score 0-100 and match reason)

Format your response as JSON:
{
  "main_topics": ["topic1", "topic2", "topic3"],
  "writing_style": "style description",
  "target_audience": "audience description",
  "relevant_articles": [
    {
      "article_number": 1,
      "relevance_score": 85,
      "match_reason": "why this article matches their content"
    }
  ]
}`;

  try {
    const message = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: prompt,
      }],
    });

    const content = message.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    // Parse JSON response
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not find JSON in Claude response');
    }

    const analysis = JSON.parse(jsonMatch[0]);

    // Map article numbers to actual articles
    const relevantArticles = (analysis.relevant_articles || []).map((ra: any) => {
      const article = sybArticles[ra.article_number - 1];
      return {
        url: article.url,
        title: article.title,
        relevance_score: ra.relevance_score,
        match_reason: ra.match_reason,
      };
    });

    const tokenCost = message.usage.input_tokens + message.usage.output_tokens;

    return {
      main_topics: analysis.main_topics || [],
      writing_style: analysis.writing_style || 'conversational',
      target_audience: analysis.target_audience || 'general audience',
      recent_article_titles: blogContent.articleTitles,
      relevant_syb_articles: relevantArticles,
      token_cost: tokenCost,
    };
  } catch (error) {
    logger.error('Claude analysis failed:', error);
    throw error;
  }
}

/**
 * Get cached blog analysis or create new one
 */
export async function analyzeBlog(prospectId: string, url: string, domain: string): Promise<BlogAnalysis | null> {
  try {
    // Check cache first
    const cached = await db.query(`
      SELECT * FROM blog_analyses
      WHERE prospect_id = $1
        AND cache_expires_at > NOW()
    `, [prospectId]);

    if (cached.rows.length > 0) {
      logger.info(`Using cached blog analysis for ${domain}`);
      const row = cached.rows[0];
      return {
        main_topics: row.main_topics,
        writing_style: row.writing_style,
        target_audience: row.target_audience,
        recent_article_titles: row.recent_article_titles,
        relevant_syb_articles: row.relevant_syb_articles,
        analyzed_at: row.analyzed_at,
        token_cost: row.token_cost,
      };
    }

    // Fetch blog content
    logger.info(`Fetching blog content for analysis: ${url}`);
    const blogContent = await fetchBlogContent(url);
    if (!blogContent) {
      logger.warn(`Could not fetch blog content for ${url}`);
      return null;
    }

    // Get SYB articles
    const sybArticles = await getSYBResearchArticles();

    // Analyze with Claude
    logger.info(`Analyzing blog with Claude: ${domain}`);
    const analysis = await analyzeBlogWithClaude(blogContent, sybArticles);

    // Save to database
    await db.query(`
      INSERT INTO blog_analyses (
        prospect_id, url, domain, main_topics, writing_style, target_audience,
        recent_article_titles, relevant_syb_articles, token_cost, analyzed_at, cache_expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW() + INTERVAL '30 days')
      ON CONFLICT (prospect_id) DO UPDATE SET
        main_topics = EXCLUDED.main_topics,
        writing_style = EXCLUDED.writing_style,
        target_audience = EXCLUDED.target_audience,
        recent_article_titles = EXCLUDED.recent_article_titles,
        relevant_syb_articles = EXCLUDED.relevant_syb_articles,
        token_cost = EXCLUDED.token_cost,
        analyzed_at = NOW(),
        cache_expires_at = NOW() + INTERVAL '30 days'
    `, [
      prospectId,
      url,
      domain,
      analysis.main_topics,
      analysis.writing_style,
      analysis.target_audience,
      analysis.recent_article_titles,
      JSON.stringify(analysis.relevant_syb_articles),
      analysis.token_cost,
    ]);

    logger.info(`Blog analysis complete for ${domain} (${analysis.token_cost} tokens, cost: ~$${(analysis.token_cost * 0.000003).toFixed(4)})`);

    return {
      ...analysis,
      analyzed_at: new Date(),
    };
  } catch (error) {
    logger.error('Blog analysis failed:', error);
    return null;
  }
}

/**
 * Generate personalized email using blog analysis
 */
export async function generatePersonalizedEmail(
  prospectId: string,
  contactName: string,
  opportunityType: 'research_citation' | 'broken_link' | 'guest_post',
  blogAnalysis: BlogAnalysis
): Promise<{ subject: string; body: string; token_cost: number }> {
  const topArticle = blogAnalysis.relevant_syb_articles[0];

  const prompt = `Write a personalized outreach email for this research citation opportunity:

TARGET BLOG ANALYSIS:
- Main Topics: ${blogAnalysis.main_topics.join(', ')}
- Writing Style: ${blogAnalysis.writing_style}
- Target Audience: ${blogAnalysis.target_audience}
- Recent Articles: ${blogAnalysis.recent_article_titles.slice(0, 3).join(', ')}

MATCHED SYB RESEARCH:
- Article: ${topArticle.title}
- URL: ${topArticle.url}
- Why Relevant: ${topArticle.match_reason}

RECIPIENT: ${contactName || 'Blog Editor'}

REQUIREMENTS:
1. Reference ONE specific article from their recent content (from the titles above)
2. Explain how our research aligns with THEIR audience (${blogAnalysis.target_audience})
3. Suggest the matched SYB article as a valuable citation
4. Match their ${blogAnalysis.writing_style} style
5. Keep under 150 words
6. Be genuine and specific - NO generic templates

Write the email in this format:
SUBJECT: [subject line]

BODY:
[email body]`;

  try {
    const message = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: prompt,
      }],
    });

    const content = message.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    // Parse subject and body
    const text = content.text;
    const subjectMatch = text.match(/SUBJECT:\s*(.+)/);
    const bodyMatch = text.match(/BODY:\s*([\s\S]+)/);

    if (!subjectMatch || !bodyMatch) {
      throw new Error('Could not parse email from Claude response');
    }

    const tokenCost = message.usage.input_tokens + message.usage.output_tokens;

    return {
      subject: subjectMatch[1].trim(),
      body: bodyMatch[1].trim(),
      token_cost: tokenCost,
    };
  } catch (error) {
    logger.error('Email generation failed:', error);
    throw error;
  }
}

export default {
  analyzeBlog,
  generatePersonalizedEmail,
};
