/**
 * MCP Logo Download Server — Entry Point
 *
 * Registers three MCP tools for downloading and searching company logos:
 * - download_logo: Download a single company's logo
 * - search_companies: Search the curated company database
 * - download_bulk_logos: Download logos for multiple companies at once
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
    resolveDomain,
    searchCompanies,
    getCategories,
    getCompanyCount,
} from "./services/domain-resolver.js";
import { fetchLogo, summarizeFetchResult } from "./services/logo-fetcher.js";
import { formatFileSize } from "./services/image-validator.js";

// ─── Assets Directory ────────────────────────────────────────────────────────

/**
 * Determine the assets directory. Defaults to ./assets relative to the
 * working directory, but can be overridden via MCP_LOGO_ASSETS_DIR env var.
 */
function getAssetsDir(): string {
    return resolve(process.env.MCP_LOGO_ASSETS_DIR || join(process.cwd(), "assets"));
}

async function ensureAssetsDir(): Promise<string> {
    const dir = getAssetsDir();
    await mkdir(dir, { recursive: true });
    return dir;
}

// ─── Filename Sanitization ──────────────────────────────────────────────────

function sanitizeFilename(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

// ─── MCP Server Setup ───────────────────────────────────────────────────────

const server = new McpServer({
    name: "mcp-logo-downloader",
    version: "1.0.0",
});

// ── Tool 1: download_logo ────────────────────────────────────────────────────

server.tool(
    "download_logo",
    "Download the logo of a company or integration (e.g., Shopify, HubSpot, Stripe). " +
    "Saves the logo as an image file to the assets directory. " +
    "Supports 200+ pre-mapped companies with fuzzy matching for typo tolerance.",
    {
        company: z.string().describe(
            "The name of the company or integration to download the logo for. " +
            "Examples: 'shopify', 'hubspot', 'stripe', 'github', 'slack'"
        ),
        size: z
            .enum(["small", "medium", "large"])
            .optional()
            .default("large")
            .describe("Desired logo size: 'small' (64px), 'medium' (128px), 'large' (256px). Defaults to 'large'."),
        format: z
            .enum(["png", "jpg", "original"])
            .optional()
            .default("original")
            .describe("Desired output format. 'original' keeps the source format. Defaults to 'original'."),
    },
    async ({ company, size, format }) => {
        try {
            // Resolve company name to domain
            const resolved = await resolveDomain(company);
            const assetsDir = await ensureAssetsDir();

            // Fetch the logo
            const result = await fetchLogo(resolved.domain, resolved.company, size);

            if (!result.success || !result.logo) {
                return {
                    content: [
                        {
                            type: "text" as const,
                            text: [
                                `❌ Could not download logo for "${company}"`,
                                `   Resolved domain: ${resolved.domain} (confidence: ${resolved.confidence})`,
                                "",
                                summarizeFetchResult(result),
                                "",
                                "💡 Tip: Try providing the exact domain name, e.g., 'shopify.com'",
                            ].join("\n"),
                        },
                    ],
                };
            }

            // Determine file extension
            const ext =
                format !== "original"
                    ? format
                    : result.logo.imageInfo.extension;

            // Save the logo
            const filename = `${sanitizeFilename(resolved.company)}.${ext}`;
            const filepath = join(assetsDir, filename);
            await writeFile(filepath, result.logo.buffer);

            return {
                content: [
                    {
                        type: "text" as const,
                        text: [
                            `✅ Logo downloaded successfully!`,
                            "",
                            `📦 Company: ${resolved.company}`,
                            `🌐 Domain: ${resolved.domain}`,
                            `🎯 Match confidence: ${resolved.confidence}${resolved.confidence === "fuzzy" ? ` (matched: "${resolved.matchedName}")` : ""}`,
                            `📂 Category: ${resolved.category}`,
                            "",
                            `💾 Saved to: ${filepath}`,
                            `🖼️  Format: ${result.logo.imageInfo.format}`,
                            `📏 Size: ${formatFileSize(result.logo.imageInfo.sizeBytes)}`,
                            `🔗 Source: ${result.logo.source}`,
                            "",
                            `📋 Fetch attempts: ${result.attempts.length}`,
                            ...result.attempts.map(
                                (a) => `   ${a.success ? "✅" : "⏭️ "} ${a.source} (${a.durationMs}ms)${a.error ? ` — ${a.error}` : ""}`
                            ),
                        ].join("\n"),
                    },
                ],
            };
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            return {
                content: [
                    {
                        type: "text" as const,
                        text: `❌ Error downloading logo for "${company}": ${errorMsg}`,
                    },
                ],
                isError: true,
            };
        }
    }
);

// ── Tool 2: search_companies ─────────────────────────────────────────────────

server.tool(
    "search_companies",
    "Search the curated database of 200+ companies and integrations. " +
    "Find companies by name, category, or alias. " +
    "Useful for discovering available logos before downloading.",
    {
        query: z.string().describe(
            "Search query — matches against company names, aliases, and categories. " +
            "Examples: 'shop', 'payment', 'CRM', 'cloud'"
        ),
        category: z
            .string()
            .optional()
            .describe(
                "Optional category filter. Available categories include: " +
                "E-Commerce, CRM, Marketing, Cloud, DevTools, Payments, Communication, " +
                "Collaboration, AI, Analytics, Social, Auth, Security, Design, Framework, " +
                "Language, Storage, CDN, CMS, ERP, Entertainment, Tech"
            ),
        limit: z
            .number()
            .optional()
            .default(25)
            .describe("Maximum number of results to return. Defaults to 25."),
    },
    async ({ query, category, limit }) => {
        const results = searchCompanies(query, { category, limit });
        const categories = getCategories();
        const totalCompanies = getCompanyCount();

        if (results.length === 0) {
            return {
                content: [
                    {
                        type: "text" as const,
                        text: [
                            `🔍 No companies found for "${query}"${category ? ` in category "${category}"` : ""}`,
                            "",
                            `📊 Database: ${totalCompanies} companies across ${categories.length} categories`,
                            `📂 Categories: ${categories.join(", ")}`,
                            "",
                            `💡 Tips:`,
                            `   • Try a shorter search term`,
                            `   • Browse by category: search for "CRM", "Payments", "Cloud", etc.`,
                            `   • The fuzzy matcher will still work when downloading, even for companies not in the database`,
                        ].join("\n"),
                    },
                ],
            };
        }

        const rows = results.map(
            (r) =>
                `  • ${r.name.padEnd(20)} │ ${r.domain.padEnd(30)} │ ${r.category}${r.aliases.length > 0 ? ` │ aliases: ${r.aliases.join(", ")}` : ""}`
        );

        return {
            content: [
                {
                    type: "text" as const,
                    text: [
                        `🔍 Found ${results.length} companies matching "${query}"${category ? ` in "${category}"` : ""}`,
                        "",
                        ...rows,
                        "",
                        `📊 Database: ${totalCompanies} companies | ${categories.length} categories`,
                        `💡 Use download_logo to download any of these logos`,
                    ].join("\n"),
                },
            ],
        };
    }
);

// ── Tool 3: download_bulk_logos ──────────────────────────────────────────────

server.tool(
    "download_bulk_logos",
    "Download logos for multiple companies at once. " +
    "Processes all companies in parallel for speed. " +
    "Returns a summary of successes and failures.",
    {
        companies: z
            .array(z.string())
            .min(1)
            .max(20)
            .describe(
                "Array of company names to download logos for. Max 20 at a time. " +
                "Example: ['shopify', 'hubspot', 'stripe', 'github']"
            ),
        size: z
            .enum(["small", "medium", "large"])
            .optional()
            .default("large")
            .describe("Desired logo size for all downloads. Defaults to 'large'."),
    },
    async ({ companies, size }) => {
        const assetsDir = await ensureAssetsDir();
        const results: Array<{
            company: string;
            domain: string;
            success: boolean;
            filepath?: string;
            error?: string;
            source?: string;
            confidence: string;
        }> = [];

        // Process in parallel with concurrency limit of 5
        const concurrencyLimit = 5;
        const chunks: string[][] = [];
        for (let i = 0; i < companies.length; i += concurrencyLimit) {
            chunks.push(companies.slice(i, i + concurrencyLimit));
        }

        for (const chunk of chunks) {
            const chunkResults = await Promise.allSettled(
                chunk.map(async (company) => {
                    const resolved = await resolveDomain(company);
                    const result = await fetchLogo(resolved.domain, resolved.company, size);

                    if (result.success && result.logo) {
                        const ext = result.logo.imageInfo.extension;
                        const filename = `${sanitizeFilename(resolved.company)}.${ext}`;
                        const filepath = join(assetsDir, filename);
                        await writeFile(filepath, result.logo.buffer);

                        return {
                            company: resolved.company,
                            domain: resolved.domain,
                            success: true,
                            filepath,
                            source: result.logo.source,
                            confidence: resolved.confidence,
                        };
                    } else {
                        return {
                            company: resolved.company,
                            domain: resolved.domain,
                            success: false,
                            error: result.error || "Unknown error",
                            confidence: resolved.confidence,
                        };
                    }
                })
            );

            for (const result of chunkResults) {
                if (result.status === "fulfilled") {
                    results.push(result.value);
                } else {
                    results.push({
                        company: "unknown",
                        domain: "unknown",
                        success: false,
                        error: result.reason?.message || "Unknown error",
                        confidence: "unknown",
                    });
                }
            }
        }

        const successes = results.filter((r) => r.success);
        const failures = results.filter((r) => !r.success);

        const lines: string[] = [
            `📦 Bulk Logo Download Complete`,
            `   ✅ ${successes.length}/${results.length} succeeded`,
            "",
        ];

        if (successes.length > 0) {
            lines.push("✅ Successfully downloaded:");
            for (const s of successes) {
                lines.push(`   • ${s.company} (${s.domain}) → ${s.filepath} [${s.source}]`);
            }
        }

        if (failures.length > 0) {
            lines.push("");
            lines.push("❌ Failed:");
            for (const f of failures) {
                lines.push(`   • ${f.company} (${f.domain}) — ${f.error}`);
            }
        }

        lines.push("");
        lines.push(`📂 Assets saved to: ${assetsDir}`);

        return {
            content: [
                {
                    type: "text" as const,
                    text: lines.join("\n"),
                },
            ],
        };
    }
);

// ─── Server Startup ─────────────────────────────────────────────────────────

async function main() {
    // Ensure assets directory exists on startup
    const assetsDir = await ensureAssetsDir();

    // Log startup info to stderr (so it doesn't interfere with MCP stdio protocol)
    console.error(`🚀 MCP Logo Downloader v1.0.0`);
    console.error(`📂 Assets directory: ${assetsDir}`);
    console.error(`📊 Database: ${getCompanyCount()} companies | ${getCategories().length} categories`);
    console.error(`🔧 Tools: download_logo, search_companies, download_bulk_logos`);
    console.error(`⏳ Waiting for MCP client connection via stdio...`);

    // Start the MCP server with stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
