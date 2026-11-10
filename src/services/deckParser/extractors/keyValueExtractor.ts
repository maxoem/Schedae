import type { FlashCard } from "@/converters/types";
import { dedentText } from "@/lib/utils";
import type {
  ExtractorOptions,
  ExtractorResult,
  ExtractorStrategy,
  DiagnosticIssue,
} from "../types";
import {
  isFrontKeyword,
  isBackKeyword,
  isMetadataKeyword,
  isCardHeader,
  BULLET_FRONT_REGEX,
  BULLET_BACK_REGEX,
  PLAIN_FRONT_REGEX,
  PLAIN_BACK_REGEX,
} from "../keywords";

export class KeyValueExtractor implements ExtractorStrategy {
  readonly id = "key-value";
  readonly label = "Bullet List / Key-Value";

  canExtract(text: string): boolean {
    if (!text || text.trim().length === 0) return false;
    const norm = text.normalize("NFC");
    const hasBullet = BULLET_FRONT_REGEX.test(norm) && BULLET_BACK_REGEX.test(norm);
    const hasPlain = PLAIN_FRONT_REGEX.test(norm) && PLAIN_BACK_REGEX.test(norm);
    return hasBullet || hasPlain;
  }

  extract(text: string, options: ExtractorOptions): ExtractorResult {
    const diagnostics: DiagnosticIssue[] = [];
    const lines = text.split(/\r?\n/);
    const cards: FlashCard[] = [];

    interface CurrentCardData {
      id?: string;
      title?: string;
      front: string;
      back: string;
      customFields: Record<string, string>;
      lastFieldKey: "front" | "back" | string | null;
    }

    let currentCard: CurrentCardData = {
      front: "",
      back: "",
      customFields: {},
      lastFieldKey: null,
    };

    const finalizeCard = () => {
      const front = dedentText(currentCard.front);
      const back = dedentText(currentCard.back);
      const hasCustom = Object.keys(currentCard.customFields).length > 0;

      // Flashcard invariant: A card is only valid if it contains question/front or answer/back content
      if (!front && !back) {
        currentCard = {
          front: "",
          back: "",
          customFields: {},
          lastFieldKey: null,
        };
        return;
      }

      const cardIdx = cards.length;
      if (!front) {
        diagnostics.push({
          id: `card-${cardIdx}-no-front`,
          level: "warning",
          message: `Card #${cardIdx + 1} has an empty Front field.`,
          cardIndex: cardIdx,
        });
      }

      if (!back) {
        diagnostics.push({
          id: `card-${cardIdx}-no-back`,
          level: "warning",
          message: `Card #${cardIdx + 1} has an empty Back field.`,
          cardIndex: cardIdx,
        });
      }

      // Clean up whitespace inside custom fields
      const cleanCustomFields: Record<string, string> = {};
      for (const [k, v] of Object.entries(currentCard.customFields)) {
        const cleaned = dedentText(v);
        if (cleaned) {
          cleanCustomFields[k] = cleaned;
        }
      }

      cards.push({
        id: `card-${cardIdx + 1}`,
        front,
        back,
        ...(Object.keys(cleanCustomFields).length > 0 ? { customFields: cleanCustomFields } : {}),
      });

      currentCard = {
        front: "",
        back: "",
        customFields: {},
        lastFieldKey: null,
      };
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Horizontal rules act as card delimiters
      if (/^[-*_]{3,}$/.test(trimmed)) {
        finalizeCard();
        continue;
      }

      // Heading-style card delimiters (e.g. "### **Karte 1.1: ...**" or "# Card 2")
      if (/^#{1,6}\s+/.test(trimmed)) {
        const headingText = trimmed.replace(/^#+\s+/, "").replace(/^[*_~`]+|[*_~`]+$/g, "").trim();
        if (isCardHeader(headingText)) {
          finalizeCard();
          currentCard.title = headingText;
          continue;
        } else if (currentCard.front || currentCard.back) {
          // A structural section heading (e.g. "#### Komplex 2") finalizes any in-progress card
          finalizeCard();
          continue;
        }
      }

      // Check if line is a top-level key-value pair (indentation 0 or 1 space)
      // Indented lines (>= 2 spaces or tab) are sub-bullets/content, not new fields!
      const isIndented = /^[ \t]{2,}|\t/.test(line);
      const topLevelMatch = !isIndented
        ? line.match(/^[ \t]*[-*+][ \t]+(.*?)(?::\s*|\s*:\s*)(.*)$/) ||
          line.match(/^([A-Za-z0-9_\u00C0-\u017F\s()/-]+?)(?::\s*|\s*:\s*)(.*)$/)
        : null;

      if (topLevelMatch) {
        let rawKey = topLevelMatch[1].trim();
        let value = topLevelMatch[2].trim();

        // Strip bold/italic wrappers from the key: **Key** -> Key
        rawKey = rawKey.replace(/^[*_~`]+|[*_~`]+$/g, "").trim();
        rawKey = rawKey.replace(/:$/, "").trim();
        value = value.replace(/^\*\*\s*/, "").trim();

        // Check if rawKey is a card boundary header, e.g. "Karte 1.1: ..."
        if (isCardHeader(rawKey)) {
          finalizeCard();
          currentCard.title = rawKey;
          continue;
        }

        const normKey = rawKey.replace(/\s*\([^)]*\)$/, "").trim();
        const isFront = isFrontKeyword(normKey);
        const isBack = isBackKeyword(normKey);
        const isKnownMetadata = isMetadataKeyword(normKey) || isMetadataKeyword(rawKey);

        if (isFront || isBack || isKnownMetadata || !currentCard.lastFieldKey) {
          // If this is another Front field and we already have a Front field populated,
          // it means Card N+1 has started!
          if (isFront && currentCard.front.trim().length > 0) {
            finalizeCard();
          }

          if (isFront) {
            currentCard.front = value;
            currentCard.lastFieldKey = "front";
          } else if (isBack) {
            currentCard.back = value;
            currentCard.lastFieldKey = "back";
          } else {
            // Known custom metadata field (e.g. "Quelle(n)", "Notes", etc.)
            currentCard.customFields[rawKey] = value;
            currentCard.lastFieldKey = rawKey;
          }
          continue;
        } else if (currentCard.lastFieldKey === "back") {
          // If we are currently collecting the Answer/Back body, arbitrary bullet points with colons
          // (e.g. "* **Definition:** ...", "* **Bedeutung:** ...") are part of the back content!
          currentCard.back += (currentCard.back ? "\n" : "") + line;
          continue;
        } else if (currentCard.lastFieldKey === "front") {
          currentCard.front += (currentCard.front ? "\n" : "") + line;
          continue;
        } else if (currentCard.lastFieldKey && currentCard.customFields[currentCard.lastFieldKey] !== undefined) {
          currentCard.customFields[currentCard.lastFieldKey] +=
            (currentCard.customFields[currentCard.lastFieldKey] ? "\n" : "") + line;
          continue;
        }
      }

      // Empty line handling
      if (!trimmed) {
        if (currentCard.lastFieldKey) {
          // If previous content ended without blank line, keep newline for paragraphs
          if (currentCard.lastFieldKey === "front" && currentCard.front && !currentCard.front.endsWith("\n\n")) {
            currentCard.front += "\n";
          } else if (currentCard.lastFieldKey === "back" && currentCard.back && !currentCard.back.endsWith("\n\n")) {
            currentCard.back += "\n";
          } else if (
            currentCard.lastFieldKey &&
            currentCard.customFields[currentCard.lastFieldKey] &&
            !currentCard.customFields[currentCard.lastFieldKey].endsWith("\n\n")
          ) {
            currentCard.customFields[currentCard.lastFieldKey] += "\n";
          }
        }
        continue;
      }

      // Continuation lines: line belongs to the last active field
      if (currentCard.lastFieldKey) {
        if (currentCard.lastFieldKey === "front") {
          currentCard.front += (currentCard.front ? "\n" : "") + line;
        } else if (currentCard.lastFieldKey === "back") {
          currentCard.back += (currentCard.back ? "\n" : "") + line;
        } else if (currentCard.customFields[currentCard.lastFieldKey] !== undefined) {
          currentCard.customFields[currentCard.lastFieldKey] +=
            (currentCard.customFields[currentCard.lastFieldKey] ? "\n" : "") + line;
        }
      }
    }

    finalizeCard();

    return {
      cards,
      matchedStrategy: this.id,
      diagnostics,
    };
  }
}
