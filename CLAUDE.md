# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**geo-scraper** is a TypeScript CLI tool that crawls websites and generates 12+ compliance files for AI/LLM crawler readiness (robots.txt, llms.txt, ai.txt/json, structured data, etc.). It also audits existing GEO (Generative Engine Optimization) compliance with weighted scoring (0-100, letter grades A+-F).

## Build & Development Commands

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript (tsc → dist/)
npm run start        # Run compiled CLI (node dist/cli.js)
npm run dev          # Run in dev mode with tsx (no build step)
```

**Running the tool:**
```bash
# Development
npm run dev -- https://example.com
npm run dev -- https://example.com --audit-only
npm run dev -- https://example.com -o ./output -m 100 -c 5

# Production
node dist/cli.js https://example.com
```

There is no test framework, linter, or formatter configured.

## Architecture

The tool follows a 4-stage pipeline: **Crawl → Extract → Audit → Generate**.

### Entry Point & CLI

`src/cli.ts` — Parses CLI args with commander.js, orchestrates the pipeline, displays progress with ora spinners and chalk-colored output.

### Crawler (`src/crawler/`)

- **site-crawler.ts** — Uses Crawlee's `CheerioCrawler` for concurrent page fetching. Follows internal links, respects same-domain policy, filters out non-HTML files. Also fetches existing GEO files from the target site via HTTP.
- **page-data.ts** — All TypeScript interfaces/types for crawl results (`PageData`, `PageMeta`, `PageContent`, `SiteIdentity`, `SiteCrawlResult`, `AuditResult`, etc.).

### Extractors (`src/extractors/`)

Five modules that each extract a specific data type from crawled HTML using Cheerio:

| Module | Extracts |
|--------|----------|
| `meta-extractor.ts` | Title, description, canonical, OG/Twitter cards, author, dates |
| `content-extractor.ts` | Headings (H1-H6), body text, FAQ items (4 detection patterns), lists, tables |
| `nav-extractor.ts` | Navigation links, breadcrumbs, internal/external links, images with alt text |
| `structured-data-extractor.ts` | JSON-LD, microdata, RDFa |
| `site-identity-extractor.ts` | Organization name, logo, favicon, contact info, social links, tech stack |

### Analyzer (`src/analyzer/geo-auditor.ts`)

Scores GEO compliance across 15 audit items in 4 weighted categories:
- **Critical (3x):** robots.txt, sitemap.xml, llms.txt, structured data, server rendering
- **High (2x):** llms-full.txt, AI policy, meta descriptions, heading hierarchy
- **Medium (1x):** security.txt, TDM reservation, OG tags, manifest.json
- **Low (0.5x):** humans.txt, FAQ content

### Generators (`src/generators/`)

Eleven generator modules, each producing one or more output files. Key generators:
- `robots-txt.ts` — Enhanced robots.txt covering 13 AI crawlers (GPTBot, ClaudeBot, Google-Extended, PerplexityBot, etc.)
- `llms-txt.ts` / `llms-full-txt.ts` — Site map and full content dump per llmstxt.org spec
- `ai-txt.ts` — Both `.txt` and `.json` AI interaction policies
- `structured-data.ts` — Per-page JSON-LD Schema.org markup
- `audit-report.ts` — Visual HTML compliance report

### Utilities (`src/utils/`)

- `url-utils.ts` — URL normalization, domain extraction, same-domain checking, page section classification
- `markdown.ts` — Markdown conversion utilities

## Key Patterns

- **ESM-only** — Package uses `"type": "module"` with TypeScript's bundler module resolution
- **All types in `page-data.ts`** — Central type definitions file; generators and extractors both import from here
- **Cheerio-based extraction** — All HTML parsing uses Cheerio's jQuery-like API (no browser DOM)
- **Generator functions return strings** — Each generator takes crawl/identity data and returns the file content as a string; the CLI handles file writing
- **13 AI crawlers** — The tool explicitly handles: GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, Google-Extended, Applebot-Extended, Meta-ExternalAgent, PerplexityBot, Amazonbot, CCBot, DuckAssistBot, Bytespider
