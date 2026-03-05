/**
 * AI Infrastructure audit checks (category weight: 3x)
 */

import type { SiteCrawlResult } from '../../crawler/page-data.js';
import type { AuditItem } from './types.js';
import { MAX_AFFECTED_URLS, resolveSeverity } from './types.js';

export function auditAiInfrastructure(crawlResult: SiteCrawlResult): AuditItem[] {
  const { existingGeoFiles } = crawlResult;
  const items: AuditItem[] = [];

  items.push(auditRobotsTxt(existingGeoFiles.robotsTxt));
  items.push(auditSitemap(existingGeoFiles.sitemapXml, crawlResult.pages.length));
  items.push(auditLlmsTxt(existingGeoFiles.llmsTxt));
  items.push(auditLlmsFullTxt(existingGeoFiles.llmsFullTxt));
  items.push(auditAiPolicy(existingGeoFiles.aiTxt, existingGeoFiles.aiJson));
  items.push(auditAiBotBlocking(existingGeoFiles.robotsTxt));
  items.push(auditAiContentDirectives(crawlResult));
  items.push(auditTrainingVsRetrievalStrategy(existingGeoFiles.robotsTxt));
  // Tier 3 checks
  items.push(auditAgentCard(existingGeoFiles.agentCardJson));
  items.push(auditAgentsJson(existingGeoFiles.agentsJson));

  return items;
}

function auditRobotsTxt(content: string | null): AuditItem {
  if (!content) {
    const item: AuditItem = {
      name: 'robots.txt',
      category: 'ai_infrastructure',
      score: 0,
      maxScore: 100,
      status: 'fail',
      severity: 'error',
      details: 'No robots.txt found',
      recommendation: 'Add /robots.txt with explicit AI crawler directives (GPTBot, ClaudeBot, PerplexityBot, etc.)',
    };
    item.severity = resolveSeverity(item.name, item.status);
    return item;
  }

  const aiCrawlers = ['GPTBot', 'ClaudeBot', 'Google-Extended', 'PerplexityBot', 'Applebot-Extended'];
  const mentioned = aiCrawlers.filter(c => content.includes(c));

  if (mentioned.length === 0) {
    const item: AuditItem = {
      name: 'robots.txt',
      category: 'ai_infrastructure',
      score: 30,
      maxScore: 100,
      status: 'partial',
      severity: 'warning',
      details: 'robots.txt exists but has no AI crawler directives',
      recommendation: `Add explicit directives for AI crawlers: ${aiCrawlers.join(', ')}`,
    };
    item.severity = resolveSeverity(item.name, item.status);
    return item;
  }

  const score = Math.min(100, 30 + (mentioned.length / aiCrawlers.length) * 70);
  const status = mentioned.length >= 3 ? 'pass' as const : 'partial' as const;
  return {
    name: 'robots.txt',
    category: 'ai_infrastructure',
    score: Math.round(score),
    maxScore: 100,
    status,
    severity: resolveSeverity('robots.txt', status),
    details: `robots.txt mentions ${mentioned.length}/${aiCrawlers.length} key AI crawlers: ${mentioned.join(', ')}`,
    recommendation: mentioned.length < aiCrawlers.length
      ? `Add directives for: ${aiCrawlers.filter(c => !mentioned.includes(c)).join(', ')}`
      : 'robots.txt has comprehensive AI crawler coverage',
  };
}

function auditSitemap(content: string | null, pageCount: number): AuditItem {
  if (!content) {
    return {
      name: 'sitemap.xml',
      category: 'ai_infrastructure',
      score: 0,
      maxScore: 100,
      status: 'fail',
      severity: resolveSeverity('sitemap.xml', 'fail'),
      details: 'No sitemap.xml found',
      recommendation: 'Add /sitemap.xml with all discoverable URLs',
    };
  }

  const urlCount = (content.match(/<loc>/g) || []).length;
  const hasLastmod = content.includes('<lastmod>');

  let score = 50;
  if (urlCount > 0) score += 25;
  if (hasLastmod) score += 25;

  const status = score >= 75 ? 'pass' as const : 'partial' as const;
  return {
    name: 'sitemap.xml',
    category: 'ai_infrastructure',
    score,
    maxScore: 100,
    status,
    severity: resolveSeverity('sitemap.xml', status),
    details: `Sitemap contains ${urlCount} URLs${hasLastmod ? ' with lastmod dates' : ' (no lastmod)'}. Crawled ${pageCount} pages.`,
    recommendation: !hasLastmod
      ? 'Add <lastmod> dates to sitemap entries for freshness signals'
      : 'Sitemap is well-configured',
  };
}

