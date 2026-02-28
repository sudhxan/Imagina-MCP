# 🎨 MCP Logo Downloader

> An MCP (Model Context Protocol) server that downloads high-quality company and integration logos through natural language prompts — directly from your IDE.

<div align="center">

**200+ companies** · **Zero API keys** · **Fuzzy matching** · **4-source fallback**

</div>

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🏢 **200+ Companies** | Pre-mapped database of popular companies, integrations, and frameworks |
| 🌐 **Dynamic Live Search** | Uses DuckDuckGo HTML search to find exact domains for *any* company not in the database |
| 🔍 **Fuzzy Matching** | Handles typos and abbreviations ("shoppify" → Shopify, "GH" → GitHub) |
| 🔄 **Multi-Source Fallback** | 4 cascading sources ensure near-100% success rate |
| 🖼️ **Image Validation** | Magic byte verification rejects error pages and broken images |
| 📦 **Bulk Downloads** | Download up to 20 logos at once with parallel processing |
| 🔑 **Zero Configuration** | No API keys required — all sources (including search) are free and public |
| 🗂️ **Categorized** | Browse by category: E-Commerce, CRM, Payments, Cloud, AI, and more |

## 🏗️ Architecture

```
User Prompt → MCP Client (IDE)
                    ↓
              MCP Server
                    ↓
            Domain Resolver ─── Curated DB (200+ entries)
                    ↓              ├─ Fuzzy matching
                    ↓              └─ DuckDuckGo Live Search
              Logo Fetcher ↓
           ┌────────┼────────┬────────┐
       Clearbit  Google   DuckDuckGo  Direct
       (best)   Favicon   Instant    Favicon
                    ↓
            Image Validator ─── Magic byte checks
                    ↓
             Save to assets/
```

**Logo sources tried in order of quality:**
1. **Clearbit Logo API** — Highest quality, up to 1024px PNG
2. **Google Favicon Service** — Very reliable, up to 256px
3. **DuckDuckGo Instant Answer** — Structured data with logo URLs
4. **Direct Favicon** — Fetches apple-touch-icon/favicon from the domain

## 📦 Installation

### Prerequisites
- [Node.js](https://nodejs.org/) v18 or higher
- npm (comes with Node.js)

### Setup

```bash
# Clone the repository
git clone https://github.com/your-username/MCP_Download_Logo.git
cd MCP_Download_Logo

# Install dependencies
npm install

# Build the project
npm run build
```

## 🔌 IDE Integration

### Antigravity (Google)

Add to your Antigravity settings (`.gemini/settings.json`):

```json
{
  "mcpServers": {
    "logo-downloader": {
      "command": "node",
      "args": ["/absolute/path/to/MCP_Download_Logo/dist/index.js"],
      "env": {
        "MCP_LOGO_ASSETS_DIR": "/absolute/path/to/your/project/assets"
      }
    }
  }
}
```

### Cursor

Create or edit `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "logo-downloader": {
      "command": "node",
      "args": ["/absolute/path/to/MCP_Download_Logo/dist/index.js"],
      "env": {
        "MCP_LOGO_ASSETS_DIR": "/absolute/path/to/your/project/assets"
      }
    }
  }
}
```

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "logo-downloader": {
      "command": "node",
      "args": ["/absolute/path/to/MCP_Download_Logo/dist/index.js"],
      "env": {
        "MCP_LOGO_ASSETS_DIR": "/absolute/path/to/your/project/assets"
      }
    }
  }
}
```

### VS Code (Copilot)

Add to your VS Code `settings.json`:

```json
{
  "mcp": {
    "servers": {
      "logo-downloader": {
        "command": "node",
        "args": ["/absolute/path/to/MCP_Download_Logo/dist/index.js"],
        "env": {
          "MCP_LOGO_ASSETS_DIR": "${workspaceFolder}/assets"
        }
      }
    }
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "logo-downloader": {
      "command": "node",
      "args": ["/absolute/path/to/MCP_Download_Logo/dist/index.js"],
      "env": {
        "MCP_LOGO_ASSETS_DIR": "/absolute/path/to/your/project/assets"
      }
    }
  }
}
```

> **Note:** Replace `/absolute/path/to/MCP_Download_Logo` with the actual path where you cloned this repo. Set `MCP_LOGO_ASSETS_DIR` to control where logos are saved (defaults to `./assets` in the server directory).

## 🛠️ Tools Reference

### `download_logo`

Download a single company's logo.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `company` | `string` | *(required)* | Company name (e.g., "shopify", "hubspot") |
| `size` | `"small" \| "medium" \| "large"` | `"large"` | Logo size: 64px / 128px / 256px |
| `format` | `"png" \| "jpg" \| "original"` | `"original"` | Output format |

**Example prompt:** *"Download the Shopify logo"*

**Output:**
```
✅ Logo downloaded successfully!

