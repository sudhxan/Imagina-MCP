/**
 * Domain Resolver — The brain of the MCP Logo Server
 *
 * Resolves company/integration names to their canonical domains with high accuracy.
 * Uses a curated database of 200+ companies, fuzzy matching for typo tolerance,
 * and smart domain inference as a final fallback.
 */

import { distance } from "fastest-levenshtein";
import * as cheerio from "cheerio";

// ─── Curated Company → Domain Database ──────────────────────────────────────

export interface CompanyEntry {
    domain: string;
    aliases: string[];
    category: string;
}

/**
 * Curated mapping of 200+ companies and integrations to their canonical domains.
 * Organized by category for maintainability. Each entry includes aliases for
 * flexible matching (e.g., "GH" → "github.com").
 */
const COMPANY_DATABASE: Record<string, CompanyEntry> = {
    // ── E-Commerce & Retail ──
    shopify: { domain: "shopify.com", aliases: ["shopify plus"], category: "E-Commerce" },
    woocommerce: { domain: "woocommerce.com", aliases: ["woo commerce", "woo"], category: "E-Commerce" },
    bigcommerce: { domain: "bigcommerce.com", aliases: ["big commerce"], category: "E-Commerce" },
    magento: { domain: "magento.com", aliases: ["adobe commerce"], category: "E-Commerce" },
    squarespace: { domain: "squarespace.com", aliases: ["square space"], category: "E-Commerce" },
    wix: { domain: "wix.com", aliases: [], category: "E-Commerce" },
    etsy: { domain: "etsy.com", aliases: [], category: "E-Commerce" },
    amazon: { domain: "amazon.com", aliases: ["aws marketplace"], category: "E-Commerce" },
    ebay: { domain: "ebay.com", aliases: [], category: "E-Commerce" },
    prestashop: { domain: "prestashop.com", aliases: ["presta shop"], category: "E-Commerce" },
    volusion: { domain: "volusion.com", aliases: [], category: "E-Commerce" },
    flipkart: { domain: "flipkart.com", aliases: [], category: "E-Commerce" },

    // ── CRM & Marketing ──
    hubspot: { domain: "hubspot.com", aliases: ["hub spot", "hs"], category: "CRM" },
    salesforce: { domain: "salesforce.com", aliases: ["sfdc", "sf"], category: "CRM" },
    mailchimp: { domain: "mailchimp.com", aliases: ["mail chimp"], category: "Marketing" },
    marketo: { domain: "marketo.com", aliases: [], category: "Marketing" },
    activecampaign: { domain: "activecampaign.com", aliases: ["active campaign"], category: "Marketing" },
    constantcontact: { domain: "constantcontact.com", aliases: ["constant contact"], category: "Marketing" },
    sendinblue: { domain: "brevo.com", aliases: ["brevo"], category: "Marketing" },
    klaviyo: { domain: "klaviyo.com", aliases: [], category: "Marketing" },
    intercom: { domain: "intercom.com", aliases: [], category: "CRM" },
    zendesk: { domain: "zendesk.com", aliases: [], category: "CRM" },
    freshdesk: { domain: "freshdesk.com", aliases: [], category: "CRM" },
    pipedrive: { domain: "pipedrive.com", aliases: ["pipe drive"], category: "CRM" },
    zoho: { domain: "zoho.com", aliases: [], category: "CRM" },
    drift: { domain: "drift.com", aliases: [], category: "CRM" },
    freshsales: { domain: "freshworks.com", aliases: ["fresh sales", "freshworks"], category: "CRM" },

    // ── Cloud & Infrastructure ──
    aws: { domain: "aws.amazon.com", aliases: ["amazon web services"], category: "Cloud" },
    gcp: { domain: "cloud.google.com", aliases: ["google cloud", "google cloud platform"], category: "Cloud" },
    azure: { domain: "azure.microsoft.com", aliases: ["microsoft azure"], category: "Cloud" },
    digitalocean: { domain: "digitalocean.com", aliases: ["digital ocean", "do"], category: "Cloud" },
    heroku: { domain: "heroku.com", aliases: [], category: "Cloud" },
    vercel: { domain: "vercel.com", aliases: ["zeit"], category: "Cloud" },
    netlify: { domain: "netlify.com", aliases: [], category: "Cloud" },
    cloudflare: { domain: "cloudflare.com", aliases: ["cloud flare", "cf"], category: "Cloud" },
    linode: { domain: "linode.com", aliases: ["akamai"], category: "Cloud" },
    render: { domain: "render.com", aliases: [], category: "Cloud" },
    railway: { domain: "railway.app", aliases: [], category: "Cloud" },
    supabase: { domain: "supabase.com", aliases: [], category: "Cloud" },
    firebase: { domain: "firebase.google.com", aliases: [], category: "Cloud" },
    planetscale: { domain: "planetscale.com", aliases: ["planet scale"], category: "Cloud" },
    neon: { domain: "neon.tech", aliases: [], category: "Cloud" },

    // ── Developer Tools ──
    github: { domain: "github.com", aliases: ["gh"], category: "DevTools" },
    gitlab: { domain: "gitlab.com", aliases: ["gl"], category: "DevTools" },
    bitbucket: { domain: "bitbucket.org", aliases: ["bit bucket", "bb"], category: "DevTools" },
    jira: { domain: "atlassian.com", aliases: [], category: "DevTools" },
    atlassian: { domain: "atlassian.com", aliases: [], category: "DevTools" },
    confluence: { domain: "atlassian.com/software/confluence", aliases: [], category: "DevTools" },
    docker: { domain: "docker.com", aliases: [], category: "DevTools" },
    kubernetes: { domain: "kubernetes.io", aliases: ["k8s"], category: "DevTools" },
    jenkins: { domain: "jenkins.io", aliases: [], category: "DevTools" },
    circleci: { domain: "circleci.com", aliases: ["circle ci"], category: "DevTools" },
    travisci: { domain: "travis-ci.com", aliases: ["travis ci", "travis"], category: "DevTools" },
    sentry: { domain: "sentry.io", aliases: [], category: "DevTools" },
    datadog: { domain: "datadoghq.com", aliases: ["data dog"], category: "DevTools" },
    newrelic: { domain: "newrelic.com", aliases: ["new relic"], category: "DevTools" },
    postman: { domain: "postman.com", aliases: [], category: "DevTools" },
    insomnia: { domain: "insomnia.rest", aliases: [], category: "DevTools" },
    terraform: { domain: "terraform.io", aliases: ["tf"], category: "DevTools" },
    hashicorp: { domain: "hashicorp.com", aliases: [], category: "DevTools" },
    grafana: { domain: "grafana.com", aliases: [], category: "DevTools" },
    prometheus: { domain: "prometheus.io", aliases: [], category: "DevTools" },
    elasticsearch: { domain: "elastic.co", aliases: ["elastic", "elk"], category: "DevTools" },
    kibana: { domain: "elastic.co/kibana", aliases: [], category: "DevTools" },
    redis: { domain: "redis.io", aliases: [], category: "DevTools" },
    mongodb: { domain: "mongodb.com", aliases: ["mongo"], category: "DevTools" },
    postgresql: { domain: "postgresql.org", aliases: ["postgres", "pg"], category: "DevTools" },
    mysql: { domain: "mysql.com", aliases: [], category: "DevTools" },
    sqlite: { domain: "sqlite.org", aliases: [], category: "DevTools" },
    npm: { domain: "npmjs.com", aliases: [], category: "DevTools" },
    yarn: { domain: "yarnpkg.com", aliases: [], category: "DevTools" },
    webpack: { domain: "webpack.js.org", aliases: [], category: "DevTools" },
    vite: { domain: "vitejs.dev", aliases: ["vitejs"], category: "DevTools" },
    eslint: { domain: "eslint.org", aliases: [], category: "DevTools" },
    prettier: { domain: "prettier.io", aliases: [], category: "DevTools" },

    // ── Payments ──
    stripe: { domain: "stripe.com", aliases: [], category: "Payments" },
    paypal: { domain: "paypal.com", aliases: ["pay pal"], category: "Payments" },
    square: { domain: "squareup.com", aliases: ["squareup"], category: "Payments" },
    braintree: { domain: "braintreepayments.com", aliases: ["brain tree"], category: "Payments" },
    adyen: { domain: "adyen.com", aliases: [], category: "Payments" },
    klarna: { domain: "klarna.com", aliases: [], category: "Payments" },
    afterpay: { domain: "afterpay.com", aliases: ["after pay"], category: "Payments" },
    razorpay: { domain: "razorpay.com", aliases: ["razor pay"], category: "Payments" },
    plaid: { domain: "plaid.com", aliases: [], category: "Payments" },
    wise: { domain: "wise.com", aliases: ["transferwise"], category: "Payments" },

    // ── Communication & Collaboration ──
    slack: { domain: "slack.com", aliases: [], category: "Communication" },
    discord: { domain: "discord.com", aliases: [], category: "Communication" },
    teams: { domain: "microsoft.com/en-us/microsoft-teams", aliases: ["microsoft teams", "ms teams"], category: "Communication" },
    zoom: { domain: "zoom.us", aliases: [], category: "Communication" },
    telegram: { domain: "telegram.org", aliases: ["tg"], category: "Communication" },
    whatsapp: { domain: "whatsapp.com", aliases: ["what's app", "wa"], category: "Communication" },
    twilio: { domain: "twilio.com", aliases: [], category: "Communication" },
    sendgrid: { domain: "sendgrid.com", aliases: ["send grid"], category: "Communication" },
    mailgun: { domain: "mailgun.com", aliases: ["mail gun"], category: "Communication" },
    notion: { domain: "notion.so", aliases: [], category: "Collaboration" },
    airtable: { domain: "airtable.com", aliases: ["air table"], category: "Collaboration" },
    asana: { domain: "asana.com", aliases: [], category: "Collaboration" },
    trello: { domain: "trello.com", aliases: [], category: "Collaboration" },
    monday: { domain: "monday.com", aliases: ["monday.com"], category: "Collaboration" },
    clickup: { domain: "clickup.com", aliases: ["click up"], category: "Collaboration" },
    basecamp: { domain: "basecamp.com", aliases: ["base camp"], category: "Collaboration" },
    linear: { domain: "linear.app", aliases: [], category: "Collaboration" },
    miro: { domain: "miro.com", aliases: [], category: "Collaboration" },
    figma: { domain: "figma.com", aliases: [], category: "Collaboration" },
    canva: { domain: "canva.com", aliases: [], category: "Collaboration" },

    // ── AI & ML ──
    openai: { domain: "openai.com", aliases: ["open ai", "chatgpt", "gpt"], category: "AI" },
    anthropic: { domain: "anthropic.com", aliases: ["claude"], category: "AI" },
    google: { domain: "google.com", aliases: [], category: "AI" },
    deepmind: { domain: "deepmind.google", aliases: ["deep mind"], category: "AI" },
    huggingface: { domain: "huggingface.co", aliases: ["hugging face", "hf"], category: "AI" },
    cohere: { domain: "cohere.com", aliases: [], category: "AI" },
    replicate: { domain: "replicate.com", aliases: [], category: "AI" },
    stability: { domain: "stability.ai", aliases: ["stable diffusion", "stability ai"], category: "AI" },
    midjourney: { domain: "midjourney.com", aliases: ["mid journey", "mj"], category: "AI" },
    cursor: { domain: "cursor.com", aliases: ["cursor ai"], category: "AI" },
    perplexity: { domain: "perplexity.ai", aliases: [], category: "AI" },
    mistral: { domain: "mistral.ai", aliases: ["mistral ai"], category: "AI" },
    elevenlabs: { domain: "elevenlabs.io", aliases: ["eleven labs", "11labs"], category: "AI" },

    // ── Analytics & Data ──
    googleanalytics: { domain: "analytics.google.com", aliases: ["google analytics", "ga"], category: "Analytics" },
    mixpanel: { domain: "mixpanel.com", aliases: ["mix panel"], category: "Analytics" },
    amplitude: { domain: "amplitude.com", aliases: [], category: "Analytics" },
    segment: { domain: "segment.com", aliases: [], category: "Analytics" },
    hotjar: { domain: "hotjar.com", aliases: ["hot jar"], category: "Analytics" },
    looker: { domain: "looker.com", aliases: [], category: "Analytics" },
    tableau: { domain: "tableau.com", aliases: [], category: "Analytics" },
    powerbi: { domain: "powerbi.microsoft.com", aliases: ["power bi", "microsoft power bi"], category: "Analytics" },
    snowflake: { domain: "snowflake.com", aliases: [], category: "Analytics" },
    databricks: { domain: "databricks.com", aliases: ["data bricks"], category: "Analytics" },
    dbt: { domain: "getdbt.com", aliases: ["data build tool"], category: "Analytics" },

    // ── Social Media ──
    facebook: { domain: "facebook.com", aliases: ["fb", "meta"], category: "Social" },
    instagram: { domain: "instagram.com", aliases: ["ig", "insta"], category: "Social" },
    twitter: { domain: "x.com", aliases: ["x", "x.com"], category: "Social" },
    linkedin: { domain: "linkedin.com", aliases: ["linked in", "li"], category: "Social" },
    pinterest: { domain: "pinterest.com", aliases: [], category: "Social" },
    tiktok: { domain: "tiktok.com", aliases: ["tik tok"], category: "Social" },
    reddit: { domain: "reddit.com", aliases: [], category: "Social" },
    youtube: { domain: "youtube.com", aliases: ["yt"], category: "Social" },
    snapchat: { domain: "snapchat.com", aliases: ["snap"], category: "Social" },
    threads: { domain: "threads.net", aliases: [], category: "Social" },

    // ── Auth & Security ──
    auth0: { domain: "auth0.com", aliases: [], category: "Auth" },
    okta: { domain: "okta.com", aliases: [], category: "Auth" },
    clerk: { domain: "clerk.com", aliases: [], category: "Auth" },
    stytch: { domain: "stytch.com", aliases: [], category: "Auth" },
    onelogin: { domain: "onelogin.com", aliases: ["one login"], category: "Auth" },
    duo: { domain: "duo.com", aliases: ["duo security"], category: "Auth" },
    crowdstrike: { domain: "crowdstrike.com", aliases: ["crowd strike"], category: "Security" },
    snyk: { domain: "snyk.io", aliases: [], category: "Security" },
    vault: { domain: "vaultproject.io", aliases: ["hashicorp vault"], category: "Security" },
    onepassword: { domain: "1password.com", aliases: ["1password"], category: "Security" },
    lastpass: { domain: "lastpass.com", aliases: ["last pass"], category: "Security" },

    // ── Design & UI ──
    sketch: { domain: "sketch.com", aliases: [], category: "Design" },
    invision: { domain: "invisionapp.com", aliases: ["in vision"], category: "Design" },
    zeplin: { domain: "zeplin.io", aliases: [], category: "Design" },
    framer: { domain: "framer.com", aliases: [], category: "Design" },
    storybook: { domain: "storybook.js.org", aliases: [], category: "Design" },
    chromatic: { domain: "chromatic.com", aliases: [], category: "Design" },
    adobe: { domain: "adobe.com", aliases: [], category: "Design" },
    "adobe xd": { domain: "adobe.com", aliases: ["xd"], category: "Design" },

    // ── Frameworks & Languages ──
    react: { domain: "react.dev", aliases: ["reactjs"], category: "Framework" },
    nextjs: { domain: "nextjs.org", aliases: ["next.js", "next js", "next"], category: "Framework" },
    vue: { domain: "vuejs.org", aliases: ["vuejs", "vue.js"], category: "Framework" },
    nuxt: { domain: "nuxt.com", aliases: ["nuxtjs", "nuxt.js"], category: "Framework" },
    angular: { domain: "angular.io", aliases: ["angularjs"], category: "Framework" },
    svelte: { domain: "svelte.dev", aliases: ["sveltejs"], category: "Framework" },
    remix: { domain: "remix.run", aliases: ["remix.run"], category: "Framework" },
    astro: { domain: "astro.build", aliases: ["astro.build"], category: "Framework" },
    tailwindcss: { domain: "tailwindcss.com", aliases: ["tailwind", "tailwind css"], category: "Framework" },
    bootstrap: { domain: "getbootstrap.com", aliases: [], category: "Framework" },
    nodejs: { domain: "nodejs.org", aliases: ["node.js", "node js", "node"], category: "Framework" },
    deno: { domain: "deno.com", aliases: [], category: "Framework" },
    bun: { domain: "bun.sh", aliases: [], category: "Framework" },
    python: { domain: "python.org", aliases: [], category: "Language" },
    rust: { domain: "rust-lang.org", aliases: ["rustlang"], category: "Language" },
    go: { domain: "go.dev", aliases: ["golang"], category: "Language" },
    swift: { domain: "swift.org", aliases: [], category: "Language" },
    kotlin: { domain: "kotlinlang.org", aliases: ["kotlin lang"], category: "Language" },
    typescript: { domain: "typescriptlang.org", aliases: ["ts"], category: "Language" },
    flutter: { domain: "flutter.dev", aliases: [], category: "Framework" },
    django: { domain: "djangoproject.com", aliases: ["django project"], category: "Framework" },
    flask: { domain: "flask.palletsprojects.com", aliases: [], category: "Framework" },
    fastapi: { domain: "fastapi.tiangolo.com", aliases: ["fast api"], category: "Framework" },
    rails: { domain: "rubyonrails.org", aliases: ["ruby on rails", "ror"], category: "Framework" },
    laravel: { domain: "laravel.com", aliases: [], category: "Framework" },
    spring: { domain: "spring.io", aliases: ["spring boot"], category: "Framework" },
    express: { domain: "expressjs.com", aliases: ["express.js", "expressjs"], category: "Framework" },

    // ── Storage & CDN ──
    s3: { domain: "aws.amazon.com/s3", aliases: ["amazon s3", "aws s3"], category: "Storage" },
    cloudinary: { domain: "cloudinary.com", aliases: [], category: "Storage" },
    imgix: { domain: "imgix.com", aliases: [], category: "Storage" },
    uploadcare: { domain: "uploadcare.com", aliases: ["upload care"], category: "Storage" },
    mux: { domain: "mux.com", aliases: [], category: "Storage" },
    bunnycdn: { domain: "bunny.net", aliases: ["bunny cdn", "bunny.net"], category: "CDN" },
    fastly: { domain: "fastly.com", aliases: [], category: "CDN" },

    // ── CMS ──
    wordpress: { domain: "wordpress.org", aliases: ["wp"], category: "CMS" },
    contentful: { domain: "contentful.com", aliases: [], category: "CMS" },
    strapi: { domain: "strapi.io", aliases: [], category: "CMS" },
    sanity: { domain: "sanity.io", aliases: [], category: "CMS" },
    ghost: { domain: "ghost.org", aliases: [], category: "CMS" },
    prismic: { domain: "prismic.io", aliases: [], category: "CMS" },
    webflow: { domain: "webflow.com", aliases: ["web flow"], category: "CMS" },
    drupal: { domain: "drupal.org", aliases: [], category: "CMS" },
    directus: { domain: "directus.io", aliases: [], category: "CMS" },

    // ── ERP & Business ──
    sap: { domain: "sap.com", aliases: [], category: "ERP" },
    oracle: { domain: "oracle.com", aliases: [], category: "ERP" },
    netsuite: { domain: "netsuite.com", aliases: ["net suite"], category: "ERP" },
    quickbooks: { domain: "quickbooks.intuit.com", aliases: ["quick books", "intuit"], category: "ERP" },
    xero: { domain: "xero.com", aliases: [], category: "ERP" },
    freshbooks: { domain: "freshbooks.com", aliases: ["fresh books"], category: "ERP" },

    // ── Misc Popular ──
    spotify: { domain: "spotify.com", aliases: [], category: "Entertainment" },
    netflix: { domain: "netflix.com", aliases: [], category: "Entertainment" },
    apple: { domain: "apple.com", aliases: [], category: "Tech" },
    microsoft: { domain: "microsoft.com", aliases: ["ms"], category: "Tech" },
    ibm: { domain: "ibm.com", aliases: [], category: "Tech" },
    intel: { domain: "intel.com", aliases: [], category: "Tech" },
    nvidia: { domain: "nvidia.com", aliases: [], category: "Tech" },
    tesla: { domain: "tesla.com", aliases: [], category: "Tech" },
    uber: { domain: "uber.com", aliases: [], category: "Tech" },
    airbnb: { domain: "airbnb.com", aliases: [], category: "Tech" },
    dropbox: { domain: "dropbox.com", aliases: [], category: "Tech" },
    box: { domain: "box.com", aliases: [], category: "Tech" },
    twitch: { domain: "twitch.tv", aliases: [], category: "Entertainment" },
    epic: { domain: "epicgames.com", aliases: ["epic games"], category: "Entertainment" },
    unity: { domain: "unity.com", aliases: ["unity3d"], category: "DevTools" },
    unreal: { domain: "unrealengine.com", aliases: ["unreal engine", "ue"], category: "DevTools" },
    godot: { domain: "godotengine.org", aliases: ["godot engine"], category: "DevTools" },
};

