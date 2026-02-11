# geo-scraper

Scrape any website and generate all **Generative Engine Optimization (GEO)** compliance files for 100% AI/LLM crawler readiness.

**Input:** A URL. **Output:** A directory of ready-to-deploy files + an audit report.

## Generated Files (12)

| File | Location | Description |
|------|----------|-------------|
| `llms.txt` | `/llms.txt` | Markdown site map for LLMs (llmstxt.org spec) |
| `llms-full.txt` | `/llms-full.txt` | Complete content dump as markdown |
| `robots.txt` | `/robots.txt` | Enhanced with 13 AI crawler directives |
| `sitemap.xml` | `/sitemap.xml` | Standard XML sitemap with all URLs |
| `ai.txt` | `/ai.txt` | AI interaction policy (human-readable) |
| `ai.json` | `/ai.json` | AI interaction policy (machine-readable) |
| `security.txt` | `/.well-known/security.txt` | RFC 9116 security contact |
| `tdmrep.json` | `/.well-known/tdmrep.json` | W3C TDM reservation |
| `humans.txt` | `/humans.txt` | Team and technology info |
| `manifest.json` | `/manifest.json` | Web app manifest |
| `structured-data/*.json` | Per-page | JSON-LD Schema.org markup |
| `audit-report.html` | Output only | Visual GEO compliance report |

## Quick Start

```bash
# Install dependencies
npm install

# Build
npm run build

# Scrape a site and generate all GEO files
node dist/cli.js https://example.com

# Or use tsx for development
npm run dev -- https://example.com
```

## CLI Options

```
Usage: geo-scraper [options] <url>

Arguments:
  url                          Website URL to scrape

Options:
  -o, --output <dir>           Output directory (default: ./geo-output)
  -m, --max-pages <n>          Maximum pages to crawl (default: 50)
  -c, --concurrency <n>        Concurrent requests (default: 3)
  --js-render                  Use Playwright for JS-rendered pages
  --audit-only                 Only audit, don't generate files
  --allow-training             Allow AI training (default)
  --deny-training              Deny AI training in policies
  --contact-email <email>      Contact email for security.txt
  -v, --verbose                Verbose logging
  -V, --version                Output version
  -h, --help                   Display help
```

## Examples

```bash
# Basic scan
node dist/cli.js https://example.com

# Deny AI training, set contact email
node dist/cli.js https://example.com --deny-training --contact-email security@example.com

# Crawl more pages with higher concurrency
node dist/cli.js https://example.com --max-pages 200 --concurrency 5

# Audit only (no file generation)
node dist/cli.js https://example.com --audit-only
```

## AI Crawlers Covered

GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, Google-Extended, Applebot-Extended, Meta-ExternalAgent, PerplexityBot, Amazonbot, CCBot, DuckAssistBot, Bytespider

## Tech Stack

- **Crawling:** Crawlee (CheerioCrawler)
- **CLI:** Commander.js
- **HTML→Markdown:** Turndown
- **Progress:** chalk + ora
- **Language:** TypeScript (strict mode)