function auditLlmsTxt(content: string | null): AuditItem {
  if (!content) {
    return {
      name: 'llms.txt',
      category: 'ai_infrastructure',
      score: 0,
      maxScore: 100,
      status: 'fail',
      severity: resolveSeverity('llms.txt', 'fail'),
      details: 'No llms.txt found',
      recommendation: 'Add /llms.txt following the llmstxt.org spec: H1 site name, blockquote summary, H2 sections with link lists',
    };
  }

  let score = 40;
  const hasH1 = /^# .+/m.test(content);
  const hasBlockquote = /^> .+/m.test(content);
  const hasH2 = /^## .+/m.test(content);
  const hasLinks = /\[.+\]\(.+\)/.test(content);

  if (hasH1) score += 15;
  if (hasBlockquote) score += 15;
  if (hasH2) score += 15;
  if (hasLinks) score += 15;

  const status = score >= 70 ? 'pass' as const : 'partial' as const;
  return {
    name: 'llms.txt',
    category: 'ai_infrastructure',
    score,
    maxScore: 100,
    status,
    severity: resolveSeverity('llms.txt', status),
    details: `llms.txt found — H1: ${hasH1 ? 'yes' : 'no'}, Blockquote: ${hasBlockquote ? 'yes' : 'no'}, H2 sections: ${hasH2 ? 'yes' : 'no'}, Links: ${hasLinks ? 'yes' : 'no'}`,
    recommendation: score < 100
      ? 'Ensure llms.txt has: # Site Name, > summary blockquote, ## Sections with [link](url) lists'
      : 'llms.txt follows the spec correctly',
  };
}

function auditLlmsFullTxt(content: string | null): AuditItem {
  const status = content ? 'pass' as const : 'fail' as const;
  return {
    name: 'llms-full.txt',
    category: 'ai_infrastructure',
    score: content ? 100 : 0,
    maxScore: 100,
    status,
    severity: resolveSeverity('llms-full.txt', status),
    details: content
      ? `Found llms-full.txt (${content.length} chars)`
      : 'No llms-full.txt found',
    recommendation: content
      ? 'llms-full.txt is present — good!'
      : 'Add /llms-full.txt with complete site content in markdown for bulk LLM ingestion',
  };
}

function auditAiPolicy(aiTxt: string | null, aiJson: string | null): AuditItem {
  const hasTxt = !!aiTxt;
  const hasJson = !!aiJson;

  if (!hasTxt && !hasJson) {
    return {
      name: 'AI Policy (ai.txt / ai.json)',
      category: 'ai_infrastructure',
      score: 0,
      maxScore: 100,
      status: 'fail',
      severity: resolveSeverity('AI Policy (ai.txt / ai.json)', 'fail'),
      details: 'No ai.txt or ai.json found',
      recommendation: 'Add /ai.txt and /ai.json to define AI interaction permissions, restrictions, and attribution requirements',
    };
  }

  let score = hasTxt ? 50 : 0;
  score += hasJson ? 50 : 0;
  const status = hasTxt && hasJson ? 'pass' as const : 'partial' as const;

  return {
    name: 'AI Policy (ai.txt / ai.json)',
    category: 'content_quality',
    score,
    maxScore: 100,
    status,
    severity: resolveSeverity('AI Policy (ai.txt / ai.json)', status),
    details: `ai.txt: ${hasTxt ? 'found' : 'missing'}, ai.json: ${hasJson ? 'found' : 'missing'}`,
    recommendation: !hasTxt
      ? 'Add /ai.txt for human-readable AI policy'
      : !hasJson
        ? 'Add /ai.json for machine-parseable AI policy'
        : 'Both AI policy files are present',
  };
}

