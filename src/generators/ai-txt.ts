/**
 * Generate ai.txt and ai.json — AI interaction policy files.
 * Based on the 365i AI Visibility Definition format.
 */

import type { SiteCrawlResult, GeneratorOptions } from '../crawler/page-data.js';

export function generateAiTxt(
  crawlResult: SiteCrawlResult,
  options: GeneratorOptions,
): string {
  const { siteIdentity, baseUrl, domain } = crawlResult;
  const allowTraining = !options.denyTraining;
  const orgName = siteIdentity.name || domain;
  const hasRealEmail = !!(options.contactEmail || siteIdentity.contactEmail);
  const contactEmail = options.contactEmail || siteIdentity.contactEmail || `ai@${domain}`;

  const lines: string[] = [];

  lines.push('# AI Policy');
  lines.push(`# Organization: ${orgName}`);
  lines.push(`# URL: ${baseUrl}`);
  lines.push(`# Generated: ${new Date().toISOString().split('T')[0]}`);
  lines.push('');
  lines.push('# Purpose: Define how AI systems may interact with this website\'s content');
  if (!hasRealEmail) {
    lines.push('# TODO: Replace placeholder email below with your actual AI policy contact');
  }
  lines.push('');

  // Permissions section
  lines.push('## Permissions');
  lines.push('');
  lines.push(`Training: ${allowTraining ? 'yes' : 'no'}`);
  lines.push('Inference: yes');
  lines.push('Search: yes');
  lines.push('Summarization: yes');
  lines.push('Citation: yes');
  lines.push('Embedding: yes');
  lines.push('');

  // Restrictions
  lines.push('## Restrictions');
  lines.push('');
  if (!allowTraining) {
    lines.push('- Content may NOT be used for AI model training');
    lines.push('- Content may NOT be included in training datasets');
  }
  lines.push('- Content must be attributed when cited');
  lines.push('- Do not misrepresent or fabricate content from this site');
  lines.push('- Do not generate misleading summaries');
  lines.push('');

  // Attribution
  lines.push('## Attribution');
  lines.push('');
  lines.push(`Organization: ${orgName}`);
  lines.push(`URL: ${baseUrl}`);
  lines.push(`Contact: ${contactEmail}`);
  if (siteIdentity.copyright) {
    lines.push(`Copyright: ${siteIdentity.copyright}`);
  }
  lines.push('');

  // Resources
  lines.push('## Resources');
  lines.push('');
  lines.push(`LLMs.txt: ${baseUrl}/llms.txt`);
  lines.push(`Sitemap: ${baseUrl}/sitemap.xml`);
  lines.push(`Robots.txt: ${baseUrl}/robots.txt`);
  lines.push('');

  return lines.join('\n');
}

export function generateAiJson(
  crawlResult: SiteCrawlResult,
  options: GeneratorOptions,
): string {
  const { siteIdentity, baseUrl, domain } = crawlResult;
  const allowTraining = !options.denyTraining;
  const orgName = siteIdentity.name || domain;
  const hasRealEmail = !!(options.contactEmail || siteIdentity.contactEmail);
  const contactEmail = options.contactEmail || siteIdentity.contactEmail || `ai@${domain}`;

  const aiPolicy = {
    version: '1.0',
    generated: new Date().toISOString(),
    organization: {
      name: orgName,
      url: baseUrl,
      contact: contactEmail,
      ...(!hasRealEmail && { contact_placeholder: true }),
      ...(siteIdentity.copyright && { copyright: siteIdentity.copyright }),
    },
    permissions: {
      training: allowTraining,
      inference: true,
      search: true,
      summarization: true,
      citation: true,
      embedding: true,
    },
    restrictions: [
      'Content must be attributed when cited',
      'Do not misrepresent or fabricate content',
      ...(!allowTraining
        ? ['Content may NOT be used for AI model training']
        : []),
    ],
    resources: {
      llmsTxt: `${baseUrl}/llms.txt`,
      sitemap: `${baseUrl}/sitemap.xml`,
      robotsTxt: `${baseUrl}/robots.txt`,
    },
    crawlers: {
      allowed_search: [
        'OAI-SearchBot',
        'ChatGPT-User',
        'Claude-SearchBot',
        'PerplexityBot',
        'DuckAssistBot',
      ],
      ...(allowTraining
        ? {
            allowed_training: [
              'GPTBot',
              'ClaudeBot',
              'Google-Extended',
              'Applebot-Extended',
              'Meta-ExternalAgent',
              'CCBot',
              'Bytespider',
              'Amazonbot',
            ],
          }
        : {
            denied_training: [
              'GPTBot',
              'ClaudeBot',
              'Google-Extended',
              'Applebot-Extended',
              'Meta-ExternalAgent',
              'CCBot',
              'Bytespider',
              'Amazonbot',
            ],
          }),
    },
  };

  return JSON.stringify(aiPolicy, null, 2) + '\n';
}
