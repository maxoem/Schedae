import type {
  LlmDeckInput,
  LlmMarkdownField,
  LlmMarkdownFieldSelection,
  LlmMarkdownParseResult,
  LlmMarkdownUpdate,
  LlmMergeCapability,
  LlmMergeResult,
  LlmMergeStats,
  LlmMergeSupportedOperation,
  LlmNoteInput,
  LlmRawDeckPayload,
} from "./types";

const FIELD_SEPARATOR = "\x1f";
const CARD_DELIMITER = "---";

/**
 * Returns true if at least one LLM-Markdown field is selected for export.
 */
export function hasAnyLlmFieldSelected(selection: LlmMarkdownFieldSelection): boolean {
  return selection.id || selection.question || selection.answer;
}

/**
 * Evaluates whether exported LLM-Markdown can be merged back into the original APKG dataset,
 * distinguishing full merge, partial merge, and impossible merge states.
 */
export function evaluateLlmMergeCapability(
  selection: LlmMarkdownFieldSelection,
): LlmMergeCapability {
  const missingFields: LlmMarkdownField[] = [];
  if (!selection.id) missingFields.push("id");
  if (!selection.question) missingFields.push("question");
  if (!selection.answer) missingFields.push("answer");

  if (!selection.id) {
    const noneSelected = !selection.question && !selection.answer;
    return {
      status: "impossible",
      canMerge: false,
      canOpenMergeAssistant: false,
      title: noneSelected ? "No Fields Selected" : "Merge Not Possible",
      message: noneSelected
        ? "Select at least one field (ID, Question, or Answer) to generate Markdown. Merging back requires Card IDs."
        : "Card ID (### ID) is deselected. Without Note IDs, edited cards cannot be matched back to your .apkg.",
      missingFields,
      supportedOperations: [],
    };
  }

  if (!selection.question && !selection.answer) {
    return {
      status: "impossible",
      canMerge: false,
      canOpenMergeAssistant: false,
      title: "Merge Not Possible for Card Content",
      message:
        "Both Question (Q:) and Answer (A:) are deselected. Re-enable at least one content field to merge edits back.",
      missingFields,
      supportedOperations: ["delete"],
    };
  }

  if (selection.question && selection.answer) {
    return {
      status: "full",
      canMerge: true,
      canOpenMergeAssistant: true,
      title: "Full Merge Supported",
      message: "Card IDs, Questions (Q:), and Answers (A:) are included for lossless round-trip merge.",
      missingFields,
      supportedOperations: ["question", "answer", "delete"],
    };
  }

  const supportedOperations: LlmMergeSupportedOperation[] = [
    selection.question ? "question" : "answer",
    "delete",
  ];

  const missingLabel = selection.question ? "Answer (A:)" : "Question (Q:)";
  const includedLabel = selection.question ? "Question (Q:)" : "Answer (A:)";
  const preservedLabel = selection.question ? "Answers" : "Questions";

  return {
    status: "partial",
    canMerge: true,
    canOpenMergeAssistant: true,
    title: "Merge Only Partly Possible",
    message: `${missingLabel} is deselected. Merge Assistant can still update ${includedLabel} and apply [DELETE] via Card ID; original ${preservedLabel} in your .apkg remain unchanged.`,
    missingFields,
    supportedOperations,
  };
}

/**
 * Builds the LLM-Markdown guide comment header matching the active field selection.
 */
export function buildLlmFormatGuideComment(selection: LlmMarkdownFieldSelection): string {
  const formatLines: string[] = [];
  const exampleLines: string[] = [];

  if (selection.id) {
    formatLines.push("# ### <CardId> oder ### <DeckId>:<CardId>");
    exampleLines.push("# ### 12345");
  }
  if (selection.question) {
    formatLines.push("# Q: <Frage/Prompt>");
    exampleLines.push("# Q: Neue Frage?");
  }
  if (selection.answer) {
    formatLines.push("# A: <Antwort>");
    exampleLines.push("# A: Neue Antwort");
  }
  formatLines.push(`# ${CARD_DELIMITER}`);
  exampleLines.push(`# ${CARD_DELIMITER}`);

  const lines: string[] = [
    "# LLM-Markdown Format Guide",
    "# ===========================",
    "# Bearbeite die Karten unten nach Bedarf. Format:",
    ...formatLines,
    "#",
    "# Spezialoptionen:",
  ];

  if (selection.id) {
    lines.push("# - [DELETE] statt Q/A zum Löschen einer Karte");
    lines.push("# - Alle anderen / nicht exportierten Felder bleiben beim Merge unverändert");
    lines.push("# - Stelle sicher, dass die Card IDs identisch bleiben");
    lines.push("#");
    lines.push("# Beispiel - Karte bearbeiten:");
    lines.push(...exampleLines);
    lines.push("#");
    lines.push("# Beispiel - Karte löschen:");
    lines.push("# ### 12346");
    lines.push("# [DELETE]");
    lines.push(`# ${CARD_DELIMITER}`);
  } else {
    lines.push("# - Hinweis: Card IDs wurden abgewählt (kein automatischer Merge zurück ins .apkg möglich)");
    lines.push("#");
    lines.push("# Beispiel:");
    lines.push(...exampleLines);
  }

  return lines.join("\n");
}

