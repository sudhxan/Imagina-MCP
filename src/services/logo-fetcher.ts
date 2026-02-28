/**
 * Logo Fetcher — Multi-source cascading logo downloader
 *
 * Attempts to download a company logo from multiple sources in order of quality.
 * Each source is tried in sequence; if one fails or returns an invalid image,
 * the next source is attempted. This guarantees near-100% success rate.
 *
 * Source Priority:
 * 1. Clearbit Logo API       — Highest quality, large logos (up to 1024px)
 * 2. Google Favicon Service   — Reliable, good quality (up to 256px)
 * 3. DuckDuckGo Instant API   — Structured data with logo URLs
 * 4. Direct Favicon Extraction — Fetch /favicon.ico from the domain directly
 */

import { validateImage, type ImageInfo, formatFileSize } from "./image-validator.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LogoResult {
    buffer: Buffer;
    imageInfo: ImageInfo;
    source: string;
    sourceUrl: string;
}

export interface FetchAttempt {
    source: string;
    url: string;
    success: boolean;
    error?: string;
    durationMs: number;
}

export interface LogoFetchResult {
    success: boolean;
    logo?: LogoResult;
    attempts: FetchAttempt[];
    error?: string;
}

type LogoSize = "small" | "medium" | "large";

const SIZE_MAP: Record<LogoSize, number> = {
    small: 64,
    medium: 128,
    large: 256,
};

// ─── HTTP Helper ─────────────────────────────────────────────────────────────

/**
 * Fetch a URL with timeout and return the buffer.
 * Handles redirects, sets a proper User-Agent, and enforces a timeout.
 */
async function fetchBuffer(
    url: string,
    timeoutMs: number = 10000
): Promise<Buffer> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                "User-Agent": "MCP-Logo-Downloader/1.0",
                Accept: "image/*,*/*;q=0.8",
            },
            redirect: "follow",
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    } finally {
        clearTimeout(timer);
    }
}

// ─── Logo Sources ────────────────────────────────────────────────────────────

/**
 * Source 1: Clearbit Logo API
 * The gold standard for company logos. Returns high-resolution PNGs.
 * Free, no API key required. Supports size parameter.
 */
async function fetchFromClearbit(
    domain: string,
    size: LogoSize
): Promise<LogoResult> {
    const sizeParam = SIZE_MAP[size] * 2; // Clearbit supports up to 1024
    const url = `https://logo.clearbit.com/${domain}?size=${sizeParam}&format=png`;

    const buffer = await fetchBuffer(url);
    const validation = validateImage(buffer);

    if (!validation.valid) {
        throw new Error(validation.reason || "Invalid image from Clearbit");
    }

    return {
        buffer,
        imageInfo: validation.info!,
        source: "Clearbit Logo API",
        sourceUrl: url,
    };
}

/**
 * Source 2: Google Favicon Service
 * Very reliable, returns clean favicon images.
 * Supports sizes up to 256px.
 */
async function fetchFromGoogle(
    domain: string,
    size: LogoSize
): Promise<LogoResult> {
    const sz = Math.min(SIZE_MAP[size] * 2, 256);
    const url = `https://www.google.com/s2/favicons?domain=${domain}&sz=${sz}`;

    const buffer = await fetchBuffer(url);
    const validation = validateImage(buffer);

    if (!validation.valid) {
        throw new Error(validation.reason || "Invalid image from Google");
    }

    // Reject the default "globe" placeholder Google returns for unknown domains
    // The default globe icon is typically very small (< 1KB)
    if (buffer.length < 500 && size !== "small") {
        throw new Error("Google returned a generic placeholder icon");
    }

    return {
        buffer,
        imageInfo: validation.info!,
        source: "Google Favicon Service",
        sourceUrl: url,
    };
}

/**
 * Source 3: DuckDuckGo Instant Answer API
 * Returns structured data about companies including logo URLs.
 * Free, no API key required.
 */
