import { unified } from "unified";
import remarkParse from "remark-parse";
import { toString } from "mdast-util-to-string";
import { dedentText } from "@/lib/utils";
import type { FlashCard } from "@/converters/types";
import {
  PARSER_KEYWORDS,
  HEADING_CARD_HEADER_REGEX,
  isCardKeyword,
} from "./keywords";

export type MarkdownNode = {
  type: string;
  children?: MarkdownNode[];
  position?: {
    start?: { offset?: number };
    end?: { offset?: number };
  };
};

export interface SplitSettings {
  id?: string;
  name?: string;
  cardSeparators: string;
  questionMarkers: string;
  answerMarkers: string;
  includeCardSeparatorMarker: boolean;
  includeQuestionMarker: boolean;
  includeAnswerMarker: boolean;
  ignoreMarkerBrackets: boolean;
}

export interface RegexExtractionOutput {
  cards: FlashCard[];
  /** Cards where at least one configured question or answer marker matched */
  markerMatchedCards: number;
  /** Cards extracted solely via positional fallback (no Q/A marker matched) */
  positionalFallbackCards: number;
}

export const PREDEFINED_EXTRACTION_SETS: SplitSettings[] = [
  {
    id: "headings",
    name: "Markdown Headings",
    cardSeparators: "### Karte, ## Karte, # Karte, ### Card, ## Card, # Card, ---, ***",
    questionMarkers:
      "### Frage, ## Frage, # Frage, ### Question, ## Question, # Question, ### Vorderseite, ## Vorderseite, # Vorderseite, ### Front, ## Front, # Front",
    answerMarkers:
      "### Antwort, ## Antwort, # Antwort, ### Answer, ## Answer, # Answer, ### Rückseite, ## Rückseite, # Rückseite, ### Back, ## Back, # Back",
    includeCardSeparatorMarker: false,
    includeQuestionMarker: false,
    includeAnswerMarker: false,
    ignoreMarkerBrackets: true,
  },
  {
    id: "bold-italic",
    name: "Bold and Italic",
    cardSeparators: "**Karte**, **Card**, ### Karte, ### Card, ---, ***",
    questionMarkers:
      "*Frage:*, **Frage:**, *Question:*, **Question:**, *Vorderseite:*, **Vorderseite:**, *Front:*, **Front:**",
    answerMarkers:
      "*Antwort:*, **Antwort:**, *Answer:*, **Answer:**, *Rückseite:*, **Rückseite:**, *Back:*, **Back:**",
    includeCardSeparatorMarker: false,
    includeQuestionMarker: false,
    includeAnswerMarker: false,
    ignoreMarkerBrackets: true,
  },
  {
    id: "generic",
    name: "Generic (Plain Text)",
    cardSeparators: "Karte, Card, ***, ---",
    questionMarkers: "Frage:, Question:, Q:, Front:, Vorderseite:, Prompt:",
    answerMarkers: "Antwort:, Answer:, A:, Back:, Rückseite:, Solution:, Lösung:",
    includeCardSeparatorMarker: false,
    includeQuestionMarker: false,
    includeAnswerMarker: false,
    ignoreMarkerBrackets: true,
  },
];

/**
 * Canonical multilingual SplitSettings derived from PARSER_KEYWORDS (Single Source of Truth).
 * Used by Auto-Detect and as the comprehensive fallback in RegexExtractor.
 */
export const CANONICAL_SPLIT_SETTINGS: SplitSettings = {
  id: "canonical",
  name: "Canonical (All Languages)",
  cardSeparators: [...PARSER_KEYWORDS.card, "***", "---"].join(", "),
  questionMarkers: PARSER_KEYWORDS.front.map((k) => `${k}:`).join(", "),
  answerMarkers: PARSER_KEYWORDS.back.map((k) => `${k}:`).join(", "),
  includeCardSeparatorMarker: false,
  includeQuestionMarker: false,
  includeAnswerMarker: false,
  ignoreMarkerBrackets: true,
};

export const DEFAULT_SPLIT_SETTINGS: SplitSettings = PREDEFINED_EXTRACTION_SETS[2];

