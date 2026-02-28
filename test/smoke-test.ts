/**
 * Smoke Test — Validates core functionality end-to-end
 *
 * Tests domain resolution, logo fetching, image validation,
 * and actual logo downloads for several well-known companies.
 *
 * Run: npm test (or npx tsx test/smoke-test.ts)
 */

import { resolveDomain, searchCompanies, getCategories, getCompanyCount } from "../src/services/domain-resolver.js";
import { fetchLogo, summarizeFetchResult } from "../src/services/logo-fetcher.js";
import { validateImage } from "../src/services/image-validator.js";
import { mkdir, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";

// ─── Test Utilities ──────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
    if (condition) {
        console.log(`  ✅ ${message}`);
        passed++;
    } else {
        console.log(`  ❌ ${message}`);
        failed++;
    }
}

function section(title: string): void {
    console.log(`\n${"═".repeat(60)}`);
    console.log(`  ${title}`);
    console.log(`${"═".repeat(60)}`);
}

// ─── Test: Domain Resolution ─────────────────────────────────────────────────

function testDomainResolution(): void {
    section("🔍 Domain Resolution");

    // Exact matches
    const shopify = resolveDomain("shopify");
    assert(shopify.domain === "shopify.com", `"shopify" → ${shopify.domain} (exact)`);
    assert(shopify.confidence === "exact", `  confidence: ${shopify.confidence}`);

    const hubspot = resolveDomain("hubspot");
    assert(hubspot.domain === "hubspot.com", `"hubspot" → ${hubspot.domain} (exact)`);

    const stripe = resolveDomain("stripe");
    assert(stripe.domain === "stripe.com", `"stripe" → ${stripe.domain} (exact)`);

    const github = resolveDomain("github");
    assert(github.domain === "github.com", `"github" → ${github.domain} (exact)`);

    // Alias matches
    const gh = resolveDomain("GH");
    assert(gh.domain === "github.com", `"GH" (alias) → ${gh.domain}`);
    assert(gh.confidence === "alias", `  confidence: ${gh.confidence}`);

    const chatgpt = resolveDomain("chatgpt");
    assert(chatgpt.domain === "openai.com", `"chatgpt" (alias) → ${chatgpt.domain}`);

    // Fuzzy matches (intentional typos)
    const shopifyTypo = resolveDomain("shoppify");
    assert(shopifyTypo.domain === "shopify.com", `"shoppify" (typo) → ${shopifyTypo.domain}`);
    assert(shopifyTypo.confidence === "fuzzy", `  confidence: ${shopifyTypo.confidence}`);

    const slackTypo = resolveDomain("slak");
    assert(slackTypo.domain === "slack.com", `"slak" (typo) → ${slackTypo.domain}`);

    // Inferred domain
    const unknown = resolveDomain("unknowncompany123");
    assert(unknown.confidence === "inferred", `"unknowncompany123" → inferred (${unknown.domain})`);
}

// ─── Test: Company Search ────────────────────────────────────────────────────

function testCompanySearch(): void {
    section("🔎 Company Search");

    const paymentResults = searchCompanies("payment");
    assert(paymentResults.length > 0, `Search "payment" → ${paymentResults.length} results`);

    const crmResults = searchCompanies("", { category: "CRM" });
    assert(crmResults.length > 0, `Category "CRM" → ${crmResults.length} results`);

    const shopResults = searchCompanies("shop");
    assert(shopResults.some((r) => r.name === "shopify"), `Search "shop" includes "shopify"`);

    const categories = getCategories();
    assert(categories.length > 10, `${categories.length} categories available`);

    const count = getCompanyCount();
    assert(count >= 200, `${count} companies in database`);

    console.log(`  📂 Categories: ${categories.join(", ")}`);
}

// ─── Test: Image Validation ─────────────────────────────────────────────────

