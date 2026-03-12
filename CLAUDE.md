# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**geo-scraper** is a TypeScript CLI tool and web dashboard that crawls websites and generates 12+ compliance files for AI/LLM crawler readiness (robots.txt, llms.txt, ai.txt/json, structured data, etc.). It audits GEO (Generative Engine Optimization) compliance with weighted scoring (0-100, letter grades A+-F) and checks AI search engine visibility across multiple LLM platforms.

## Build & Development Commands

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript (tsc → dist/) + copy web public assets
npm run start        # Run compiled CLI (node dist/cli.js)
npm run dev          # Run in dev mode with tsx (no build step)
npm test             # Run tests (vitest)
npm run test:watch   # Run tests in watch mode
```

**Three subcommands:**
```bash
# Scan: crawl + audit + generate files
npm run dev -- scan https://example.com
npm run dev -- https://example.com                  # scan is the default
npm run dev -- scan https://example.com --audit-only
npm run dev -- scan https://example.com -o ./output -m 100 -c 5
npm run dev -- scan https://example.com --brand-scan  # include brand mention scanning
npm run dev -- scan https://example.com --pdf         # also generate PDF reports

# Check: AI visibility testing across LLM search engines
npm run dev -- check https://example.com
npm run dev -- check https://example.com --engines openai,perplexity,gemini,claude -q 10

