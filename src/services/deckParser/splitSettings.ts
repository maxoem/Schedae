import { unified } from "unified";
import remarkParse from "remark-parse";
import { toString } from "mdast-util-to-string";
import { dedentText } from "@/lib/utils";
import type { FlashCard } from "@/converters/types";

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

export const PREDEFINED_EXTRACTION_SETS: SplitSettings[] = [
  {
    id: "headings",
    name: "Markdown Headings",
    cardSeparators: "### Karte, ## Karte, # Karte, ### Card, ## Card, # Card",
    questionMarkers: "### Frage, ## Frage, # Frage, ### Question, ## Question, # Question",
    answerMarkers: "### Antwort, ## Antwort, # Antwort, ### Answer, ## Answer, # Answer",
    includeCardSeparatorMarker: false,
    includeQuestionMarker: false,
    includeAnswerMarker: false,
    ignoreMarkerBrackets: true,
  },
  {
    id: "bold-italic",
    name: "Bold and Italic",
    cardSeparators: "**Karte**, **Card**",
    questionMarkers: "*Frage:*, **Frage:**, *Question:*, **Question:**",
    answerMarkers: "*Antwort:*, **Antwort:**, *Answer:*, **Answer:**",
    includeCardSeparatorMarker: false,
    includeQuestionMarker: false,
    includeAnswerMarker: false,
    ignoreMarkerBrackets: true,
  },
  {
    id: "generic",
    name: "Generic (Plain Text)",
    cardSeparators: "Karte, Card, ***, ---",
    questionMarkers: "Frage:, Question:, Q:, Front:, Vorderseite:",
    answerMarkers: "Antwort:, Answer:, A:, Back:, Rückseite:",
    includeCardSeparatorMarker: false,
    includeQuestionMarker: false,
    includeAnswerMarker: false,
    ignoreMarkerBrackets: true,
  },
];

export const DEFAULT_SPLIT_SETTINGS: SplitSettings = PREDEFINED_EXTRACTION_SETS[2];

export interface HighlightMarkerPattern {
  regex: RegExp;
  className: string;
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSeparatorMarker(value: string) {
  return value
    .trim()
    .replace(/^\s*(?:#+\s+)?(?:\*\*|__)?/, "")
    .replace(/(?:\*\*|__)?\s*$/, "")
    .trim();
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

    const variants = Array.from(new Set([marker, marker.normalize("NFC"), marker.normalize("NFD")]));
    return variants.map((v) => {
      const escapedMarker = escapeRegExp(v);
      return `^\\s*(?:[*+-]\\s+)?(?:#+\\s+)?(?:\\*\\*|__)?${escapedMarker}(?:\\b|$)(?:[^\\n]*)?(?:\\*\\*|__)?\\s*$`;
    });
  });
  const blockRegex = blockPatterns.length > 0 ? new RegExp(blockPatterns.join("|"), "m") : /(?!x)x/;

  const bracketOpt = settings.ignoreMarkerBrackets ? `\\s*(?:\\([^)]*\\)|\\[[^\\]]*\\])?` : ``;

  const qParts = getParts(settings.questionMarkers).flatMap((s) => {
    const base = s.replace(/:$/, "");
    const variants = Array.from(new Set([base, base.normalize("NFC"), base.normalize("NFD")]));
    return variants.map((v) => escapeRegExp(v) + (v.match(/[a-zA-Z\u00C0-\u017F]$/) ? "\\b" : ""));
  });
  const questionRegexStr =
    qParts.length > 0
      ? `^\\s*(?:[*+-]\\s+)?(?:#+\\s+)?(?:\\*\\*|__)?(?:${qParts.join("|")})${bracketOpt}\\s*(?:\\*\\*|__)?\\s*:?\\s*(?:\\*\\*|__)?\\s*(.*)$`
      : `(?!x)x`;
  const questionRegex = new RegExp(questionRegexStr, "im");

  const aParts = getParts(settings.answerMarkers).flatMap((s) => {
    const base = s.replace(/:$/, "");
    const variants = Array.from(new Set([base, base.normalize("NFC"), base.normalize("NFD")]));
    return variants.map((v) => escapeRegExp(v) + (v.match(/[a-zA-Z\u00C0-\u017F]$/) ? "\\b" : ""));
  });
  const answerRegexStr =
    aParts.length > 0
      ? `^\\s*(?:[*+-]\\s+)?(?:#+\\s+)?(?:\\*\\*|__)?(?:${aParts.join("|")})${bracketOpt}\\s*(?:\\*\\*|__)?\\s*:?\\s*(?:\\*\\*|__)?\\s*(.*)$`
      : `(?!x)x`;
  const answerRegex = new RegExp(answerRegexStr, "im");

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

export function extractFlashcardsFromText(text: string, settings: SplitSettings): FlashCard[] {
  const cards: FlashCard[] = [];
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

    const isCardSeparator = blockRegex.test(nodeText) || (node.type === "heading" && /^###?\s*Karte/i.test(nodeText));
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
      const variants = bParts.flatMap((s) => Array.from(new Set([s, s.normalize("NFC"), s.normalize("NFD")])));
      const escapedBParts = variants.map((s) => escapeRegExp(s));
      const bPartsStr = escapedBParts.join("|");
      const cleanRegex = new RegExp(
        `^\\s*(?:[*+-]\\s+)?(?:#+\\s+)?(?:\\*\\*|__)?(?:${bPartsStr})\\s*(?:\\*\\*|__)?\\s*:?\\s*(?:\\*\\*|__)?\\s*`,
        "m"
      );
      frontMd = frontMd.replace(cleanRegex, "").trim();
      backMd = backMd.replace(cleanRegex, "").trim();
    }

    frontMd = dedentText(frontMd);
    backMd = dedentText(backMd);

    if (frontMd && backMd) {
      cards.push({ front: frontMd, back: backMd });
    }
  }

  return cards;
}