// ─── Resolution Engine ──────────────────────────────────────────────────────

export interface ResolvedDomain {
    domain: string;
    company: string;
    category: string;
    confidence: "exact" | "alias" | "fuzzy" | "live-search" | "inferred";
    matchedName: string;
}

/**
 * Fetch search results securely from DuckDuckGo HTML version and extract the first valid external domain.
 */
async function searchWebForDomain(companyName: string): Promise<string | null> {
    const query = encodeURIComponent(`${companyName} official website`);
    const url = `https://html.duckduckgo.com/html/?q=${query}`;

    try {
        const response = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Cookie": "ah=wt", // disable ads
            },
            signal: AbortSignal.timeout(5000), // 5s timeout
        });

        if (!response.ok) return null;

        const html = await response.text();
        const $ = cheerio.load(html);

        let foundDomain: string | null = null;
        $(".result__url").each((_, el) => {
            const resultUrlText = $(el).text().trim();

            // Clean up the display URL text
            let cleanUrl = resultUrlText.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split('/')[0];

            // Exclude wikipedia, app stores, social media, review sites
            const exclusions = ["wikipedia.org", "linkedin.com", "facebook.com", "twitter.com", "instagram.com", "youtube.com", "apps.apple.com", "play.google.com", "g2.com", "trustpilot.com", "capterra.com", "crunchbase.com", "bloomberg.com", "forbes.com", "github.com", "duckduckgo.com"];

            if (cleanUrl && !exclusions.some(ex => cleanUrl.includes(ex))) {
                foundDomain = cleanUrl;
                return false; // break the each loop
            }
        });

        return foundDomain;
    } catch (err) {
        console.error(`Dynamic search failed for '${companyName}':`, err);
        return null;
    }
}