function auditAiBotBlocking(content: string | null): AuditItem {
  if (!content) {
    return {
      name: 'AI Bot Blocking',
      category: 'ai_infrastructure',
      score: 100,
      maxScore: 100,
      status: 'pass',
      severity: resolveSeverity('AI Bot Blocking', 'pass'),
      details: 'No robots.txt found — AI bots are not blocked (but consider adding one with explicit Allow directives)',
      recommendation: 'Add /robots.txt with explicit "Allow: /" for AI crawlers to signal openness',
    };
  }

  const aiCrawlers = [
    'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot',
    'Google-Extended', 'Applebot-Extended', 'Meta-ExternalAgent', 'PerplexityBot',
    'Amazonbot', 'CCBot', 'DuckAssistBot', 'Bytespider',
  ];

  const lines = content.split('\n').map(l => l.trim());
  const blockedBots: string[] = [];

  let currentAgents: string[] = [];
  for (const line of lines) {
    const agentMatch = line.match(/^User-agent:\s*(.+)$/i);
    if (agentMatch) {
      currentAgents.push(agentMatch[1].trim());
      continue;
    }

    const disallowMatch = line.match(/^Disallow:\s*\/\s*$/i);
    if (disallowMatch && currentAgents.length > 0) {
      for (const agent of currentAgents) {
        if (agent === '*') {
          for (const bot of aiCrawlers) {
            if (!hasExplicitAllow(content, bot)) {
              blockedBots.push(bot);
            }
          }
        } else {
          const matchedBot = aiCrawlers.find(b => b.toLowerCase() === agent.toLowerCase());
          if (matchedBot) blockedBots.push(matchedBot);
        }
      }
    }

    if (!agentMatch && !line.startsWith('#') && line.length > 0) {
      currentAgents = [];
    }
  }

  const uniqueBlocked = [...new Set(blockedBots)];

  if (uniqueBlocked.length === 0) {
    return {
      name: 'AI Bot Blocking',
      category: 'ai_infrastructure',
      score: 100,
      maxScore: 100,
      status: 'pass',
      severity: resolveSeverity('AI Bot Blocking', 'pass'),
      details: 'No AI crawlers are blocked in robots.txt',
      recommendation: 'robots.txt does not block AI crawlers — good!',
    };
  }

  const blockedPct = uniqueBlocked.length / aiCrawlers.length;
  const score = Math.round(Math.max(0, (1 - blockedPct) * 100));
  const status = blockedPct > 0.5 ? 'fail' as const : 'partial' as const;

  return {
    name: 'AI Bot Blocking',
    category: 'ai_infrastructure',
    score,
    maxScore: 100,
    status,
    severity: resolveSeverity('AI Bot Blocking', status),
    details: `${uniqueBlocked.length}/${aiCrawlers.length} AI crawlers are blocked: ${uniqueBlocked.join(', ')}`,
    recommendation: `Remove "Disallow: /" for these AI crawlers to allow indexing: ${uniqueBlocked.join(', ')}. 5.9% of sites accidentally block GPTBot.`,
  };
}

function hasExplicitAllow(robotsTxt: string, botName: string): boolean {
  const lines = robotsTxt.split('\n').map(l => l.trim());
  let inBotBlock = false;
  for (const line of lines) {
    const agentMatch = line.match(/^User-agent:\s*(.+)$/i);
    if (agentMatch) {
      inBotBlock = agentMatch[1].trim().toLowerCase() === botName.toLowerCase();
      continue;
    }
    if (inBotBlock && /^Allow:\s*\/\s*$/i.test(line)) return true;
    if (!agentMatch && !line.startsWith('#') && line.length > 0) {
      inBotBlock = false;
    }
  }
  return false;
}

function auditAiContentDirectives(crawlResult: SiteCrawlResult): AuditItem {
  const { pages } = crawlResult;
  let withMaxSnippet = 0;
  let withMaxImagePreview = 0;
  const affectedUrls: string[] = [];

  for (const page of pages) {
    const robots = page.meta.robots?.toLowerCase() || '';
    const xRobotsTag = (page.responseHeaders['x-robots-tag'] || '').toLowerCase();
    const combined = `${robots} ${xRobotsTag}`;

    const hasSnippet = combined.includes('max-snippet');
    const hasImagePreview = combined.includes('max-image-preview');
    if (hasSnippet) withMaxSnippet++;
    if (hasImagePreview) withMaxImagePreview++;
    if (!hasSnippet && !hasImagePreview) {
      if (affectedUrls.length < MAX_AFFECTED_URLS) affectedUrls.push(page.url);
    }
  }

  const hasDirectives = withMaxSnippet > 0 || withMaxImagePreview > 0;
  const coverage = pages.length > 0
    ? Math.max(withMaxSnippet, withMaxImagePreview) / pages.length
    : 0;

  let score = 0;
  if (withMaxSnippet > 0) score += 50;
  if (withMaxImagePreview > 0) score += 50;
  score = Math.round(score * Math.max(coverage, hasDirectives ? 0.5 : 0));

  const status = score >= 60 ? 'pass' as const : score > 0 ? 'partial' as const : 'fail' as const;
  return {
    name: 'AI Content Directives',
    category: 'ai_infrastructure',
    score,
    maxScore: 100,
    status,
    severity: resolveSeverity('AI Content Directives', status),
    details: hasDirectives
      ? `max-snippet on ${withMaxSnippet} pages, max-image-preview on ${withMaxImagePreview} pages`
      : 'No max-snippet or max-image-preview directives found',
    recommendation: !hasDirectives
      ? 'Add <meta name="robots" content="max-snippet:-1, max-image-preview:large"> to allow AI engines to use full content in responses'
      : coverage < 0.8
        ? 'Increase coverage of max-snippet and max-image-preview across all pages'
        : 'AI content directives are well-configured',
    ...(affectedUrls.length > 0 ? { affectedUrls } : {}),
  };
}