async function fetchFromDuckDuckGo(
    companyName: string,
    _size: LogoSize
): Promise<LogoResult> {
    const query = encodeURIComponent(`${companyName} company`);
    const apiUrl = `https://api.duckduckgo.com/?q=${query}&format=json&no_html=1`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    try {
        const response = await fetch(apiUrl, {
            signal: controller.signal,
            headers: { "User-Agent": "MCP-Logo-Downloader/1.0" },
        });

        if (!response.ok) throw new Error(`DDG API HTTP ${response.status}`);

        const data = (await response.json()) as Record<string, unknown>;
        const imageUrl = data.Image as string | undefined;

        if (!imageUrl) {
            throw new Error("No logo image found in DuckDuckGo response");
        }

        // The image URL from DDG might be relative
        const fullUrl = imageUrl.startsWith("http")
            ? imageUrl
            : `https://duckduckgo.com${imageUrl}`;

        const buffer = await fetchBuffer(fullUrl);
        const validation = validateImage(buffer);

        if (!validation.valid) {
            throw new Error(validation.reason || "Invalid image from DuckDuckGo");
        }

        return {
            buffer,
            imageInfo: validation.info!,
            source: "DuckDuckGo Instant Answer",
            sourceUrl: fullUrl,
        };
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Source 4: Direct Favicon Extraction
 * Fetches the /favicon.ico directly from the company's website.
 * Most basic fallback, but almost always returns something.
 */
async function fetchDirectFavicon(
    domain: string,
    _size: LogoSize
): Promise<LogoResult> {
    // Try common favicon paths in order of preference
    const paths = [
        "/apple-touch-icon.png",      // Usually highest quality
        "/apple-touch-icon-precomposed.png",
        "/favicon-32x32.png",
        "/favicon.ico",
    ];

    let lastError: Error | null = null;

    for (const path of paths) {
        const url = `https://${domain}${path}`;
        try {
            const buffer = await fetchBuffer(url, 8000);
            const validation = validateImage(buffer);

            if (validation.valid) {
                return {
                    buffer,
                    imageInfo: validation.info!,
                    source: "Direct Favicon",
                    sourceUrl: url,
                };
            }
            lastError = new Error(validation.reason || "Invalid image");
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
        }
    }

    throw lastError || new Error("No valid favicon found at any common path");
}

// ─── Main Fetch Pipeline ────────────────────────────────────────────────────

type LogoSourceFn = (domain: string, size: LogoSize) => Promise<LogoResult>;

interface SourceConfig {
    name: string;
    fn: LogoSourceFn;
    /**
     * If true, passes the company name instead of domain.
     * (DuckDuckGo needs the name for search, not a domain.)
     */
    usesCompanyName?: boolean;
}

const SOURCES: SourceConfig[] = [
    { name: "Clearbit", fn: fetchFromClearbit },
    { name: "Google Favicon", fn: fetchFromGoogle },
    { name: "DuckDuckGo", fn: fetchFromDuckDuckGo, usesCompanyName: true },
    { name: "Direct Favicon", fn: fetchDirectFavicon },
];

/**
 * Fetch a logo from multiple sources with cascading fallback.
 *
 * Tries each source in order of quality. Logs all attempts for transparency.
 *
 * @param domain    The company's domain (e.g., "shopify.com")
 * @param company   The company name (e.g., "shopify") — used for DDG search
 * @param size      Desired logo size: "small" | "medium" | "large"
 */
export async function fetchLogo(
    domain: string,
    company: string,
    size: LogoSize = "large"
): Promise<LogoFetchResult> {
    const attempts: FetchAttempt[] = [];

    for (const source of SOURCES) {
        const start = Date.now();
        const input = source.usesCompanyName ? company : domain;

        try {
            const logo = await source.fn(input, size);
            attempts.push({
                source: source.name,
                url: logo.sourceUrl,
                success: true,
                durationMs: Date.now() - start,
            });

            return { success: true, logo, attempts };
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            attempts.push({
                source: source.name,
                url: `[${source.name}] ${input}`,
                success: false,
                error: errorMsg,
                durationMs: Date.now() - start,
            });
        }
    }

    return {
        success: false,
        attempts,
        error: `Failed to download logo from all ${SOURCES.length} sources`,
    };
}

/**
 * Generate a summary of the fetch result for display.
 */
export function summarizeFetchResult(result: LogoFetchResult): string {
    const lines: string[] = [];

    if (result.success && result.logo) {
        lines.push(`✅ Logo downloaded successfully`);
        lines.push(`   Source: ${result.logo.source}`);
        lines.push(`   Format: ${result.logo.imageInfo.format}`);
        lines.push(`   Size: ${formatFileSize(result.logo.imageInfo.sizeBytes)}`);
    } else {
        lines.push(`❌ Failed to download logo`);
        lines.push(`   Error: ${result.error}`);
    }

    lines.push("");
    lines.push(`📋 Attempts (${result.attempts.length}):`);
    for (const attempt of result.attempts) {
        const icon = attempt.success ? "✅" : "❌";
        lines.push(`   ${icon} ${attempt.source} (${attempt.durationMs}ms)`);
        if (attempt.error) {
            lines.push(`      → ${attempt.error}`);
        }
    }

    return lines.join("\n");
}
