import type { MarkerPattern } from "./SyntaxEditor";

/* ─────────────────────────────────────────────────────────
 *  Lighter / Pastel Theme Palette
 * ───────────────────────────────────────────────────────── */

export interface FieldPalette {
  name: string;
  header: string;
  body: string;
}

export const PASTEL_PALETTES = {
  question: {
    name: "question",
    header: "bg-sky-100/60 text-sky-950 dark:bg-sky-950/40 dark:text-sky-200 font-semibold",
    body: "bg-sky-100/60 text-sky-950 dark:bg-sky-950/40 dark:text-sky-200",
  },
  answer: {
    name: "answer",
    header: "bg-emerald-100/60 text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-200 font-semibold",
    body: "bg-emerald-100/60 text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-200",
  },
  separator: {
    name: "separator",
    header: "bg-zinc-100/90 text-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-200 font-bold",
    body: "bg-zinc-100/90 text-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-200 font-bold",
  },
  customNamed: {
    notes: {
      name: "notes",
      header: "bg-amber-100/60 text-amber-950 dark:bg-amber-950/40 dark:text-amber-200 font-semibold",
      body: "bg-amber-100/60 text-amber-950 dark:bg-amber-950/40 dark:text-amber-200",
    },
    sources: {
      name: "sources",
      header: "bg-purple-100/60 text-purple-950 dark:bg-purple-950/40 dark:text-purple-200 font-semibold",
      body: "bg-purple-100/60 text-purple-950 dark:bg-purple-950/40 dark:text-purple-200",
    },
    context: {
      name: "context",
      header: "bg-teal-100/60 text-teal-950 dark:bg-teal-950/40 dark:text-teal-200 font-semibold",
      body: "bg-teal-100/60 text-teal-950 dark:bg-teal-950/40 dark:text-teal-200",
    },
    hints: {
      name: "hints",
      header: "bg-rose-100/60 text-rose-950 dark:bg-rose-950/40 dark:text-rose-200 font-semibold",
      body: "bg-rose-100/60 text-rose-950 dark:bg-rose-950/40 dark:text-rose-200",
    },
    tags: {
      name: "tags",
      header: "bg-orange-100/60 text-orange-950 dark:bg-orange-950/40 dark:text-orange-200 font-semibold",
      body: "bg-orange-100/60 text-orange-950 dark:bg-orange-950/40 dark:text-orange-200",
    },
  } as Record<string, FieldPalette>,
  customPool: [
    {
      name: "custom-amber",
      header: "bg-amber-100/60 text-amber-950 dark:bg-amber-950/40 dark:text-amber-200 font-semibold",
      body: "bg-amber-100/60 text-amber-950 dark:bg-amber-950/40 dark:text-amber-200",
    },
    {
      name: "custom-purple",
      header: "bg-purple-100/60 text-purple-950 dark:bg-purple-950/40 dark:text-purple-200 font-semibold",
      body: "bg-purple-100/60 text-purple-950 dark:bg-purple-950/40 dark:text-purple-200",
    },
    {
      name: "custom-rose",
      header: "bg-rose-100/60 text-rose-950 dark:bg-rose-950/40 dark:text-rose-200 font-semibold",
      body: "bg-rose-100/60 text-rose-950 dark:bg-rose-950/40 dark:text-rose-200",
    },
    {
      name: "custom-teal",
      header: "bg-teal-100/60 text-teal-950 dark:bg-teal-950/40 dark:text-teal-200 font-semibold",
      body: "bg-teal-100/60 text-teal-950 dark:bg-teal-950/40 dark:text-teal-200",
    },
    {
      name: "custom-orange",
      header: "bg-orange-100/60 text-orange-950 dark:bg-orange-950/40 dark:text-orange-200 font-semibold",
      body: "bg-orange-100/60 text-orange-950 dark:bg-orange-950/40 dark:text-orange-200",
    },
    {
      name: "custom-indigo",
      header: "bg-indigo-100/60 text-indigo-950 dark:bg-indigo-950/40 dark:text-indigo-200 font-semibold",
      body: "bg-indigo-100/60 text-indigo-950 dark:bg-indigo-950/40 dark:text-indigo-200",
    },
  ] as FieldPalette[],
  inline: {
    codeInline: "bg-black/5 dark:bg-white/10 rounded-xs font-mono",
    codeBlock: "bg-black/5 dark:bg-white/10 rounded-xs font-mono",
    bold: "font-bold",
    italic: "italic",
  },
};