/** Tier 3: agent-card.json (A2A protocol agent discovery) */
function auditAgentCard(content: string | null): AuditItem {
  if (!content) {
    return {
      name: 'agent-card.json',
      category: 'ai_infrastructure',
      score: 0, maxScore: 100, status: 'fail',
      severity: resolveSeverity('agent-card.json', 'fail'),
      details: 'No /.well-known/agent-card.json found',
      recommendation: 'Add /.well-known/agent-card.json — the A2A (Agent-to-Agent) protocol discovery card enables AI agents to discover your site\'s capabilities and interact programmatically',
    };
  }

  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(content); } catch {
    return {
      name: 'agent-card.json',
      category: 'ai_infrastructure',
      score: 10, maxScore: 100, status: 'fail',
      severity: resolveSeverity('agent-card.json', 'fail'),
      details: 'agent-card.json exists but contains invalid JSON',
      recommendation: 'Fix the JSON syntax in /.well-known/agent-card.json',
    };
  }

  let score = 30; // base for existing valid JSON
  const hasName = !!parsed.name;
  const hasDescription = !!parsed.description;
  const hasUrl = !!parsed.url;
  const hasCapabilities = !!parsed.capabilities;

  if (hasName) score += 20;
  if (hasDescription) score += 20;
  if (hasUrl) score += 15;
  if (hasCapabilities) score += 15;

  const status = score >= 70 ? 'pass' as const : 'partial' as const;
  const missing: string[] = [];
  if (!hasName) missing.push('name');
  if (!hasDescription) missing.push('description');
  if (!hasUrl) missing.push('url');
  if (!hasCapabilities) missing.push('capabilities');

  return {
    name: 'agent-card.json',
    category: 'ai_infrastructure',
    score, maxScore: 100, status,
    severity: resolveSeverity('agent-card.json', status),
    details: `agent-card.json found — name: ${hasName ? '✓' : '✗'}, description: ${hasDescription ? '✓' : '✗'}, url: ${hasUrl ? '✓' : '✗'}, capabilities: ${hasCapabilities ? '✓' : '✗'}`,
    recommendation: missing.length > 0
      ? `Add ${missing.join(', ')} fields to agent-card.json for complete A2A agent discovery`
      : 'agent-card.json is well-configured for A2A agent discovery',
  };
}

/** Tier 3: agents.json (AI agent API contracts) */
function auditAgentsJson(content: string | null): AuditItem {
  if (!content) {
    return {
      name: 'agents.json',
      category: 'ai_infrastructure',
      score: 0, maxScore: 100, status: 'fail',
      severity: resolveSeverity('agents.json', 'fail'),
      details: 'No /agents.json found',
      recommendation: 'Add /agents.json to define AI agent API contracts — lists available agents, their endpoints, and interaction protocols for automated discovery',
    };
  }

  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch {
    return {
      name: 'agents.json',
      category: 'ai_infrastructure',
      score: 10, maxScore: 100, status: 'fail',
      severity: resolveSeverity('agents.json', 'fail'),
      details: 'agents.json exists but contains invalid JSON',
      recommendation: 'Fix the JSON syntax in /agents.json',
    };
  }

  // agents.json can be an array of agents or an object with agents array
  const agents = Array.isArray(parsed) ? parsed : (parsed as Record<string, unknown>).agents;
  const isArray = Array.isArray(agents);
  const agentCount = isArray ? agents.length : 0;

  let score = 40; // base for valid JSON
  if (isArray && agentCount > 0) score += 30;
  if (isArray && agentCount > 0) {
    // Check if agents have basic fields
    const first = agents[0] as Record<string, unknown>;
    if (first.name) score += 15;
    if (first.description || first.endpoint || first.url) score += 15;
  }

  const status = score >= 70 ? 'pass' as const : score >= 40 ? 'partial' as const : 'fail' as const;
  return {
    name: 'agents.json',
    category: 'ai_infrastructure',
    score: Math.min(100, score), maxScore: 100, status,
    severity: resolveSeverity('agents.json', status),
    details: agentCount > 0
      ? `agents.json defines ${agentCount} agent(s)`
      : 'agents.json found but contains no agent definitions',
    recommendation: agentCount === 0
      ? 'Add agent definitions to /agents.json with name, description, and endpoint fields'
      : 'agents.json is configured with agent definitions',
  };
}

