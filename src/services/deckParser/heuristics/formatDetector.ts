import type { DetectedFormat } from "../types";
import {
  isFrontKeyword,
  isBackKeyword,
  CARD_KEYWORDS_PATTERN,
  FRONT_KEYWORDS_PATTERN,
  HEADING_FRONT_REGEX,
  HEADING_BACK_REGEX,
  BULLET_FRONT_REGEX,
  BULLET_BACK_REGEX,
  BOLD_FRONT_REGEX,
  BOLD_BACK_REGEX,
  BOLD_CARD_REGEX,
  PLAIN_FRONT_REGEX,
  PLAIN_BACK_REGEX,
} from "../keywords";

export type DetectedPatternId =
  | "json"
  | "markdown-sections"
  | "bullet-list"
  | "markdown-headings"
  | "bold-italic"
  | "generic-qa"
  | "unknown";

export interface FormatHeuristicResult {
  patternId: DetectedPatternId;
  format: DetectedFormat;
  label: string;
  confidence: number;
  hasCustomFields: boolean;
  detectedFields: string[];
}

/**
 * Extracts a lightweight representative sample (Card 1) from the pasted text
 * to perform fast structural classification without processing the entire document.
 */
export function sampleFirstChunk(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";

  // 1. If text looks like JSON, capture up to the first object or array closure
  if (trimmed.startsWith("[") || trimmed.startsWith("{") || trimmed.startsWith("```")) {
    const firstObjEnd = trimmed.indexOf("},");
    if (firstObjEnd !== -1) {
      return trimmed.substring(0, firstObjEnd + 2);
    }
    return trimmed.substring(0, 1500);
  }

  // 2. Horizontal rule card separators (--- or ***)
  const hrMatch = trimmed.search(/\n\s*[-*_]{3,}\s*\n/);
  if (hrMatch !== -1 && hrMatch > 20) {
    return trimmed.substring(0, hrMatch);
  }

  // 3. Next top-level heading boundary (e.g. # Card 2 or # Karte 2)
  const nextCardHeadingRegex = new RegExp(`\\n\\s*#{1,2}\\s+(?:${CARD_KEYWORDS_PATTERN}|\\d+\\b)`, "i");
  const nextCardHeading = trimmed.search(nextCardHeadingRegex);
  if (nextCardHeading !== -1 && nextCardHeading > 20) {
    return trimmed.substring(0, nextCardHeading);
  }

  // 4. Default: take up to first 2000 characters
  return trimmed.substring(0, 2000);
}

