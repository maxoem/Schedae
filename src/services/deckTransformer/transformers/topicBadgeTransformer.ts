import type { CardTransformer, TransformationContext } from "../types";
import type { FlashCard } from "@/converters/types";

export interface ExtractedTopicInfo {
  matchedPrefix: string;
  topicText: string;
}

/**
 * Parses leading topic/domain patterns at the start of a front card field, such as:
 * - $$Metriken | Regression$$
 * - `$$Metriken | Regression$$`
 * - [Metriken | Regression]
 * - `[Metriken | Regression]`
 * - 【Metriken | Regression】
 *
 * Excludes true mathematical equations (e.g. $$E = mc^2$$, $$\int f(x)dx$$)
 * and citations (e.g. [1], [1, 2]) to prevent false positives.
 */
export function parseTopicPrefix(frontText: string): ExtractedTopicInfo | null {
  if (!frontText || typeof frontText !== "string") return null;

  const trimmed = frontText.trimStart();

  // Pattern 1: $$Topic | Subtopic$$ (optionally wrapped in code backticks: `$$...$$`)
  const mathDelimMatch = trimmed.match(/^(?:`\s*)?\$\$([^\n$]+)\$\$(?:\s*`)?/);
  if (mathDelimMatch) {
    const rawInside = mathDelimMatch[1].trim();
    // Exclude actual math: equations (=, <, >), math commands (\frac, \sum, etc.), powers (^), subscripts (_)
    const isMath = /[{}\\_=^]|\\[a-zA-Z]+|\d+\s*[+\-*/]\s*\d+/.test(rawInside);
    if (!isMath && rawInside.length >= 2 && rawInside.length <= 120) {
      return {
        matchedPrefix: mathDelimMatch[0],
        topicText: rawInside,
      };
    }
  }

  // Pattern 2: [Topic | Subtopic] (optionally wrapped in code backticks: `[...]`)
  const bracketMatch = trimmed.match(/^(?:`\s*)?\[([^\n[\]]+)\](?:\s*`)?/);
  if (bracketMatch) {
    const rawInside = bracketMatch[1].trim();
    // Exclude citation numbers like [1], [1, 2], URLs, or markdown checkboxes like [x] or [ ]
    const isCitationOrLink = /^(\d+(?:\s*,\s*\d+)*|[ xX]|https?:\/\/.*)$/.test(rawInside);
    if (!isCitationOrLink && rawInside.length >= 2 && rawInside.length <= 120) {
      return {
        matchedPrefix: bracketMatch[0],
        topicText: rawInside,
      };
    }
  }

  // Pattern 3: 【Topic | Subtopic】
  const cjkBracketMatch = trimmed.match(/^(?:`\s*)?【([^\n【】]+)】(?:\s*`)?/);
  if (cjkBracketMatch) {
    const rawInside = cjkBracketMatch[1].trim();
    if (rawInside.length >= 2 && rawInside.length <= 120) {
      return {
        matchedPrefix: cjkBracketMatch[0],
        topicText: rawInside,
      };
    }
  }

  return null;
}

/**
 * Formats a topic string into a clean Anki hierarchical tag.
 * E.g., "Metriken | Regression" -> "Metriken::Regression"
 */
export function formatTopicToAnkiTag(topic: string): string {
  if (!topic || typeof topic !== "string") return "";

  const segments = topic
    .split(/\s*(?:\||::|>|\/)\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_\u00C0-\u017F-]/g, ""));

  return segments.join("::");
}

/**
 * Card-level transformer that detects and extracts topic/domain prefixes from
 * the card's Front field and elevates them into a first-class Topic custom field
 * and Anki hierarchical tags.
 */
export class TopicBadgeTransformer implements CardTransformer {
  readonly id = "topic-badges";
  readonly name = "Topic Badge Extractor";
  readonly description =
    "Extracts leading topic and breadcrumb patterns (e.g. $$Topic | Subtopic$$ or [Topic | Subtopic]) into a Topic field and Anki tags, keeping the question clean.";
  readonly order = 5;

  canTransform(card: FlashCard, _context?: TransformationContext): boolean {
    if (!card) return false;
    // Check if card.front has a leading topic prefix
    if (card.front && parseTopicPrefix(card.front) !== null) {
      return true;
    }
    // Or if card already has a Topic custom field that isn't yet formatted to tags
    if (card.customFields?.Topic || card.customFields?.topic) {
      const topicText = card.customFields?.Topic || card.customFields?.topic || "";
      const expectedTag = formatTopicToAnkiTag(topicText);
      if (expectedTag && (!card.tags || !card.tags.includes(expectedTag))) {
        return true;
      }
    }
    return false;
  }

  transform(card: FlashCard, _context?: TransformationContext): FlashCard {
    if (!card) return card;

    let updatedFront = card.front;
    let topicText = card.customFields?.Topic || card.customFields?.topic || "";

    if (card.front) {
      const prefixInfo = parseTopicPrefix(card.front);
      if (prefixInfo) {
        // Strip matched prefix from front
        const frontTrimmed = card.front.trimStart();
        const remainder = frontTrimmed.slice(prefixInfo.matchedPrefix.length).trimStart();
        // If remainder is non-empty, use it as clean front
        if (remainder.length > 0) {
          updatedFront = remainder;
        }
        if (!topicText) {
          topicText = prefixInfo.topicText;
        }
      }
    }

    if (!topicText) {
      return card;
    }

    const customFields = { ...(card.customFields || {}) };
    customFields.Topic = topicText;

    // Build hierarchical Anki tag
    const newTag = formatTopicToAnkiTag(topicText);
    let updatedTags = card.tags || "";
    if (newTag) {
      const existingTagsList = updatedTags.split(/\s+/).filter(Boolean);
      if (!existingTagsList.includes(newTag)) {
        existingTagsList.push(newTag);
        updatedTags = existingTagsList.join(" ");
      }
    }

    return {
      ...card,
      front: updatedFront,
      customFields,
      tags: updatedTags,
    };
  }
}