/**
 * Normalize an input string for matching: lowercase, trim, remove special chars.
 */
function normalize(input: string): string {
    return input
        .toLowerCase()
        .trim()
        .replace(/[._\-]/g, "")
        .replace(/\s+/g, " ");
}

/**
 * Resolve a company name or alias to its canonical domain.
 *
 * Resolution order:
 * 1. Exact match against curated database keys
 * 2. Exact match against aliases
 * 3. Fuzzy match (Levenshtein distance ≤ 2) against keys and aliases
 * 4. LIVE SEARCH: DuckDuckGo HTML search for official website
 * 5. Smart domain inference: try {name}.com
 */
export async function resolveDomain(input: string): Promise<ResolvedDomain> {
    const normalized = normalize(input);

    // ── 1. Exact key match ──
    if (COMPANY_DATABASE[normalized]) {
        const entry = COMPANY_DATABASE[normalized];
        return {
            domain: entry.domain,
            company: normalized,
            category: entry.category,
            confidence: "exact",
            matchedName: normalized,
        };
    }

    // ── 2. Alias match ──
    for (const [key, entry] of Object.entries(COMPANY_DATABASE)) {
        for (const alias of entry.aliases) {
            if (normalize(alias) === normalized) {
                return {
                    domain: entry.domain,
                    company: key,
                    category: entry.category,
                    confidence: "alias",
                    matchedName: alias,
                };
            }
        }
    }

    // ── 3. Fuzzy match (Levenshtein) ──
    let bestMatch: { key: string; entry: CompanyEntry; dist: number; via: string } | null = null;

    for (const [key, entry] of Object.entries(COMPANY_DATABASE)) {
        // Match against key
        const keyDist = distance(normalized, key);
        if (keyDist <= 2 && (!bestMatch || keyDist < bestMatch.dist)) {
            bestMatch = { key, entry, dist: keyDist, via: key };
        }

        // Match against aliases
        for (const alias of entry.aliases) {
            const aliasDist = distance(normalized, normalize(alias));
            if (aliasDist <= 2 && (!bestMatch || aliasDist < bestMatch.dist)) {
                bestMatch = { key, entry, dist: aliasDist, via: alias };
            }
        }
    }

    if (bestMatch) {
        return {
            domain: bestMatch.entry.domain,
            company: bestMatch.key,
            category: bestMatch.entry.category,
            confidence: "fuzzy",
            matchedName: bestMatch.via,
        };
    }

    // ── 4. Live Search (DuckDuckGo HTML) ──
    const liveDomain = await searchWebForDomain(input);
    if (liveDomain) {
        return {
            domain: liveDomain,
            company: input,
            category: "Unknown (Live Search)",
            confidence: "live-search",
            matchedName: input,
        };
    }

    // ── 5. Smart domain inference ──
    const sanitized = normalized.replace(/\s/g, "");
    const inferredDomain = `${sanitized}.com`;

    return {
        domain: inferredDomain,
        company: sanitized,
        category: "Unknown",
        confidence: "inferred",
        matchedName: input,
    };
}