export interface HighlightMarkerPattern {
  regex: RegExp;
  className: string;
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeVariants(value: string): string[] {
  return Array.from(new Set([value, value.normalize("NFC"), value.normalize("NFD")]));
}

function normalizeSeparatorMarker(value: string) {
  return value
    .trim()
    .replace(/^\s*(?:#+\s+)?(?:\*\*|__)?/, "")
    .replace(/(?:\*\*|__)?\s*$/, "")
    .trim();
}

function escapeKeywordVariants(core: string): string {
  const variants = normalizeVariants(core);
  const pattern = variants
    .map((v) => escapeRegExp(v) + (/[a-zA-Z\u00C0-\u017F]$/.test(v) ? "\\b" : ""))
    .join("|");
  return `(?:${pattern})`;
}

function buildMarkerAlternative(rawToken: string, bracketOpt: string): string {
  const token = rawToken.trim();
  if (!token) return "";

  // 1. Explicit Markdown heading marker (e.g. "### Frage", "## **Rückseite:**")
  const headingMatch = token.match(/^(#{1,6})\s+(.+)$/);
  if (headingMatch) {
    const hashes = headingMatch[1];
    const rest = headingMatch[2].trim();
    const core = rest
      .replace(/^(\*\*|__|\*|_)(.+?)\1\s*:?$/, "$2")
      .replace(/:$/, "")
      .trim();
    const corePattern = escapeKeywordVariants(core);
    return `\\s*${hashes}\\s+(?:\\*{1,2}|_{1,2})?${corePattern}${bracketOpt}\\s*(?:\\*{1,2}|_{1,2})?\\s*:?\\s*(?:\\*{1,2}|_{1,2})?`;
  }

  // 2. Emphasis-wrapped marker (e.g. "**Vorderseite:**", "*Frage:*", "__Front__")
  const emphMatch = token.match(/^(\*\*|__|\*|_)(.+?)\1\s*:?$/);
  if (emphMatch) {
    const delim = emphMatch[1];
    const core = emphMatch[2].replace(/:$/, "").trim();
    if (/[a-zA-Z0-9\u00C0-\u017F]/.test(core)) {
      const corePattern = escapeKeywordVariants(core);
      const emphOpen = delim.length === 2 ? "(?:\\*\\*|__)" : "(?:\\*{1,2}|_{1,2})";
      return `\\s*(?:[*+-]\\s+)?(?:#+\\s+)?${emphOpen}${corePattern}${bracketOpt}\\s*(?:${emphOpen}\\s*:?|:?\\s*${emphOpen})`;
    }
  }

  // 3. Plain / generic keyword marker (e.g. "Vorderseite:", "Q:", "Front")
  const core = token.replace(/:$/, "").trim();
  const corePattern = escapeKeywordVariants(core);

  if (!/[a-zA-Z0-9\u00C0-\u017F]/.test(core)) {
    return `\\s*(?:[*+-]\\s+)?(?:#+\\s+)?(?:\\*{1,2}|_{1,2})?${corePattern}${bracketOpt}\\s*(?:\\*{1,2}|_{1,2})?\\s*:?\\s*(?:\\*{1,2}|_{1,2})?`;
  }

  const structuralForm = `\\s*(?:[*+-]\\s+)?(?:#+\\s+(?:\\*{1,2}|_{1,2})?|(?:#+\\s+)?(?:\\*{1,2}|_{1,2}))${corePattern}${bracketOpt}\\s*(?:\\*{1,2}|_{1,2})?\\s*:?\\s*(?:\\*{1,2}|_{1,2})?`;
  const colonForm = `\\s*(?:[*+-]\\s+)?${corePattern}${bracketOpt}\\s*:`;
  if (core.length > 1) {
    const standaloneForm = `\\s*(?:[*+-]\\s+)?${corePattern}${bracketOpt}(?=\\s*$)`;
    return `(?:${structuralForm}|${colonForm}|${standaloneForm})`;
  }
  return `(?:${structuralForm}|${colonForm})`;
}

function buildMarkerRegex(markersCsv: string, bracketOpt: string): { regex: RegExp; parts: string[] } {
  const rawTokens = markersCsv.split(",").map((s) => s.trim()).filter(Boolean);
  const alternatives = rawTokens.map((t) => buildMarkerAlternative(t, bracketOpt)).filter(Boolean);
  const parts = rawTokens.flatMap((s) => {
    const base = s.replace(/:$/, "");
    return normalizeVariants(base).map((v) => escapeRegExp(v) + (/[a-zA-Z\u00C0-\u017F]$/.test(v) ? "\\b" : ""));
  });
  const regexStr = alternatives.length > 0 ? `^(?:${alternatives.join("|")})\\s*(.*)$` : `(?!x)x`;
  return { regex: new RegExp(regexStr, "im"), parts };
}

export function buildSplitRegexes(settings: SplitSettings) {
  const getParts = (str: string) => str.split(",").map((s) => s.trim()).filter(Boolean);

  const bParts = getParts(settings.cardSeparators);
  const blockPatterns = bParts.flatMap((part) => {
    const marker = normalizeSeparatorMarker(part.replace(/:$/, ""));

    if (!marker || /^[*_-]+$/.test(marker)) {
      const escapedExact = escapeRegExp(part);
      return [`^\\s*(?:[*+-]\\s+)?(?:#+\\s+)?(?:\\*\\*|__)?${escapedExact}(?:\\*\\*|__)?\\s*$`];
    }

    const variants = normalizeVariants(marker);
    return variants.map((v) => {
      const escapedMarker = escapeRegExp(v);
      const boundary = isCardKeyword(v)
        ? `(?:\\s*[\\d.#:–-]|\\s*(?:\\*\\*|__)?\\s*$)`
        : `(?:\\b|$)`;
      return `^\\s*(?:[*+-]\\s+)?(?:#+\\s+)?(?:\\*\\*|__)?${escapedMarker}${boundary}(?:[^\\n]*)?(?:\\*\\*|__)?\\s*$`;
    });
  });
  const blockRegex = blockPatterns.length > 0 ? new RegExp(blockPatterns.join("|"), "im") : /(?!x)x/;

  const bracketOpt = settings.ignoreMarkerBrackets ? `\\s*(?:\\([^)]*\\)|\\[[^\\]]*\\])?` : ``;

  const { regex: questionRegex, parts: qParts } = buildMarkerRegex(settings.questionMarkers, bracketOpt);
  const { regex: answerRegex, parts: aParts } = buildMarkerRegex(settings.answerMarkers, bracketOpt);

  return { blockRegex, questionRegex, answerRegex, qParts, aParts, bParts };
}

export const _markerCssClass = {
  separator: "text-zinc-700 dark:text-zinc-300 font-bold bg-zinc-100/90 dark:bg-zinc-800/70 rounded-xs",
  question: "text-sky-950 dark:text-sky-100 font-semibold bg-sky-100/80 dark:bg-sky-950/50 rounded-xs",
  answer: "text-emerald-950 dark:text-emerald-100 font-semibold bg-emerald-100/80 dark:bg-emerald-950/50 rounded-xs",
  customField: "text-amber-950 dark:text-amber-100 font-semibold bg-amber-100/80 dark:bg-amber-950/50 rounded-xs",
};

/**
 * Build syntax highlight patterns from SplitSettings and custom field names.
 */
export function buildHighlightPatterns(
  settings: SplitSettings,
  customFieldNames?: string[]
): HighlightMarkerPattern[] {
  const { blockRegex, questionRegex, answerRegex } = buildSplitRegexes(settings);

  const withG = (rx: RegExp) => {
    const str = rx.source;
    const flags = rx.flags.replace(/g/, "");
    return new RegExp(str, flags + "g");
  };

  const patterns: HighlightMarkerPattern[] = [];
  if (blockRegex.source !== "(?!x)x") {
    patterns.push({ regex: withG(blockRegex), className: _markerCssClass.separator });
  }
  if (questionRegex.source !== "(?!x)x") {
    patterns.push({ regex: withG(questionRegex), className: _markerCssClass.question });
  }
  if (answerRegex.source !== "(?!x)x") {
    patterns.push({ regex: withG(answerRegex), className: _markerCssClass.answer });
  }

  if (customFieldNames && customFieldNames.length > 0) {
    const uniqueFields = Array.from(new Set(customFieldNames.filter(Boolean)));
    for (const field of uniqueFields) {
      const escaped = escapeRegExp(field);
      const headingRx = new RegExp(`^\\s*#{1,6}\\s+${escaped}(?:\\s*:.*|\\s*)$`, "gim");
      const kvRx = new RegExp(`^\\s*(?:[*+-]\\s+)?(?:\\*\\*|__)?${escaped}(?:\\*\\*|__)?\\s*:.*$`, "gim");
      patterns.push({ regex: headingRx, className: _markerCssClass.customField });
      patterns.push({ regex: kvRx, className: _markerCssClass.customField });
    }
  }

  return patterns;
}

function removeMarkerLines(text: string, markerRegex: RegExp): string {
  const cleanFlags = markerRegex.flags;
  const lines = text.split(/\r?\n/);
  const result: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (new RegExp(markerRegex.source, cleanFlags).test(line)) {
      i++;
      while (i < lines.length && lines[i].trim() === "") i++;
    } else {
      result.push(line);
      i++;
    }
  }

  return result.join("\n");
}

export function extractFlashcardsWithMeta(text: string, settings: SplitSettings): RegexExtractionOutput {
  const cards: FlashCard[] = [];
  let markerMatchedCards = 0;
  let positionalFallbackCards = 0;
  const { blockRegex, questionRegex, answerRegex, bParts } = buildSplitRegexes(settings);

  // 1. Pre-process to ensure structural markers are partitioned into their own block-level nodes
  const lines = text.split("\n");
  const spacedLines = lines.map((line) => {
    if (blockRegex.test(line) || questionRegex.test(line) || answerRegex.test(line)) {
      return `\n\n${line}`;
    }
    return line;
  });
  const preprocessedText = spacedLines.join("\n");

  // 2. Parse Markdown to AST
  const tree = unified().use(remarkParse).parse(preprocessedText);

  // 3. Chunk tree into cards
  const cardChunks: MarkdownNode[][] = [];
  let currentChunk: MarkdownNode[] = [];
  let chunkHasQ = false;
  let chunkHasA = false;

  for (const node of (tree.children as MarkdownNode[])) {
    let nodeText = "";
    if (node.position?.start?.offset !== undefined && node.position?.end?.offset !== undefined) {
      nodeText = preprocessedText.substring(node.position.start.offset, node.position.end.offset);
    } else {
      nodeText = toString(node as any);
    }

    const isCardSeparator =
      blockRegex.test(nodeText) ||
      (node.type === "heading" && HEADING_CARD_HEADER_REGEX.test(nodeText));
    const isQuestion = questionRegex.test(nodeText);
    const isAnswer = answerRegex.test(nodeText);

    if (isCardSeparator) {
      if (currentChunk.length > 0) {
        cardChunks.push(currentChunk);
        currentChunk = [];
      }
      chunkHasQ = false;
      chunkHasA = false;
      continue;
    }

    if (isQuestion) {
      if (chunkHasQ) {
        if (currentChunk.length > 0) {
          cardChunks.push(currentChunk);
          currentChunk = [];
        }
        chunkHasA = false;
      }
      chunkHasQ = true;
    } else if (isAnswer) {
      if (chunkHasA && !chunkHasQ) {
        if (currentChunk.length > 0) {
          cardChunks.push(currentChunk);
          currentChunk = [];
        }
      }
      chunkHasA = true;
    }

    currentChunk.push(node);
  }
  if (currentChunk.length > 0) {
    cardChunks.push(currentChunk);
  }

  // 4. Process each chunk
  for (const chunk of cardChunks) {
    let qIndex = -1;
    let aIndex = -1;

    for (let i = 0; i < chunk.length; i++) {
      let nodeText = "";
      const nodePos = chunk[i].position;
      if (nodePos?.start?.offset !== undefined && nodePos?.end?.offset !== undefined) {
        nodeText = preprocessedText.substring(nodePos.start.offset, nodePos.end.offset);
      } else {
        nodeText = toString(chunk[i] as any);
      }

      if (qIndex === -1 && questionRegex.test(nodeText)) {
        qIndex = i;
      }
      if (aIndex === -1 && answerRegex.test(nodeText)) {
        aIndex = i;
      }
    }

    let frontNodes: MarkdownNode[] = [];
    let backNodes: MarkdownNode[] = [];
    const usedMarker = qIndex !== -1 || aIndex !== -1;

    if (qIndex !== -1 && aIndex !== -1) {
      if (qIndex < aIndex) {
        frontNodes = chunk.slice(0, aIndex);
        backNodes = chunk.slice(aIndex);
      } else {
        backNodes = chunk.slice(aIndex, qIndex);
        frontNodes = chunk.slice(qIndex);
      }
    } else if (qIndex !== -1) {
      frontNodes = chunk.slice(0, qIndex + 1);
      backNodes = chunk.slice(qIndex + 1);
    } else if (aIndex !== -1) {
      frontNodes = chunk.slice(0, aIndex);
      backNodes = chunk.slice(aIndex);
    } else {
      if (chunk.length >= 2) {
        frontNodes = chunk.slice(0, 1);
        backNodes = chunk.slice(1);
      } else {
        continue;
      }
    }

    if (frontNodes.length === 0 || backNodes.length === 0) continue;

    const nodesToMarkdown = (nodes: MarkdownNode[]) => {
      const start = nodes[0]?.position?.start?.offset;
      const end = nodes[nodes.length - 1]?.position?.end?.offset;

      if (typeof start === "number" && typeof end === "number" && end >= start) {
        return preprocessedText.substring(start, end).trim();
      }

      return nodes.map((node) => toString(node as any)).join("\n\n").trim();
    };

    let frontMd = nodesToMarkdown(frontNodes);
    let backMd = nodesToMarkdown(backNodes);

    if (!settings.includeQuestionMarker && qIndex !== -1) {
      const qMatch = frontMd.match(questionRegex);
      if (qMatch && qMatch[1] && qMatch[1].trim()) {
        frontMd = frontMd.replace(qMatch[0], qMatch[1]).trim();
      } else {
        frontMd = removeMarkerLines(frontMd, questionRegex).trim();
      }
    }

    if (!settings.includeAnswerMarker && aIndex !== -1) {
      const aMatch = backMd.match(answerRegex);
      if (aMatch && aMatch[1] && aMatch[1].trim()) {
        backMd = backMd.replace(aMatch[0], aMatch[1]).trim();
      } else {
        backMd = removeMarkerLines(backMd, answerRegex).trim();
      }
    }

    if (!settings.includeCardSeparatorMarker && bParts.length > 0) {
      const variants = bParts.flatMap((s) => normalizeVariants(s));
      const escapedBParts = variants.map((s) => escapeRegExp(s));
      const bPartsStr = escapedBParts.join("|");
      const cleanRegex = new RegExp(
        `^\\s*(?:[*+-]\\s+)?(?:#+\\s+)?(?:\\*\\*|__)?(?:${bPartsStr})\\s*(?:\\*\\*|__)?\\s*:?\\s*(?:\\*\\*|__)?\\s*`,
        "im"
      );
      frontMd = frontMd.replace(cleanRegex, "").trim();
      backMd = backMd.replace(cleanRegex, "").trim();
    }

    frontMd = dedentText(frontMd);
    backMd = dedentText(backMd);

    if (frontMd && backMd) {
      cards.push({ front: frontMd, back: backMd });
      if (usedMarker) {
        markerMatchedCards++;
      } else {
        positionalFallbackCards++;
      }
    }
  }

  return { cards, markerMatchedCards, positionalFallbackCards };
}

export function extractFlashcardsFromText(text: string, settings: SplitSettings): FlashCard[] {
  return extractFlashcardsWithMeta(text, settings).cards;
}
