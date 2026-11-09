import type { FlashCard } from "@/converters/types";
import { dedentText } from "@/lib/utils";
import type {
  ExtractorOptions,
  ExtractorResult,
  ExtractorStrategy,
  DiagnosticIssue,
} from "../types";

const FRONT_ALIASES = /^(?:front|question|frage|vorderseite|prompt)$/i;
const BACK_ALIASES = /^(?:back|answer|antwort|rückseite|solution|lösung)$/i;
const CARD_HEADER_REGEX = /^(?:card|karte)\s*[\d.:]/i;
const KNOWN_METADATA_FIELDS = /^(?:quelle(?:\(n\))?|source|sources|tags|category|kategorie|notes|notizen|extra|hinweis)\b/i;

export class KeyValueExtractor implements ExtractorStrategy {
  readonly id = "key-value";
  readonly label = "Bullet List / Key-Value";

  canExtract(text: string): boolean {
    if (!text || text.trim().length === 0) return false;
    const norm = text.normalize("NFC");
    const hasBulletFront = /(?:^|\n)[ \t]*[-*+][ \t]+(?:\*\*|__)?(?:Front|Question|Frage|Vorderseite|Prompt)(?:\*\*|__)?(?:\s*\([^)]*\))?[ \t]*:/im.test(norm);
    const hasBulletBack = /(?:^|\n)[ \t]*[-*+][ \t]+(?:\*\*|__)?(?:Back|Answer|Antwort|Rückseite|Solution|Lösung)(?:\*\*|__)?(?:\s*\([^)]*\))?[ \t]*:/im.test(norm);
    const hasPlainFront = /(?:^|\n)[ \t]*(?:Front|Question|Frage|Vorderseite|Prompt)(?:\s*\([^)]*\))?[ \t]*:/im.test(norm);
    const hasPlainBack = /(?:^|\n)[ \t]*(?:Back|Answer|Antwort|Rückseite|Solution|Lösung)(?:\s*\([^)]*\))?[ \t]*:/im.test(norm);
    return (hasBulletFront && hasBulletBack) || (hasPlainFront && hasPlainBack);
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
        if (CARD_HEADER_REGEX.test(headingText)) {
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
        if (CARD_HEADER_REGEX.test(rawKey)) {
          finalizeCard();
          currentCard.title = rawKey;
          continue;
        }

        const normKey = rawKey.replace(/\s*\([^)]*\)$/, "").trim();
        const isFront = FRONT_ALIASES.test(normKey);
        const isBack = BACK_ALIASES.test(normKey);
        const isKnownMetadata = KNOWN_METADATA_FIELDS.test(normKey) || KNOWN_METADATA_FIELDS.test(rawKey);

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
