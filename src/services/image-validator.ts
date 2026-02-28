/**
 * Image Validator — Ensures downloaded content is a valid logo image
 *
 * Validates images by checking magic bytes (file signatures), minimum size,
 * and rejects HTML error pages that some servers return with 200 status codes.
 */

// ─── Magic Byte Signatures ──────────────────────────────────────────────────

interface ImageSignature {
    bytes: number[];
    offset: number;
    format: string;
    extension: string;
    mimeType: string;
}

const IMAGE_SIGNATURES: ImageSignature[] = [
    // PNG: 89 50 4E 47
    { bytes: [0x89, 0x50, 0x4e, 0x47], offset: 0, format: "PNG", extension: "png", mimeType: "image/png" },
    // JPEG: FF D8 FF
    { bytes: [0xff, 0xd8, 0xff], offset: 0, format: "JPEG", extension: "jpg", mimeType: "image/jpeg" },
    // GIF87a
    { bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], offset: 0, format: "GIF", extension: "gif", mimeType: "image/gif" },
    // GIF89a
    { bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], offset: 0, format: "GIF", extension: "gif", mimeType: "image/gif" },
    // WEBP: RIFF....WEBP
    { bytes: [0x52, 0x49, 0x46, 0x46], offset: 0, format: "WEBP", extension: "webp", mimeType: "image/webp" },
    // ICO: 00 00 01 00
    { bytes: [0x00, 0x00, 0x01, 0x00], offset: 0, format: "ICO", extension: "ico", mimeType: "image/x-icon" },
    // BMP: 42 4D
    { bytes: [0x42, 0x4d], offset: 0, format: "BMP", extension: "bmp", mimeType: "image/bmp" },
    // TIFF little-endian: 49 49 2A 00
    { bytes: [0x49, 0x49, 0x2a, 0x00], offset: 0, format: "TIFF", extension: "tiff", mimeType: "image/tiff" },
    // TIFF big-endian: 4D 4D 00 2A
    { bytes: [0x4d, 0x4d, 0x00, 0x2a], offset: 0, format: "TIFF", extension: "tiff", mimeType: "image/tiff" },
    // AVIF: ....ftypavif
    { bytes: [0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66], offset: 4, format: "AVIF", extension: "avif", mimeType: "image/avif" },
];

// ─── Validation Types ────────────────────────────────────────────────────────

export interface ImageInfo {
    format: string;
    extension: string;
    mimeType: string;
    sizeBytes: number;
    isValid: boolean;
    isSvg: boolean;
}

export interface ValidationResult {
    valid: boolean;
    info?: ImageInfo;
    reason?: string;
}

// ─── Validator Functions ─────────────────────────────────────────────────────

/**
 * Detect image format by examining magic bytes in the buffer header.
 */
function detectFormat(buffer: Buffer): ImageSignature | null {
    for (const sig of IMAGE_SIGNATURES) {
        if (buffer.length < sig.offset + sig.bytes.length) continue;

        let matches = true;
        for (let i = 0; i < sig.bytes.length; i++) {
            if (buffer[sig.offset + i] !== sig.bytes[i]) {
                matches = false;
                break;
            }
        }
        if (matches) return sig;
    }
    return null;
}

/**
 * Check if the buffer content is an SVG image.
 * SVGs are XML-based, so we check for SVG-specific patterns.
 */
function isSvgContent(buffer: Buffer): boolean {
    const text = buffer.subarray(0, Math.min(buffer.length, 1024)).toString("utf-8").trim();
    return (
        text.startsWith("<?xml") && text.includes("<svg") ||
        text.startsWith("<svg") ||
        text.includes("xmlns=\"http://www.w3.org/2000/svg\"")
    );
}

/**
 * Check if the buffer content is likely an HTML error page rather than an image.
 */
function isHtmlContent(buffer: Buffer): boolean {
    const text = buffer.subarray(0, Math.min(buffer.length, 512)).toString("utf-8").trim().toLowerCase();
    return (
        text.startsWith("<!doctype html") ||
        text.startsWith("<html") ||
        text.startsWith("<!doctype") ||
        (text.includes("<head>") && text.includes("<body"))
    );
}

/**
 * Validate a downloaded buffer to ensure it's a legitimate image.
 *
 * Checks:
 * 1. Buffer is not empty
 * 2. Buffer is not an HTML error page
 * 3. Buffer matches a known image format (via magic bytes or SVG detection)
 * 4. Buffer meets minimum size threshold (100 bytes — avoids placeholders)
 */
export function validateImage(buffer: Buffer): ValidationResult {
    // Empty check
    if (!buffer || buffer.length === 0) {
        return { valid: false, reason: "Empty buffer — no data received" };
    }

    // Minimum size (reject tiny placeholders / tracking pixels)
    if (buffer.length < 100) {
        return { valid: false, reason: `Buffer too small (${buffer.length} bytes) — likely a placeholder` };
    }

    // HTML error page check
    if (isHtmlContent(buffer)) {
        return { valid: false, reason: "Content is HTML, not an image — likely an error page" };
    }

    // SVG check
    if (isSvgContent(buffer)) {
        return {
            valid: true,
            info: {
                format: "SVG",
                extension: "svg",
                mimeType: "image/svg+xml",
                sizeBytes: buffer.length,
                isValid: true,
                isSvg: true,
            },
        };
    }

    // Magic byte detection
    const format = detectFormat(buffer);
    if (format) {
        return {
            valid: true,
            info: {
                format: format.format,
                extension: format.extension,
                mimeType: format.mimeType,
                sizeBytes: buffer.length,
                isValid: true,
                isSvg: false,
            },
        };
    }

    // If we can't identify it, reject
    return { valid: false, reason: "Unknown format — could not identify image type from file header" };
}

/**
 * Get a human-readable file size string.
 */
export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
