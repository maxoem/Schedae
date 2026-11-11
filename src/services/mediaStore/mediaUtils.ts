import type { FlashCard } from "@/converters/types";

export const LOCAL_MEDIA_PREFIX = "media/";

const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

export const SUPPORTED_IMAGE_ACCEPT = {
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
  "image/gif": [".gif"],
  "image/svg+xml": [".svg"],
} as const;

export function isSupportedImageFile(file: Pick<File, "type" | "name">): boolean {
  if (file.type && file.type.toLowerCase() in MIME_TO_EXT) {
    return true;
  }
  return /\.(png|jpe?g|webp|gif|svg)$/i.test(file.name || "");
}

export function inferImageMimeType(file: Pick<File, "type" | "name">): string {
  const normalized = (file.type || "").toLowerCase();
  if (normalized in MIME_TO_EXT) {
    return normalized === "image/jpg" ? "image/jpeg" : normalized;
  }
  const extMatch = (file.name || "").match(/\.([a-z0-9]+)$/i);
  const ext = extMatch?.[1]?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "svg") return "image/svg+xml";
  return "image/png";
}

export function extensionForMimeType(mimeType: string): string {
  return MIME_TO_EXT[mimeType.toLowerCase()] ?? "png";
}

function fallbackHashBytes(bytes: Uint8Array): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    h1 ^= b;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= b + (i & 0xff);
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return (
    (h1 >>> 0).toString(16).padStart(8, "0") +
    (h2 >>> 0).toString(16).padStart(8, "0")
  ).slice(0, 12);
}

/**
 * Computes a deterministic 12-character hex digest for a Blob so identical images
 * deduplicate across pastes and avoid colliding in Anki's global collection.media.
 */
export async function hashBlobShort(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  if (typeof globalThis.crypto?.subtle?.digest === "function") {
    try {
      const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
      const digestBytes = new Uint8Array(digest);
      return Array.from(digestBytes.slice(0, 6))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    } catch {
      // Fallback to deterministic JS hash when SubtleCrypto is unavailable
    }
  }

  return fallbackHashBytes(bytes);
}

export function createMediaFilename(hash: string, mimeType: string): string {
  const cleanHash = hash.replace(/[^a-z0-9]/gi, "").slice(0, 16) || "img";
  return `schedae-${cleanHash}.${extensionForMimeType(mimeType)}`;
}

export function toLocalMediaRef(filename: string): string {
  return `${LOCAL_MEDIA_PREFIX}${filename}`;
}

/**
 * Extracts a safe flat filename from a virtual local reference (`media/<filename>`).
 * Returns null for external URLs or path traversal attempts.
 */
export function parseLocalMediaFilename(src: string): string | null {
  if (!src || typeof src !== "string") return null;
  const trimmed = src.trim();
  if (!trimmed.startsWith(LOCAL_MEDIA_PREFIX)) return null;

  const rest = trimmed.slice(LOCAL_MEDIA_PREFIX.length).trim();
  if (!rest || rest.includes("/") || rest.includes("\\") || rest.includes("..")) {
    return null;
  }
  return rest;
}

/**
 * Strips fenced and inline code blocks before inspecting content for media references.
 */
function stripCodeBlocks(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`\n]+`/g, "");
}

/**
 * Extracts all distinct local media filenames (`media/<filename>`) referenced in Markdown
 * or HTML <img> tags inside a text string, ignoring fenced/inline code blocks.
 */
export function extractReferencedMediaFilenames(text: string): Set<string> {
  const found = new Set<string>();
  if (!text || typeof text !== "string") return found;

  const clean = stripCodeBlocks(text);

  // Markdown image syntax: ![alt](media/file.png) or ![alt](<media/file.png> "title")
  const mdImgRegex = /!\[[^\]]*\]\(\s*<?(media\/[^)\s>"']+)>?(?:\s+["'][^"']*["'])?\s*\)/gi;
  let match: RegExpExecArray | null;
  while ((match = mdImgRegex.exec(clean)) !== null) {
    const filename = parseLocalMediaFilename(match[1]);
    if (filename) found.add(filename);
  }

  // HTML <img src="media/file.png">
  const htmlImgRegex = /<img\b[^>]*\bsrc\s*=\s*(?:"(media\/[^"]+)"|'(media\/[^']+)')[^>]*>/gi;
  while ((match = htmlImgRegex.exec(clean)) !== null) {
    const ref = match[1] || match[2] || "";
    const filename = parseLocalMediaFilename(ref);
    if (filename) found.add(filename);
  }

  return found;
}

export function collectCardsMediaFilenames(cards: FlashCard[]): Set<string> {
  const found = new Set<string>();
  for (const card of cards) {
    if (card.front) {
      for (const f of extractReferencedMediaFilenames(card.front)) found.add(f);
    }
    if (card.back) {
      for (const f of extractReferencedMediaFilenames(card.back)) found.add(f);
    }
    if (card.customFields) {
      for (const val of Object.values(card.customFields)) {
        if (typeof val === "string" && val) {
          for (const f of extractReferencedMediaFilenames(val)) found.add(f);
        }
      }
    }
  }
  return found;
}

export function formatImageAltLabel(originalName?: string): string {
  if (!originalName) return "image";
  const withoutExt = originalName.replace(/\.[^.]+$/, "").trim();
  const safe = withoutExt.replace(/[[\]\r\n]/g, " ").trim();
  return safe || "image";
}

export function buildMarkdownImageSnippet(localRef: string, alt = "image"): string {
  const cleanAlt = alt.replace(/[[\]\r\n]/g, " ").trim() || "image";
  return `![${cleanAlt}](${localRef})`;
}

export function spliceTextAtSelection(
  current: string,
  snippet: string,
  selectionStart?: number,
  selectionEnd?: number,
): { value: string; cursorPos: number } {
  const hasExplicitSelection = typeof selectionStart === "number";
  const start = hasExplicitSelection
    ? Math.max(0, Math.min(selectionStart, current.length))
    : current.length;
  const end = typeof selectionEnd === "number"
    ? Math.max(start, Math.min(selectionEnd, current.length))
    : start;

  const before = current.slice(0, start);
  const after = current.slice(end);

  const needsLeadingNewline = !hasExplicitSelection && before.length > 0 && !before.endsWith("\n");
  const prefix = needsLeadingNewline ? "\n" : "";
  const value = `${before}${prefix}${snippet}${after}`;
  const cursorPos = before.length + prefix.length + snippet.length;

  return { value, cursorPos };
}

/**
 * Removes Markdown and HTML references to a given local media filename from source text.
 */
export function stripMediaReferencesFromText(text: string, filename: string): string {
  if (!text || !filename) return text;
  const escapedRef = `${LOCAL_MEDIA_PREFIX}${filename}`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const mdRx = new RegExp(`!\\[[^\\]]*\\]\\(\\s*<?${escapedRef}>?(?:\\s+["'][^"']*["'])?\\s*\\)`, "g");
  const htmlRx = new RegExp(`<img\\b[^>]*\\bsrc\\s*=\\s*(?:"${escapedRef}"|'${escapedRef}')[^>]*>`, "gi");
  return text
    .replace(mdRx, "")
    .replace(htmlRx, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