# Web: start the dashboard
npm run dev -- web --port 3000
```

## Architecture

The tool has three modes: **scan** (Crawl → Extract → Audit → Generate), **check** (AI visibility testing), and **web** (persistent dashboard).

### Entry Point & CLI

`src/cli.ts` — Commander.js with three subcommands (`scan`, `check`, `web`), progress display with ora spinners and chalk.

### Crawler (`src/crawler/`)

- **site-crawler.ts** — Crawlee's `CheerioCrawler` for concurrent page fetching. Same-domain policy, HTML size limits (2MB), GEO file discovery, link health checks, response time measurement.
- **page-data.ts** — Central TypeScript interfaces/types (`PageData`, `PageMeta`, `PageContent`, `SiteIdentity`, `SiteCrawlResult`, `AuditResult`, `CLIOptions`, `CheckOptions`, `SearchQuery`, `LLMResponse`, `VisibilityResult`, etc.).

### Extractors (`src/extractors/`)

Five modules extracting specific data from crawled HTML via Cheerio:

| Module | Extracts |
|--------|----------|
| `meta-extractor.ts` | Title, description, canonical, OG/Twitter cards, author, dates, robots meta, verification tokens, hreflang |
| `content-extractor.ts` | Headings (H1-H6), body text, FAQ items (4 detection patterns), lists, tables, citations |
| `nav-extractor.ts` | Navigation links, breadcrumbs, internal/external links, images with alt text |
| `structured-data-extractor.ts` | JSON-LD, microdata, RDFa |
| `site-identity-extractor.ts` | Organization name, logo, favicon, contact info, social links, tech stack |

### Analyzer (`src/analyzer/`)

`geo-auditor.ts` orchestrates 5 audit category modules with weighted scoring:

| Category | Weight | Module |
|----------|--------|--------|
| AI Infrastructure | 3x | `audits/ai-infrastructure.ts` — robots.txt, sitemap, llms.txt, AI policies, bot blocking |
| Content Quality | 2.5x | `audits/content-quality.ts` — structured data, FAQs, headings, freshness, readability, quotability |
| AI Discoverability | 2.5x | `audits/ai-discoverability.ts` — SSR detection, OG tags, trust signals, citation quality, breadcrumbs |
| Foundational SEO | 1.5x | `audits/foundational-seo.ts` — title tags, alt text, internal linking, HTTPS, URL structure, response time |
| Non-scored | 0x | `audits/non-scored.ts` — Informational items (security.txt, tdmrep.json, manifest.json, humans.txt) |

Score: 0-100 with grades A+ (≥90) through F (<50). Sub-scores: AI Search Health, E-E-A-T (Experience/Expertise/Authoritativeness/Trustworthiness), Citability, and per-platform readiness.

Additional analysis modules:
- **citability-scorer.ts** — Passage-level analysis (5 dimensions: answer quality 30%, self-containment 25%, readability 20%, statistical density 15%, uniqueness 10%)
- **eeat-scorer.ts** — E-E-A-T scoring (4x25pts: experience, expertise, authoritativeness, trustworthiness)
- **brand-scanner.ts** — External platform brand mention scanning (YouTube, Reddit, Wikipedia, LinkedIn)
- **platform-optimizer.ts** — Per-platform AI readiness (Google AIO, ChatGPT, Perplexity, Gemini)
- `geo-service-score.ts` — Specialized scoring for web dashboard integration

### Generators (`src/generators/`)

13 generator modules producing output files:

| Generator | Output |
|-----------|--------|
| `robots-txt.ts` | Enhanced robots.txt covering 13 AI crawlers |
| `llms-txt.ts` | Site map per llmstxt.org spec |
| `llms-full-txt.ts` | Full content dump as markdown |
| `ai-txt.ts` | AI interaction policies (`.txt` and `.json`) |
| `sitemap-xml.ts` | Standard XML sitemap |
| `structured-data.ts` | Per-page JSON-LD Schema.org markup |
| `security-txt.ts` | RFC 9116 security contact |
| `tdmrep-json.ts` | W3C TDM reservation policy |
| `humans-txt.ts` | Team and technology info |
| `manifest-json.ts` | Web app manifest |
| `audit-report.ts` | Interactive HTML compliance report |
| `comparison-report.ts` | Before/after compliance projection |
| `pdf-report.ts` | PDF generation from HTML reports (via Playwright) |
| `visibility-report.ts` | (in checker module) AI visibility report |

### Checker (`src/checker/`)

AI visibility testing across multiple LLM search engines:

- **query-generator.ts** — Extracts business context, generates search queries via LLM or template fallback, supports custom query files
- **citation-detector.ts** — Analyzes LLM responses for site mentions (cited vs mentioned vs absent)
- **visibility-scorer.ts** — Per-engine scoring (cited=100pts, mentioned=50pts), overall grade
- **visibility-report.ts** — HTML and JSON visibility reports
- **llm-clients/** — Provider integrations:
  - `base-client.ts` — Abstract base class
  - `openai-client.ts` — OpenAI (gpt-4o-mini with web search)
  - `perplexity-client.ts` — Perplexity (sonar with citations)
  - `gemini-client.ts` — Google Gemini (with grounding)
  - `claude-client.ts` — Anthropic Claude (with web search)

### Web Dashboard (`src/web/`)

Express.js web dashboard with SQLite persistence:

- **server.ts** — REST API for scan/check jobs, job history, domain management, scheduling, auth, activity logging
- **database.ts** — SQLite schema: jobs, schedules, domains, users/roles, sessions, activity logs
- **job-runner.ts** — Async job execution with EventEmitter progress streaming
- **auth.ts** — Password hashing, session tokens, secure cookies
- **scheduler.ts** — Cron-based job scheduling (daily/weekly/monthly)
- **diff-engine.ts** — Compares consecutive scan results for change detection
- **public/** — Static HTML UI (login, admin dashboard, sales dashboard, scanner, history)

### Utilities (`src/utils/`)

- `url-utils.ts` — URL normalization, domain extraction, same-domain checking, page section classification
- `markdown.ts` — Markdown conversion utilities

### Tests (`src/__tests__/`)

- `fixtures.ts` — Mock `SiteCrawlResult` objects for testing
- `geo-auditor.test.ts` — Audit system unit tests
- `comparison-report.test.ts` — Comparison report tests (in generators/)

## Key Patterns

- **ESM-only** — Package uses `"type": "module"` with TypeScript's bundler module resolution
- **All types in `page-data.ts`** — Central type definitions; all modules import from here
- **Cheerio-based extraction** — All HTML parsing uses Cheerio's jQuery-like API (no browser DOM)
- **Generator functions return strings** — Each generator takes crawl/identity data and returns file content; CLI handles writing
- **Multi-LLM support** — OpenAI, Claude, Gemini, Perplexity for visibility checks
- **13 AI crawlers** — GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, Google-Extended, Applebot-Extended, Meta-ExternalAgent, PerplexityBot, Amazonbot, CCBot, DuckAssistBot, Bytespider

## Environment Variables

```
ANTHROPIC_API_KEY    - Claude API key (for check command)
OPENAI_API_KEY       - OpenAI API key (for check command)
GOOGLE_API_KEY       - Google Gemini API key (for check command)
PERPLEXITY_API_KEY   - Perplexity API key (for check command)
```