function resolveNoteId(note: LlmNoteInput): string {
  if (note.id === undefined || note.id === null || note.id === "") {
    return "unknown";
  }
  return String(note.id);
}

/**
 * Formats a single Anki note into an LLM-Markdown card block according to selected fields.
 */
export function formatNoteToLlmMarkdown(
  note: LlmNoteInput,
  selection: LlmMarkdownFieldSelection,
  deckId?: string | number,
): string {
  if (!hasAnyLlmFieldSelected(selection)) {
    return "";
  }

  const lines: string[] = [];
  if (selection.id) {
    const noteId = resolveNoteId(note);
    const header = deckId !== undefined && deckId !== null && deckId !== ""
      ? `### ${deckId}:${noteId}`
      : `### ${noteId}`;
    lines.push(header);
  }

  if (selection.question) {
    lines.push(`Q: ${note.front ?? ""}`);
  }

  if (selection.answer) {
    lines.push(`A: ${note.back ?? ""}`);
  }

  lines.push(CARD_DELIMITER);
  return lines.join("\n");
}

/**
 * Converts a reduced APKG payload (flat notes or hierarchical deck tree) into LLM-Markdown.
 */
export function exportDeckToLlmMarkdown(
  rawDeckPayload: LlmRawDeckPayload | null | undefined,
  selection: LlmMarkdownFieldSelection,
  options: { includeGuideComment?: boolean } = {},
): string {
  if (!rawDeckPayload || !hasAnyLlmFieldSelected(selection)) {
    return "";
  }

  const includeGuideComment = options.includeGuideComment ?? true;
  const blocks: string[] = [];

  if (Array.isArray(rawDeckPayload.notes)) {
    for (const note of rawDeckPayload.notes) {
      const formatted = formatNoteToLlmMarkdown(note, selection);
      if (formatted) blocks.push(formatted);
    }
  } else if (rawDeckPayload.decks?.byId && typeof rawDeckPayload.decks.byId === "object") {
    for (const deckId of Object.keys(rawDeckPayload.decks.byId)) {
      const deck: LlmDeckInput | undefined = rawDeckPayload.decks.byId[deckId];
      if (!deck || !Array.isArray(deck.notes)) continue;
      for (const note of deck.notes) {
        const formatted = formatNoteToLlmMarkdown(note, selection, deckId);
        if (formatted) blocks.push(formatted);
      }
    }
  }

  const body = blocks.join("\n\n").trim();
  if (!includeGuideComment) {
    return body;
  }

  const guide = buildLlmFormatGuideComment(selection);
  return body ? `${guide}\n\n${body}` : guide;
}

/**
 * Splits LLM-Markdown by card boundaries into chunks within the target token budget.
 */