export class FormatDetector {
  /**
   * Analyzes the first card or chunk of a paste and classifies its format signature.
   */
  public static detect(rawText: string): FormatHeuristicResult {
    const text = (rawText || "").normalize("NFC").trim();
    if (!text) {
      return {
        patternId: "unknown",
        format: "empty",
        label: "Empty Input",
        confidence: 0,
        hasCustomFields: false,
        detectedFields: [],
      };
    }

    const sample = sampleFirstChunk(text).normalize("NFC");

    // 1. JSON Detection
    if (
      (sample.startsWith("[") && sample.includes("]")) ||
      (sample.startsWith("{") && sample.includes("}")) ||
      /```(?:json)?\s*[[{]/i.test(sample)
    ) {
      try {
        let cleanSample = sample;
        const codeBlock = sample.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (codeBlock && codeBlock[1]) cleanSample = codeBlock[1].trim();

        const parsed = JSON.parse(
          cleanSample.endsWith("]") || cleanSample.endsWith("}")
            ? cleanSample
            : cleanSample + (cleanSample.startsWith("[") ? "]" : "}")
        );

        const firstCard = Array.isArray(parsed) ? parsed[0] : parsed?.cards?.[0] ?? parsed;
        if (firstCard && typeof firstCard === "object") {
          const keys = Object.keys(firstCard);
          const customKeys = keys.filter(
            (k) =>
              !isFrontKeyword(k) &&
              !isBackKeyword(k) &&
              !["id", "tags", "guid", "mid", "mod", "usn", "cards", "deckId", "deckName"].includes(k)
          );

          return {
            patternId: "json",
            format: "json",
            label: "JSON Cards Array",
            confidence: 0.98,
            hasCustomFields: customKeys.length > 0,
            detectedFields: keys,
          };
        }
      } catch {
        // Fall through if JSON parsing fails
      }
    }

    // 2. Hierarchical Markdown Headings (# Card 1 / ## Front / ## Back / ## Notes)
    const hasHeadingFront = HEADING_FRONT_REGEX.test(sample);
    const hasHeadingBack = HEADING_BACK_REGEX.test(sample);

    if (hasHeadingFront && hasHeadingBack) {
      // Find all heading titles in the sample
      const allHeadings = Array.from(sample.matchAll(/^#{1,4}\s+([^\n]+)/gim)).map((m) =>
        m[1].normalize("NFC").replace(/[:*#_]/g, "").trim()
      );

      const cardPrefixRegex = new RegExp(`^(?:${CARD_KEYWORDS_PATTERN})\\b`, "i");
      const customFields = allHeadings.filter(
        (h) => !isFrontKeyword(h) && !isBackKeyword(h) && !cardPrefixRegex.test(h)
      );

      const hasTopCardHeader = new RegExp(`^#\\s+(?:${CARD_KEYWORDS_PATTERN}|\\d+\\b)`, "im").test(sample);
      const isDepth3Headings = new RegExp(`^###\\s+[*_~]*(?:${FRONT_KEYWORDS_PATTERN})\\b`, "im").test(sample);

      if (customFields.length > 0 || hasTopCardHeader) {
        return {
          patternId: "markdown-sections",
          format: "markdown-sections",
          label: "Hierarchical Headings & Custom Fields (#/##)",
          confidence: 0.96,
          hasCustomFields: customFields.length > 0,
          detectedFields: allHeadings,
        };
      }

      if (isDepth3Headings) {
        return {
          patternId: "markdown-headings",
          format: "markdown-headings",
          label: "Markdown Headings (###)",
          confidence: 0.94,
          hasCustomFields: false,
          detectedFields: allHeadings,
        };
      }

      return {
        patternId: "markdown-sections",
        format: "markdown-sections",
        label: "Hierarchical Headings (#/##)",
        confidence: 0.93,
        hasCustomFields: false,
        detectedFields: allHeadings,
      };
    }

    // 3. Bullet List Key-Value (- Front: ... / - Back: ... / - Notes: ...)
    const hasBulletFront = BULLET_FRONT_REGEX.test(sample);
    const hasBulletBack = BULLET_BACK_REGEX.test(sample);

    if (hasBulletFront && hasBulletBack) {
      const allBulletKeys = Array.from(
        sample.matchAll(/^[ \t]*[-*+][ \t]+(?:\*\*|__)?([A-Za-z0-9_\u00C0-\u017F\s()/-]+?)(?:\*\*|__)?(?::\s*|\s*:\s*)/gim)
      ).map((m) => m[1].replace(/[:*#_]/g, "").trim());

      const customFields = allBulletKeys.filter((k) => {
        const norm = k.replace(/\s*\([^)]*\)$/, "").trim();
        return !isFrontKeyword(norm) && !isBackKeyword(norm);
      });

      return {
        patternId: "bullet-list",
        format: customFields.length > 0 ? "markdown-sections" : "bullet-list",
        label: customFields.length > 0 ? "Bullet List & Custom Fields (- Key:)" : "Bullet List Key-Value (- Key:)",
        confidence: 0.93,
        hasCustomFields: customFields.length > 0,
        detectedFields: allBulletKeys,
      };
    }

    // 4. Bold / Italic Delimiters (**Front:** / **Back:** / **Karte**)
    const hasBoldFront = BOLD_FRONT_REGEX.test(sample);
    const hasBoldBack = BOLD_BACK_REGEX.test(sample);
    const hasBoldCard = BOLD_CARD_REGEX.test(sample);

    if ((hasBoldFront && hasBoldBack) || hasBoldCard) {
      return {
        patternId: "bold-italic",
        format: "custom-delimiters",
        label: "Bold & Italic (**)",
        confidence: 0.91,
        hasCustomFields: false,
        detectedFields: ["Front", "Back"],
      };
    }

    // 5. Plain Q&A Key-Value (Q: / A: or Front: / Back:)
    const hasPlainFront = PLAIN_FRONT_REGEX.test(sample);
    const hasPlainBack = PLAIN_BACK_REGEX.test(sample);

    if (hasPlainFront && hasPlainBack) {
      const allPlainKeys = Array.from(
        sample.matchAll(/^[ \t]*([A-Za-z0-9_\u00C0-\u017F]+)[ \t]*:[ \t]*/gim)
      ).map((m) => m[1].trim());

      const customFields = allPlainKeys.filter(
        (k) => !isFrontKeyword(k) && !isBackKeyword(k) && k.length > 1
      );

      return {
        patternId: "generic-qa",
        format: customFields.length > 0 ? "markdown-sections" : "markdown-qa",
        label: "Generic Q&A (Q: / A:)",
        confidence: 0.9,
        hasCustomFields: customFields.length > 0,
        detectedFields: allPlainKeys,
      };
    }

    // 6. Unknown / Unstructured Fallback
    return {
      patternId: "unknown",
      format: "plain-text",
      label: "Unstructured Text",
      confidence: 0.1,
      hasCustomFields: false,
      detectedFields: [],
    };
  }
}