/** New check: Training vs Retrieval Bot Strategy */
function auditTrainingVsRetrievalStrategy(content: string | null): AuditItem {
  if (!content) {
    return {
      name: 'Training vs Retrieval Bot Strategy',
      category: 'ai_infrastructure',
      score: 0,
      maxScore: 100,
      status: 'not_applicable',
      severity: 'info',
      details: 'No robots.txt found — cannot assess bot strategy',
      recommendation: 'Add robots.txt with differentiated directives for training vs retrieval bots',
    };
  }

  const trainingBots = ['CCBot', 'GPTBot', 'Google-Extended', 'Bytespider'];
  const retrievalBots = ['OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'PerplexityBot'];

  const lines = content.split('\n').map(l => l.trim());

  function isBotBlocked(botName: string): boolean {
    let inBlock = false;
    for (const line of lines) {
      const agentMatch = line.match(/^User-agent:\s*(.+)$/i);
      if (agentMatch) {
        inBlock = agentMatch[1].trim().toLowerCase() === botName.toLowerCase();
        continue;
      }
      if (inBlock && /^Disallow:\s*\/\s*$/i.test(line)) return true;
      if (!agentMatch && !line.startsWith('#') && line.length > 0) {
        inBlock = false;
      }
    }
    return false;
  }

  function isBotAllowed(botName: string): boolean {
    let inBlock = false;
    for (const line of lines) {
      const agentMatch = line.match(/^User-agent:\s*(.+)$/i);
      if (agentMatch) {
        inBlock = agentMatch[1].trim().toLowerCase() === botName.toLowerCase();
        continue;
      }
      if (inBlock && /^Allow:\s*\/\s*$/i.test(line)) return true;
      if (!agentMatch && !line.startsWith('#') && line.length > 0) {
        inBlock = false;
      }
    }
    return false;
  }

  const trainingBlocked = trainingBots.filter(b => isBotBlocked(b));
  const retrievalAllowed = retrievalBots.filter(b => isBotAllowed(b) || (!isBotBlocked(b) && content.toLowerCase().includes(b.toLowerCase())));

  // Check if ANY bot is even mentioned — if not, strategy isn't applicable
  const anyMentioned = [...trainingBots, ...retrievalBots].some(b => content.toLowerCase().includes(b.toLowerCase()));
  if (!anyMentioned) {
    return {
      name: 'Training vs Retrieval Bot Strategy',
      category: 'ai_infrastructure',
      score: 0,
      maxScore: 100,
      status: 'fail',
      severity: resolveSeverity('Training vs Retrieval Bot Strategy', 'fail'),
      details: 'No AI bot directives found in robots.txt',
      recommendation: 'Add differentiated directives: block training bots (CCBot, Bytespider) while allowing retrieval bots (OAI-SearchBot, ChatGPT-User, PerplexityBot)',
    };
  }

  // Best strategy: block training, allow retrieval
  const hasStrategy = trainingBlocked.length > 0 && retrievalAllowed.length > 0;
  let score = 0;
  if (hasStrategy) {
    score = Math.min(100, 40 + (trainingBlocked.length / trainingBots.length) * 30 + (retrievalAllowed.length / retrievalBots.length) * 30);
  } else if (retrievalAllowed.length > 0) {
    score = Math.round((retrievalAllowed.length / retrievalBots.length) * 50);
  } else {
    score = 20; // Some bots mentioned but no strategy
  }

  const status = score >= 60 ? 'pass' as const : score > 0 ? 'partial' as const : 'fail' as const;
  return {
    name: 'Training vs Retrieval Bot Strategy',
    category: 'ai_infrastructure',
    score: Math.round(score),
    maxScore: 100,
    status,
    severity: resolveSeverity('Training vs Retrieval Bot Strategy', status),
    details: `Training bots blocked: ${trainingBlocked.length}/${trainingBots.length} (${trainingBlocked.join(', ') || 'none'}). Retrieval bots allowed: ${retrievalAllowed.length}/${retrievalBots.length} (${retrievalAllowed.join(', ') || 'none'})`,
    recommendation: hasStrategy
      ? 'Good bot strategy: training bots blocked, retrieval bots allowed'
      : 'Differentiate between training bots (block CCBot, Bytespider) and retrieval bots (allow OAI-SearchBot, ChatGPT-User) for optimal AI visibility with content protection',
  };
}