export function chunkLlmMarkdownByTokens(
  markdown: string,
  maxTokensPerChunk: number,
): string[] {
  const cardBlocks = markdown
    .split(/\n---\s*(?:\n|$)/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `${block}\n${CARD_DELIMITER}`);

  const chunks: string[] = [];
  let currentChunk = "";
  let currentTokens = 0;

  for (const block of cardBlocks) {
    const blockTokens = Math.ceil(block.length / 4);
    if (currentTokens + blockTokens > maxTokensPerChunk && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = block;
      currentTokens = blockTokens;
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + block;
      currentTokens += blockTokens;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.length > 0 ? chunks : [markdown];
}

function parseCardBodyFields(body: string): { front?: string; back?: string } | null {
  const qMatch = body.match(/(?:^|\n)Q:[ \t]*/);
  const aMatch = body.match(/(?:^|\n)A:[ \t]*/);

  if (!qMatch && !aMatch) {
    return null;
  }

  if (qMatch && aMatch) {
    const qMarkerStart = qMatch.index!;
    const qContentStart = qMarkerStart + qMatch[0].length;
    const aMarkerStart = aMatch.index!;
    const aContentStart = aMarkerStart + aMatch[0].length;

    if (qMarkerStart < aMarkerStart) {
      return {
        front: body.slice(qContentStart, aMarkerStart).trim(),
        back: body.slice(aContentStart).trim(),
      };
    }

    return {
      back: body.slice(aContentStart, qMarkerStart).trim(),
      front: body.slice(qContentStart).trim(),
    };
  }

  if (qMatch) {
    const qContentStart = qMatch.index! + qMatch[0].length;
    return { front: body.slice(qContentStart).trim() };
  }

  const aContentStart = aMatch!.index! + aMatch![0].length;
  return { back: body.slice(aContentStart).trim() };
}

function isCommentOnlyBlock(block: string): boolean {
  const nonEmptyLines = block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    nonEmptyLines.length > 0 &&
    nonEmptyLines.every((line) => line.startsWith("#") && !/^###\s+/.test(line))
  );
}

/**
 * Parses LLM-Markdown card blocks into a map of note ID -> update/delete operations.
 * Supports full (Q: + A:), partial (Q:-only or A:-only), and [DELETE] blocks.
 */
export function parseLlmMarkdownUpdates(markdown: string): LlmMarkdownParseResult {
  const rawBlocks = markdown
    .split(/^\s*---\s*$/m)
    .map((block) => block.trim())
    .filter(Boolean);

  const updates = new Map<string, LlmMarkdownUpdate>();
  let blocksTotal = 0;
  let blocksMissingId = 0;
  let blocksInvalid = 0;

  for (const block of rawBlocks) {
    if (isCommentOnlyBlock(block)) {
      continue;
    }

    blocksTotal += 1;
    const lines = block.split("\n");
    const headerIndex = lines.findIndex((line) => /^###\s+/.test(line.trim()));

    if (headerIndex === -1) {
      blocksMissingId += 1;
      continue;
    }

    const headerLine = lines[headerIndex].trim();
    const idMatch = headerLine.match(/^###\s*(?:[^:\s]+:)?([^\s]+)/);
    const noteId = idMatch ? idMatch[1] : null;

    if (!noteId || noteId === "unknown") {
      blocksMissingId += 1;
      continue;
    }

    const body = lines.slice(headerIndex + 1).join("\n");
    if (body.includes("[DELETE]")) {
      updates.set(noteId, { action: "delete" });
      continue;
    }

    const parsedFields = parseCardBodyFields(body);
    if (!parsedFields) {
      blocksInvalid += 1;
      continue;
    }

    updates.set(noteId, {
      action: "update",
      ...(parsedFields.front !== undefined ? { front: parsedFields.front } : {}),
      ...(parsedFields.back !== undefined ? { back: parsedFields.back } : {}),
    });
  }

  return {
    updates,
    blocksTotal,
    blocksMissingId,
    blocksInvalid,
  };
}

function applyNoteUpdate(note: LlmNoteInput, update: LlmMarkdownUpdate): LlmNoteInput {
  const updatedNote: LlmNoteInput = { ...note };

  if (update.front !== undefined) {
    updatedNote.front = update.front;
  }
  if (update.back !== undefined) {
    updatedNote.back = update.back;
  }

  if (typeof updatedNote.flds === "string") {
    const parts = updatedNote.flds.split(FIELD_SEPARATOR);
    if (update.front !== undefined) parts[0] = update.front;
    if (update.back !== undefined) parts[1] = update.back;
    updatedNote.flds = parts.join(FIELD_SEPARATOR);
  }

  return updatedNote;
}

/**
 * Merges parsed LLM-Markdown updates back into a cloned APKG JSON payload,
 * preserving any fields not included in the Markdown (supporting partial merge).
 */
export function mergeLlmMarkdownIntoDeck<T extends LlmRawDeckPayload>(
  originalJson: T,
  markdown: string,
): LlmMergeResult<T> {
  const parsed = parseLlmMarkdownUpdates(markdown);
  const merged = JSON.parse(JSON.stringify(originalJson)) as T;

  let updated = 0;
  let partialUpdated = 0;
  let deleted = 0;
  let unmodified = 0;

  const processNotesArray = (notesArray: LlmNoteInput[]): LlmNoteInput[] => {
    const result: LlmNoteInput[] = [];

    for (const note of notesArray) {
      const noteId = String(note.id);
      const update = parsed.updates.get(noteId);

      if (!update) {
        unmodified += 1;
        result.push(note);
        continue;
      }

      if (update.action === "delete") {
        deleted += 1;
        continue;
      }

      updated += 1;
      if (update.front === undefined || update.back === undefined) {
        partialUpdated += 1;
      }
      result.push(applyNoteUpdate(note, update));
    }

    return result;
  };

  if (Array.isArray(merged.notes)) {
    merged.notes = processNotesArray(merged.notes);
  } else if (merged.decks?.byId && typeof merged.decks.byId === "object") {
    for (const deckId of Object.keys(merged.decks.byId)) {
      const deck = merged.decks.byId[deckId];
      if (deck && Array.isArray(deck.notes)) {
        deck.notes = processNotesArray(deck.notes);
      }
    }
  }

  const stats: LlmMergeStats = {
    updated,
    partialUpdated,
    deleted,
    unmodified,
    blocksMissingId: parsed.blocksMissingId,
  };

  return { mergedJson: merged, stats };
}