📦 Company: shopify
🌐 Domain: shopify.com
🎯 Match confidence: exact
📂 Category: E-Commerce

💾 Saved to: /path/to/assets/shopify.png
🖼️  Format: PNG
📏 Size: 15.2 KB
🔗 Source: Clearbit Logo API
```

---

### `search_companies`

Search the curated company database.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | `string` | *(required)* | Search term |
| `category` | `string` | *(optional)* | Filter by category |
| `limit` | `number` | `25` | Max results |

**Example prompt:** *"Search for payment companies in the logo database"*

**Available categories:** E-Commerce, CRM, Marketing, Cloud, DevTools, Payments, Communication, Collaboration, AI, Analytics, Social, Auth, Security, Design, Framework, Language, Storage, CDN, CMS, ERP, Entertainment, Tech

---

### `download_bulk_logos`

Download logos for multiple companies at once.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `companies` | `string[]` | *(required)* | Array of company names (max 20) |
| `size` | `"small" \| "medium" \| "large"` | `"large"` | Logo size for all downloads |

**Example prompt:** *"Download logos for Shopify, Stripe, HubSpot, Slack, and GitHub"*

## 🧪 Testing

```bash
# Run the smoke test suite
npm test

# What it tests:
# ✅ Domain resolution (exact, alias, fuzzy, inferred)
# ✅ Company database search
# ✅ Image validation (magic bytes, SVG, HTML rejection)
# ✅ Live logo downloads for GitHub, Stripe, Shopify
```

## 🌐 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_LOGO_ASSETS_DIR` | `./assets` | Directory where downloaded logos are saved |

## 📂 Project Structure

```
MCP_Download_Logo/
├── src/
│   ├── index.ts                    # MCP server entry point
│   └── services/
│       ├── domain-resolver.ts      # Company → domain mapping (200+ entries)
│       ├── logo-fetcher.ts         # Multi-source cascading downloader
│       └── image-validator.ts      # Magic byte image validation
├── test/
│   └── smoke-test.ts              # Comprehensive test suite
├── assets/                        # Downloaded logos (auto-created)
├── package.json
├── tsconfig.json
└── README.md
```

## 📋 Supported Companies (Partial List)

<details>
<summary>Click to expand full list (200+ companies)</summary>

**E-Commerce:** Shopify, WooCommerce, BigCommerce, Magento, Squarespace, Wix, Etsy, Amazon, eBay

**CRM & Marketing:** HubSpot, Salesforce, Mailchimp, Marketo, ActiveCampaign, Klaviyo, Intercom, Zendesk, Pipedrive, Zoho

**Cloud:** AWS, Google Cloud, Azure, DigitalOcean, Heroku, Vercel, Netlify, Cloudflare, Supabase, Firebase, Railway

**DevTools:** GitHub, GitLab, Bitbucket, Docker, Kubernetes, Jenkins, Sentry, Datadog, Postman, Terraform, Grafana, Redis, MongoDB, PostgreSQL

**Payments:** Stripe, PayPal, Square, Braintree, Adyen, Klarna, Razorpay, Plaid, Wise

**Communication:** Slack, Discord, Microsoft Teams, Zoom, Telegram, Twilio, SendGrid, Notion, Airtable, Asana, Trello, Linear, Figma

**AI:** OpenAI, Anthropic, Google, DeepMind, Hugging Face, Cohere, Replicate, Stability AI, Midjourney, Cursor, Perplexity, Mistral

**Analytics:** Google Analytics, Mixpanel, Amplitude, Segment, Hotjar, Tableau, Snowflake, Databricks

**Frameworks:** React, Next.js, Vue, Angular, Svelte, Remix, Astro, Tailwind CSS, Node.js, Deno, Bun, Django, Flask, FastAPI, Rails, Laravel, Spring, Flutter

**Social Media:** Facebook, Instagram, Twitter/X, LinkedIn, Pinterest, TikTok, Reddit, YouTube

**And many more...**

</details>

## 📄 License

MIT License — free to use, modify, and distribute.