export interface HighlightRun {
  offset: number;
  end: number;
  className: string;
}

/* ─────────────────────────────────────────────────────────
 *  Helper: Detect if input text is structured JSON
 * ───────────────────────────────────────────────────────── */

export function isJsonInput(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("{") && trimmed.endsWith("}"))) {
    try {
      JSON.parse(trimmed);
      return true;
    } catch {
      if (/^\s*\[\s*\{/m.test(trimmed) || /^\s*\{\s*"/m.test(trimmed)) {
        return true;
      }
    }
  }
  return false;
}

/* ─────────────────────────────────────────────────────────
 *  Regex Matchers for Markdown Flashcard Fields
 * ───────────────────────────────────────────────────────── */

const HR_SEPARATOR_REGEX = /^[-*_]{3,}$/;
const HEADING_CARD_REGEX = /^#{1,6}\s*(?:Karte|Card)(?:\s+\d+|\b.*)$/i;
const BOLD_CARD_REGEX = /^[-*•]?\s*(?:\*\*|__)(?:Karte|Card)(?:\s+\d+|\b.*)(?:\*\*|__)\s*:?.*$/i;

const HEADING_QUESTION_REGEX = /^#{1,6}\s*(?:Karte|Card)?\s*[*_~]*(?:Frage|Question|Front|Vorderseite|Prompt)\b(?:\s*:|\b.*)/i;
const QUESTION_MARKER_PREFIX_REGEX = /^\s*[-*•]?\s*(?:#{1,6}\s*)?(?:\*\*|__)?(?:Frage|Question|Q|Front|Vorderseite|Prompt)(?:\*\*|__)?\s*:(?:\*\*|__)?\s*/i;

const HEADING_ANSWER_REGEX = /^#{1,6}\s*[*_~]*(?:Antwort|Answer|Back|Rückseite|Solution|Lösung)\b(?:\s*:|\b.*)/i;
const ANSWER_MARKER_PREFIX_REGEX = /^\s*[-*•]?\s*(?:#{1,6}\s*)?(?:\*\*|__)?(?:Antwort|Answer|A|Back|Rückseite|Solution|Lösung)(?:\*\*|__)?\s*:(?:\*\*|__)?\s*/i;

const HEADING_CUSTOM_REGEX = /^#{1,6}\s+([^\n#]+)$/i;
const KV_CUSTOM_PREFIX_REGEX = /^\s*[-*•]?\s*(?:\*\*|__)?([A-Za-z0-9_\s/()äöüÄÖÜß-]+?)(?:\*\*|__)?\s*:(?:\*\*|__)?\s*/i;

const NON_FIELD_HEADINGS = /^(?:Karte|Card|Frage|Question|Front|Vorderseite|Antwort|Answer|Back|Rückseite|Prompt|Solution|Lösung)$/i;

function cleanTitle(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/^[*_~`#\s]+|[*_~`#\s]+$/g, "")
    .replace(/^:+|:+$/g, "")
    .replace(/^[*_~`#\s]+|[*_~`#\s]+$/g, "")
    .trim();
}

/**
 * Returns a stable pastel palette for a given custom field name.
 */
function getCustomFieldPalette(fieldName: string, customMap: Map<string, FieldPalette>): FieldPalette {
  const normalized = fieldName.toLowerCase().trim();
  if (PASTEL_PALETTES.customNamed[normalized]) {
    return PASTEL_PALETTES.customNamed[normalized];
  }
  const existing = customMap.get(normalized);
  if (existing) {
    return existing;
  }
  const pool = PASTEL_PALETTES.customPool;
  const picked = pool[customMap.size % pool.length];
  customMap.set(normalized, picked);
  return picked;
}

interface LineInfo {
  start: number;
  end: number; // excluding trailing newline
  text: string;
}

interface InlineToken {
  start: number;
  end: number;
  className: string;
}

/**
 * Finds inline tokens (code snippets) across a line's text.
 * Math formulas remain naturally integrated into the field's unified pastel background.
 */
function findLineInlineTokens(lineText: string, lineStart: number): InlineToken[] {
  const tokens: InlineToken[] = [];

  // Code blocks ```...```
  const codeBlockRegex = /```[\s\S]*?```/g;
  let m: RegExpExecArray | null;
  while ((m = codeBlockRegex.exec(lineText)) !== null) {
    tokens.push({
      start: lineStart + m.index,
      end: lineStart + m.index + m[0].length,
      className: PASTEL_PALETTES.inline.codeBlock,
    });
  }

  // Inline code `...`
  const codeInlineRegex = /`([^`\n]+)`/g;
  while ((m = codeInlineRegex.exec(lineText)) !== null) {
    tokens.push({
      start: lineStart + m.index,
      end: lineStart + m.index + m[0].length,
      className: PASTEL_PALETTES.inline.codeInline,
    });
  }

  // Sort and eliminate overlaps among inline tokens
  tokens.sort((a, b) => a.start - b.start || b.end - a.end);
  const filtered: InlineToken[] = [];
  let lastEnd = 0;
  for (const t of tokens) {
    if (t.start >= lastEnd) {
      filtered.push(t);
      lastEnd = t.end;
    }
  }

  return filtered;
}

/**
 * Emits highlight runs for a line given a base class and any inline tokens on that line.
 */
function addLineRuns(
  runs: HighlightRun[],
  lineStart: number,
  lineEnd: number,
  baseClassName: string,
  inlineTokens: InlineToken[],
) {
  if (lineStart >= lineEnd) return;
  if (!baseClassName) return;

  if (inlineTokens.length === 0) {
    runs.push({ offset: lineStart, end: lineEnd, className: baseClassName });
    return;
  }

  let curr = lineStart;
  for (const token of inlineTokens) {
    if (token.start > curr) {
      runs.push({ offset: curr, end: token.start, className: baseClassName });
    }
    runs.push({ offset: token.start, end: token.end, className: token.className });
    curr = token.end;
  }
  if (curr < lineEnd) {
    runs.push({ offset: curr, end: lineEnd, className: baseClassName });
  }
}

/**
 * Computes comprehensive highlight runs when input is Markdown.
 * Highlights:
 * - Question header + Question body in ONE pastel color (sky)
 * - Answer header + Answer body in ONE pastel color (emerald)
 * - Any custom field header + body in its respective pastel color (amber, purple, rose, teal, orange, etc.)
 * - Card separators in distinct subtle pastel slate
 * - Inline LaTeX / Code in distinct readable syntax badges
 */
export function computeMarkdownHighlights(
  text: string,
  markerPatterns: MarkerPattern[] = [],
): HighlightRun[] {
  if (!text) return [];

  // 1. Break text into lines with precise index tracking
  const lines: LineInfo[] = [];
  let idx = 0;
  const lineRegex = /\r?\n/g;
  let match: RegExpExecArray | null;

  while ((match = lineRegex.exec(text)) !== null) {
    lines.push({
      start: idx,
      end: match.index,
      text: text.slice(idx, match.index),
    });
    idx = match.index + match[0].length;
  }
  if (idx < text.length) {
    lines.push({
      start: idx,
      end: text.length,
      text: text.slice(idx),
    });
  }

  const runs: HighlightRun[] = [];
  const customMap = new Map<string, FieldPalette>();

  type ActiveField =
    | { type: "question" }
    | { type: "answer" }
    | { type: "custom"; palette: FieldPalette }
    | null;

  let activeField: ActiveField = null;

  for (const line of lines) {
    const trimmed = line.text.trim();

    // Empty lines are whitespace breaks between fields / cards (transparent)
    if (trimmed === "") {
      continue;
    }

    // 1. Check Card Separator
    const isHr = HR_SEPARATOR_REGEX.test(trimmed);
    const isCardHeading = HEADING_CARD_REGEX.test(trimmed);
    const isCardBold = BOLD_CARD_REGEX.test(trimmed);
    const matchesCustomSeparator = markerPatterns.some(
      (p) => p.className.includes("separator") && p.regex.test(trimmed),
    );

    if (isHr || isCardHeading || isCardBold || matchesCustomSeparator) {
      activeField = null;
      runs.push({
        offset: line.start,
        end: line.end,
        className: PASTEL_PALETTES.separator.header,
      });
      continue;
    }

    // 2. Check Question Header
    const isQuestionPrefix = QUESTION_MARKER_PREFIX_REGEX.exec(line.text);
    const isQuestionHeading = HEADING_QUESTION_REGEX.test(trimmed);
    const matchesCustomQuestion = markerPatterns.some(
      (p) => p.className.includes("question") && p.regex.test(trimmed),
    );

    if (isQuestionPrefix || isQuestionHeading || matchesCustomQuestion) {
      activeField = { type: "question" };
      const palette = PASTEL_PALETTES.question;
      const inlineTokens = findLineInlineTokens(line.text, line.start);

      if (isQuestionPrefix) {
        const markerLength = isQuestionPrefix[0].length;
        const markerEnd = line.start + markerLength;
        // Header marker
        runs.push({ offset: line.start, end: markerEnd, className: palette.header });
        // Body portion on same line
        if (markerEnd < line.end) {
          const inlineOnRest = inlineTokens.filter((t) => t.start >= markerEnd);
          addLineRuns(runs, markerEnd, line.end, palette.body, inlineOnRest);
        }
      } else {
        // Entire line is question header
        addLineRuns(runs, line.start, line.end, palette.header, inlineTokens);
      }
      continue;
    }

    // 3. Check Answer Header
    const isAnswerPrefix = ANSWER_MARKER_PREFIX_REGEX.exec(line.text);
    const isAnswerHeading = HEADING_ANSWER_REGEX.test(trimmed);
    const matchesCustomAnswer = markerPatterns.some(
      (p) => p.className.includes("answer") && p.regex.test(trimmed),
    );

    if (isAnswerPrefix || isAnswerHeading || matchesCustomAnswer) {
      activeField = { type: "answer" };
      const palette = PASTEL_PALETTES.answer;
      const inlineTokens = findLineInlineTokens(line.text, line.start);

      if (isAnswerPrefix) {
        const markerLength = isAnswerPrefix[0].length;
        const markerEnd = line.start + markerLength;
        // Header marker
        runs.push({ offset: line.start, end: markerEnd, className: palette.header });
        // Body portion on same line
        if (markerEnd < line.end) {
          const inlineOnRest = inlineTokens.filter((t) => t.start >= markerEnd);
          addLineRuns(runs, markerEnd, line.end, palette.body, inlineOnRest);
        }
      } else {
        // Entire line is answer header
        addLineRuns(runs, line.start, line.end, palette.header, inlineTokens);
      }
      continue;
    }

    // 4. Check Custom Field Header
    const headingMatch = HEADING_CUSTOM_REGEX.exec(trimmed);
    const kvCustomMatch = KV_CUSTOM_PREFIX_REGEX.exec(line.text);

    if (headingMatch && !NON_FIELD_HEADINGS.test(cleanTitle(headingMatch[1]))) {
      const fieldName = cleanTitle(headingMatch[1]);
      const palette = getCustomFieldPalette(fieldName, customMap);
      activeField = { type: "custom", palette };
      const inlineTokens = findLineInlineTokens(line.text, line.start);
      addLineRuns(runs, line.start, line.end, palette.header, inlineTokens);
      continue;
    }

    if (kvCustomMatch && !NON_FIELD_HEADINGS.test(cleanTitle(kvCustomMatch[1]))) {
      const fieldName = cleanTitle(kvCustomMatch[1]);
      const palette = getCustomFieldPalette(fieldName, customMap);
      activeField = { type: "custom", palette };
      const inlineTokens = findLineInlineTokens(line.text, line.start);

      const markerLength = kvCustomMatch[0].length;
      const markerEnd = line.start + markerLength;

      runs.push({ offset: line.start, end: markerEnd, className: palette.header });
      if (markerEnd < line.end) {
        const inlineOnRest = inlineTokens.filter((t) => t.start >= markerEnd);
        addLineRuns(runs, markerEnd, line.end, palette.body, inlineOnRest);
      }
      continue;
    }

    // 5. Body lines belonging to currently active field
    const inlineTokens = findLineInlineTokens(line.text, line.start);
    if (activeField) {
      if (activeField.type === "question") {
        addLineRuns(runs, line.start, line.end, PASTEL_PALETTES.question.body, inlineTokens);
      } else if (activeField.type === "answer") {
        addLineRuns(runs, line.start, line.end, PASTEL_PALETTES.answer.body, inlineTokens);
      } else if (activeField.type === "custom") {
        addLineRuns(runs, line.start, line.end, activeField.palette.body, inlineTokens);
      }
    } else {
      // Preamble or unsegmented lines before any card/field
      if (inlineTokens.length > 0) {
        for (const token of inlineTokens) {
          runs.push({ offset: token.start, end: token.end, className: token.className });
        }
      }
    }
  }

  // Sort runs by offset
  runs.sort((a, b) => a.offset - b.offset || b.end - a.end);

  // Eliminate any duplicate or overlapping spans
  const merged: HighlightRun[] = [];
  let lastEnd = 0;
  for (const r of runs) {
    if (r.offset >= lastEnd && r.end > r.offset) {
      merged.push(r);
      lastEnd = r.end;
    }
  }

  return merged;
}