/**
 * Search the company database by query. Returns all matching entries.
 * Matches against keys, aliases, and categories using substring search.
 */
export function searchCompanies(
    query: string,
    options: { category?: string; limit?: number } = {}
): Array<{ name: string } & CompanyEntry> {
    const normalized = normalize(query);
    const { category, limit = 25 } = options;

    const results: Array<{ name: string; score: number } & CompanyEntry> = [];

    for (const [key, entry] of Object.entries(COMPANY_DATABASE)) {
        // Category filter
        if (category && entry.category.toLowerCase() !== category.toLowerCase()) continue;

        let score = Infinity;

        // Exact substring in key
        if (key.includes(normalized)) {
            score = Math.min(score, key === normalized ? 0 : 1);
        }

        // Substring in aliases
        for (const alias of entry.aliases) {
            if (normalize(alias).includes(normalized)) {
                score = Math.min(score, 2);
            }
        }

        // Substring in category
        if (entry.category.toLowerCase().includes(normalized)) {
            score = Math.min(score, 3);
        }

        // Fuzzy match on key
        const dist = distance(normalized, key);
        if (dist <= 3) {
            score = Math.min(score, 4 + dist);
        }

        if (score < Infinity) {
            results.push({ name: key, score, ...entry });
        }
    }

    // Sort by relevance (lower score = better match)
    results.sort((a, b) => a.score - b.score);

    return results.slice(0, limit).map(({ score: _score, ...rest }) => rest);
}

/**
 * Get all available categories in the database.
 */
export function getCategories(): string[] {
    const categories = new Set<string>();
    for (const entry of Object.values(COMPANY_DATABASE)) {
        categories.add(entry.category);
    }
    return Array.from(categories).sort();
}

/**
 * Get the total count of companies in the database.
 */
export function getCompanyCount(): number {
    return Object.keys(COMPANY_DATABASE).length;
}