function testImageValidation(): void {
    section("🖼️  Image Validation");

    // PNG magic bytes
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(200).fill(0)]);
    const pngResult = validateImage(pngBuffer);
    assert(pngResult.valid === true, `PNG magic bytes → valid (${pngResult.info?.format})`);

    // JPEG magic bytes
    const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(200).fill(0)]);
    const jpegResult = validateImage(jpegBuffer);
    assert(jpegResult.valid === true, `JPEG magic bytes → valid (${jpegResult.info?.format})`);

    // SVG content
    const svgBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle r="50"/></svg>');
    // This is small but we're testing SVG detection
    const svgText = '<svg xmlns="http://www.w3.org/2000/svg">' + "<circle r='50'/>".repeat(10) + "</svg>";
    const svgResult = validateImage(Buffer.from(svgText));
    assert(svgResult.valid === true, `SVG content → valid (${svgResult.info?.format})`);

    // HTML error page (should be rejected)
    const htmlBuffer = Buffer.from("<!DOCTYPE html><html><body>404 Not Found</body></html>" + " ".repeat(100));
    const htmlResult = validateImage(htmlBuffer);
    assert(htmlResult.valid === false, `HTML error page → rejected (${htmlResult.reason})`);

    // Empty buffer
    const emptyResult = validateImage(Buffer.alloc(0));
    assert(emptyResult.valid === false, `Empty buffer → rejected`);

    // Tiny buffer (placeholder)
    const tinyResult = validateImage(Buffer.alloc(10));
    assert(tinyResult.valid === false, `Tiny buffer (10 bytes) → rejected`);
}

// ─── Test: Logo Download (Live) ──────────────────────────────────────────────

async function testLogoDownload(): Promise<void> {
    section("⬇️  Logo Download (Live — requires internet)");

    const testDir = join(process.cwd(), "test", "_test_assets");
    await mkdir(testDir, { recursive: true });

    const testCompanies = ["github", "stripe", "shopify"];

    for (const company of testCompanies) {
        console.log(`\n  Downloading: ${company}...`);
        const resolved = resolveDomain(company);
        const result = await fetchLogo(resolved.domain, resolved.company, "large");

        assert(result.success === true, `${company}: download succeeded`);

        if (result.success && result.logo) {
            const ext = result.logo.imageInfo.extension;
            const filename = `${company}.${ext}`;
            const filepath = join(testDir, filename);
            await writeFile(filepath, result.logo.buffer);

            // Verify file exists and has content
            const fileStat = await stat(filepath);
            assert(fileStat.size > 0, `${company}: file saved (${fileStat.size} bytes)`);
            assert(result.logo.imageInfo.isValid, `${company}: image validated`);

            console.log(`    Source: ${result.logo.source}`);
            console.log(`    Format: ${result.logo.imageInfo.format} | ${result.logo.imageInfo.sizeBytes} bytes`);
        }

        // Show all attempts
        for (const attempt of result.attempts) {
            const icon = attempt.success ? "✅" : "⏭️";
            console.log(`    ${icon} ${attempt.source} (${attempt.durationMs}ms)${attempt.error ? ` — ${attempt.error}` : ""}`);
        }
    }
}

// ─── Run All Tests ───────────────────────────────────────────────────────────

async function main() {
    console.log("🧪 MCP Logo Downloader — Smoke Test Suite\n");

    // Unit tests (no network)
    testDomainResolution();
    testCompanySearch();
    testImageValidation();

    // Integration test (requires network)
    await testLogoDownload();

    // Summary
    section("📊 Results");
    console.log(`  ✅ Passed: ${passed}`);
    console.log(`  ❌ Failed: ${failed}`);
    console.log(`  📊 Total:  ${passed + failed}`);
    console.log();

    if (failed > 0) {
        console.error(`⚠️  ${failed} test(s) failed!`);
        process.exit(1);
    } else {
        console.log("🎉 All tests passed!");
    }
}

main().catch((err) => {
    console.error("Test runner error:", err);
    process.exit(1);
});
