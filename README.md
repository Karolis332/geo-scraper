# geo-scraper

Scrape any website and generate all **Generative Engine Optimization (GEO)** compliance files + get a comprehensive audit with AI platform readiness scores.

**Input:** A URL. **Output:** Ready-to-deploy files, an interactive audit report, a client-ready markdown report, and schema templates.

## What It Does

1. **Crawls** your site (respects robots.txt, configurable depth/concurrency)
2. **Audits** 50+ GEO signals across 5 categories with weighted scoring
3. **Generates** all missing AI/LLM compliance files
4. **Scores** readiness for each AI platform (Google AIO, ChatGPT, Perplexity, Gemini, Bing Copilot)
5. **Detects** AI-generated content, E-E-A-T signals, and citation readiness
6. **Checks** real AI engine visibility (optional, requires API keys)

## Quick Start

```bash
npm install
npm run build

# Full scan — audit + generate files
node dist/cli.js scan https://example.com

# Audit only — no file generation
node dist/cli.js scan https://example.com --audit-only

# Include brand authority scanning
node dist/cli.js scan https://example.com --brand-scan

# Check visibility across AI search engines (requires API keys)
node dist/cli.js check https://example.com --engines openai,perplexity
```

## Commands

### `scan` — Crawl and Audit

```
geo-scraper scan [options] <url>

Options:
  -o, --output <dir>       Output directory (default: "./geo-output")
  -m, --max-pages <n>      Maximum pages to crawl (default: 500)
  -c, --concurrency <n>    Concurrent requests (default: 3)
  --audit-only             Only audit, don't generate files
  --allow-training         Allow AI training in policies (default)
  --deny-training          Deny AI training in policies
  --contact-email <email>  Contact email for security.txt and ai.txt
  --brand-scan             Scan brand mentions on YouTube, Reddit, Wikipedia, LinkedIn
  --pdf                    Also generate PDF versions of reports
  -v, --verbose            Verbose output
```

### `check` — AI Visibility Check

```
geo-scraper check [options] <url>

Options:
  -o, --output <dir>     Output directory (default: "./geo-output")
  -m, --max-pages <n>    Max pages to crawl (default: 20)
  -q, --queries <n>      Number of queries to generate (default: 10)
  --engines <list>       Comma-separated: openai,perplexity,gemini,claude
  --query-file <path>    File with custom queries (one per line)
  -r, --region <region>  Geographic region for targeted queries
  -v, --verbose          Verbose output
```

### `web` — Dashboard

```
geo-scraper web [options]

Options:
  --host <host>   Bind address (default: "localhost")
  --port <port>   Port (default: 4173)
```

## Audit Scoring

50+ checks across 5 weighted categories:

| Category | Weight | What It Covers |
|----------|--------|----------------|
| Content Quality | 3.0x | Structure, freshness, schema diversity, readability, quotability, topic clusters |
| AI Discoverability | 2.5x | SSR, indexing, OG/Twitter tags, trust signals, citations, brand authority |
| Foundational SEO | 2.5x | Titles, alt text, internal linking, HTTPS, Core Web Vitals, canonicals |
| AI Infrastructure | 1.5x | robots.txt, llms.txt, ai.txt, bot strategy, agent protocols |
| Non-Scored | 0x | security.txt, tdmrep.json, humans.txt, manifest.json |

### Sub-Scores

- **AI Search Health** — composite of AI-specific infrastructure items
- **E-E-A-T Score** — Experience, Expertise, Authoritativeness, Trustworthiness (Google's quality framework)
- **AI Citability** — how likely AI engines are to quote your content
- **AI Content Risk** — detection of AI-generated content patterns
- **AI Platform Readiness** — per-platform scores for Google AIO, ChatGPT, Perplexity, Gemini, Bing Copilot

## Generated Output

### Files (deploy to your site)

| File | Location | Description |
|------|----------|-------------|
| `llms.txt` | `/llms.txt` | Markdown site map for LLMs ([llmstxt.org](https://llmstxt.org) spec) |
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

### Reports (for analysis)

| File | Description |
|------|-------------|
| `audit-report.html` | Interactive visual audit report with all scores and details |
| `client-report.md` | Client-ready markdown report with executive summary and action plan |
| `comparison-report.html` | Side-by-side comparison with industry benchmarks |
| `schema-templates/*.json` | Ready-to-use schema templates based on detected site type |
| `summary.json` | Machine-readable full audit data |

## Region Auto-Detection

The tool automatically detects where a website operates and tunes search queries accordingly:

- **Domain TLD** — `.lt` sites get Lithuanian queries, `.de` gets German, etc. (40+ country TLDs)
- **hreflang tags** — primary language/country from meta tags
- **JSON-LD address** — structured address data from schema markup
- **Content language** — HTML `lang` attribute

For detected regions, template queries are generated in the native language (~70%) plus English (~30%) for international AI engines.

## AI Crawlers Covered

GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, Google-Extended, Applebot-Extended, Meta-ExternalAgent, PerplexityBot, Amazonbot, CCBot, DuckAssistBot, Bytespider

## Web Dashboard

```bash
node dist/cli.js web --host 0.0.0.0 --port 4173
```

Login: `http://localhost:4173/login.html`

Default users (first run only):
- `admin` / `admin12345`
- `sales` / `sales12345`

Override with env vars: `GEO_ADMIN_PASSWORD`, `GEO_SALES_PASSWORD`

### Sales workflow
- Sales users scan domains via `/employee.html` with real-time progress
- Scanned domains auto-added to the user's allowed domain list
- Sales playbooks filtered to each user's domains

### Shipped + diagnostics
- Mark completed scans as **Shipped** in admin dashboard
- Enables weekly diagnostics schedule with trend tracking
- Shows confidence scores and recommended next changes

## Tech Stack

- **Runtime:** Node.js >= 20
- **Language:** TypeScript (strict mode)
- **Crawling:** Crawlee (CheerioCrawler)
- **CLI:** Commander.js
- **HTML to Markdown:** Turndown
- **Database:** better-sqlite3
- **Web:** Express + vanilla JS dashboard
- **PDF:** Puppeteer (optional, for `--pdf` flag)
