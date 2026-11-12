import JSZip from "jszip";
import type { FlashCard } from "./types";
import { CARD_TEMPLATES, type CardTemplateId } from "./templates";
import {
  formatMathForTarget,
  type ExportMathFormat,
  type MathFormatMode,
} from "@/utils/mathUtils";

export type { ExportMathFormat, MathFormatMode };

const APKG_SCHEMA = `
CREATE TABLE col (
    id              integer primary key,
    crt             integer not null,
    mod             integer not null,
    scm             integer not null,
    ver             integer not null,
    dty             integer not null,
    usn             integer not null,
    ls              integer not null,
    conf            text not null,
    models          text not null,
    decks           text not null,
    dconf           text not null,
    tags            text not null
);
CREATE TABLE notes (
    id              integer primary key,
    guid            text not null,
    mid             integer not null,
    mod             integer not null,
    usn             integer not null,
    tags            text not null,
    flds            text not null,
    sfld            integer not null,
    csum            integer not null,
    flags           integer not null,
    data            text not null
);
CREATE TABLE cards (
    id              integer primary key,
    nid             integer not null,
    did             integer not null,
    ord             integer not null,
    mod             integer not null,
    usn             integer not null,
    type            integer not null,
    queue           integer not null,
    due             integer not null,
    ivl             integer not null,
    factor          integer not null,
    reps            integer not null,
    lapses          integer not null,
    left            integer not null,
    odue            integer not null,
    odid            integer not null,
    flags           integer not null,
    data            text not null
);
CREATE TABLE revlog (
    id              integer primary key,
    cid             integer not null,
    usn             integer not null,
    ease            integer not null,
    ivl             integer not null,
    lastIvl         integer not null,
    factor          integer not null,
    time            integer not null,
    type            integer not null
);
CREATE TABLE graves (
    usn             integer not null,
    oid             integer not null,
    type            integer not null
);
CREATE INDEX ix_notes_usn on notes (usn);
CREATE INDEX ix_cards_usn on cards (usn);
CREATE INDEX ix_revlog_usn on revlog (usn);
CREATE INDEX ix_cards_nid on cards (nid);
CREATE INDEX ix_cards_sched on cards (did, queue, due);
CREATE INDEX ix_revlog_cid on revlog (cid);
CREATE INDEX ix_notes_csum on notes (csum);
`;

const APKG_COL = `
INSERT INTO col VALUES(
    1,
    1411124400,
    1425279151694,
    1425279151690,
    11,
    0,
    0,
    0,
    '{
        "activeDecks": [
            1
        ],
        "addToCur": true,
        "collapseTime": 1200,
        "curDeck": 1,
        "curModel": "1425279151691",
        "dueCounts": true,
        "estTimes": true,
        "newBury": true,
        "newSpread": 0,
        "nextPos": 1,
        "sortBackwards": false,
        "sortType": "noteFld",
        "timeLim": 0
    }',
    '{}',
    '{
        "1": {
            "collapsed": false,
            "conf": 1,
            "desc": "",
            "dyn": 0,
            "extendNew": 10,
            "extendRev": 50,
            "id": 1,
            "lrnToday": [
                0,
                0
            ],
            "mod": 1425279151,
            "name": "Default",
            "newToday": [
                0,
                0
            ],
            "revToday": [
                0,
                0
            ],
            "timeToday": [
                0,
                0
            ],
            "usn": 0
        }
    }',
    '{
        "1": {
            "autoplay": true,
            "id": 1,
            "lapse": {
                "delays": [
                    10
                ],
                "leechAction": 0,
                "leechFails": 8,
                "minInt": 1,
                "mult": 0
            },
            "maxTaken": 60,
            "mod": 0,
            "name": "Default",
            "new": {
                "bury": true,
                "delays": [
                    1,
                    10
                ],
                "initialFactor": 2500,
                "ints": [
                    1,
                    4,
                    7
                ],
                "order": 1,
                "perDay": 20,
                "separate": true
            },
            "replayq": true,
            "rev": {
                "bury": true,
                "ease4": 1.3,
                "fuzz": 0.05,
                "ivlFct": 1,
                "maxIvl": 36500,
                "minSpace": 1,
                "perDay": 100
            },
            "timer": 0,
            "usn": 0
        }
    }',
    '{}'
);
`;

function generateGuid() {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function toFiniteNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export type NoteTypeMode = "unified" | "per_schema";

export interface CreateApkgModelOptions {
  /**
   * Controls how fields and Note Type schemas are structured in the exported .apkg:
   * - "unified" (default): Always includes [Front, Back, Topic] on the base Note Type
   *   with a deterministic model ID so plain decks and topic-badge decks share and
   *   update one Note Type in Anki. Extra custom fields beyond Topic get their own
   *   deterministic variant.
   * - "per_schema": Only includes fields actually present on the exported cards,
   *   giving each unique field set its own deterministic model ID and descriptive name.
   */
  noteTypeMode?: NoteTypeMode;
  /** Optional custom base Note Type name overriding the selected template's default name. */
  customNoteTypeName?: string;
}

export interface ResolvedApkgModelConfig {
  modelId: number;
  noteTypeName: string;
  cardTypeName: string;
  customFieldNames: string[];
  fieldNames: string[];
}

/**
 * Computes a stable, positive 13-digit model ID from a schema key so repeated exports
 * of the same template and field schema reuse/update the same Note Type in Anki.
 */
export function computeDeterministicModelId(schemaKey: string): number {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < schemaKey.length; i++) {
    const code = schemaKey.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= code + i;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  const hi = (h1 >>> 0) % 8_000_000;
  const lo = (h2 >>> 0) % 1_000_000;
  return 1_000_000_000_000 + hi * 1_000_000 + lo;
}

function resolveNoteTypeNames(
  templateId: CardTemplateId,
  customFieldNames: string[],
  noteTypeMode: NoteTypeMode,
  customNoteTypeName?: string,
): { noteTypeName: string; cardTypeName: string; template: (typeof CARD_TEMPLATES)[CardTemplateId] } {
  const template = CARD_TEMPLATES[templateId] || CARD_TEMPLATES.default;
  const baseName = customNoteTypeName?.trim() || template.noteTypeName;
  const cardTypeName = template.cardTypeName;

  if (noteTypeMode === "unified") {
    const extraFields = customFieldNames.filter((n) => n.toLowerCase() !== "topic");
    const noteTypeName = extraFields.length === 0 ? baseName : `${baseName} (+${extraFields.join(", ")})`;
    return { noteTypeName, cardTypeName, template };
  }

  const noteTypeName = customFieldNames.length === 0 ? baseName : `${baseName} (${customFieldNames.join(", ")})`;
  return { noteTypeName, cardTypeName, template };
}

/**
 * Resolves the deterministic Anki model ID, Note Type name, Card Type name, and ordered
 * field names for a set of cards and template configuration.
 */
export function resolveApkgModelConfig(
  cards: FlashCard[],
  templateId: CardTemplateId = "default",
  options?: CreateApkgModelOptions,
): ResolvedApkgModelConfig {
  const mode: NoteTypeMode = options?.noteTypeMode ?? "unified";

  let topicFieldName: string | null = null;
  const extraFields: string[] = [];
  const seenLower = new Set<string>();

  for (const card of cards) {
    if (!card.customFields) continue;
    for (const rawKey of Object.keys(card.customFields)) {
      const key = rawKey.trim();
      if (!key) continue;
      const lower = key.toLowerCase();
      if (lower === "front" || lower === "back" || seenLower.has(lower)) continue;
      seenLower.add(lower);
      if (lower === "topic") {
        topicFieldName = key;
      } else {
        extraFields.push(key);
      }
    }
  }

  extraFields.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  const customFieldNames: string[] = [];
  if (mode === "unified") {
    customFieldNames.push(topicFieldName ?? "Topic");
  } else if (topicFieldName) {
    customFieldNames.push(topicFieldName);
  }
  customFieldNames.push(...extraFields);

  const fieldNames = ["Front", "Back", ...customFieldNames];
  const { noteTypeName, cardTypeName, template } = resolveNoteTypeNames(
    templateId,
    customFieldNames,
    mode,
    options?.customNoteTypeName,
  );
  const schemaKey = `schedae:v1:${template.id}:${noteTypeName}:${fieldNames.join("\x1f")}`;
  const modelId = computeDeterministicModelId(schemaKey);

  return {
    modelId,
    noteTypeName,
    cardTypeName,
    customFieldNames,
    fieldNames,
  };
}

function getCustomFieldValue(customFields: Record<string, string> | undefined, fieldName: string): string {
  if (!customFields) return "";
  if (fieldName in customFields) return customFields[fieldName] || "";
  const lower = fieldName.toLowerCase();
  for (const [k, v] of Object.entries(customFields)) {
    if (k.trim().toLowerCase() === lower) return v || "";
  }
  return "";
}

function buildTemplateQfmtAfmt(
  templateId: CardTemplateId,
  frontFieldName: string,
  backFieldName: string,
  customFieldNames: string[],
): { qfmt: string; afmt: string } {
  const selectedTemplate = CARD_TEMPLATES[templateId] || CARD_TEMPLATES.default;

  let afmt = selectedTemplate.afmt.replaceAll("{{Back}}", `{{${backFieldName}}}`);
  for (const name of customFieldNames) {
    // Topic is elevated to a first-class badge on the front, not rendered as generic back footer
    if (name.toLowerCase() === "topic") continue;

    const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, "-");
    if (templateId === "markdown_basic") {
      afmt += `\n{{#${name}}}<div class="custom-field custom-field-${safeName}"><hr><b>${name}:</b><div class="md-custom-field md-field"><pre>{{${name}}}</pre></div></div>{{/${name}}}`;
    } else {
      afmt += `\n{{#${name}}}<div class="custom-field custom-field-${safeName}"><hr><b>${name}:</b><br>{{${name}}}</div>{{/${name}}}`;
    }
  }

  let qfmt = selectedTemplate.qfmt.replaceAll("{{Front}}", `{{${frontFieldName}}}`);
  const topicFieldName = customFieldNames.find((n) => n.toLowerCase() === "topic");
  if (topicFieldName) {
    qfmt = `{{#${topicFieldName}}}<div class="card-topic-badge">{{${topicFieldName}}}</div>{{/${topicFieldName}}}\n` + qfmt;
  }

  return { qfmt, afmt };
}

function buildModelFromFields(
  modelId: number,
  deckId: number,
  fieldNames: string[],
  templateCount: number,
  timestamp: number,
  templateId: CardTemplateId,
  modelNameOverride?: string,
  sourceTemplates?: Array<{ name?: string; qfmt?: string; afmt?: string; ord?: number }>,
  sourceCss?: string,
) {
  const selectedTemplate = CARD_TEMPLATES[templateId] || CARD_TEMPLATES.default;
  const normalizedFields = fieldNames.length >= 2
    ? fieldNames
    : [fieldNames[0] || "Front", fieldNames[1] || "Back"];
  const safeTemplateCount = Math.max(1, templateCount, sourceTemplates?.length ?? 0);
  const { qfmt: defaultQfmt, afmt: defaultAfmt } = buildTemplateQfmtAfmt(
    templateId,
    normalizedFields[0],
    normalizedFields[1],
    normalizedFields.slice(2),
  );

  const flds = normalizedFields.map((name, idx) => ({
    name,
    ord: idx,
    font: "Arial",
    media: [],
    rtl: false,
    size: idx < 2 ? 20 : 16,
    sticky: false,
  }));

  const tmpls = Array.from({ length: safeTemplateCount }, (_, idx) => {
    const src = sourceTemplates?.[idx];
    return {
      name: idx === 0
        ? (templateId !== "default" ? selectedTemplate.cardTypeName : (src?.name || `Card ${idx + 1}`))
        : (src?.name || `Card ${idx + 1}`),
      qfmt: src?.qfmt || defaultQfmt,
      afmt: src?.afmt || defaultAfmt,
      bafmt: "",
      bqfmt: "",
      bfont: "",
      bsize: 0,
      did: null,
      ord: idx,
    };
  });

  const fallbackCustom = normalizedFields.slice(2);
  const { noteTypeName } = resolveNoteTypeNames(templateId, fallbackCustom, "per_schema");

  return {
    css: sourceCss && templateId === "default" ? sourceCss : selectedTemplate.css,
    did: deckId,
    flds,
    id: String(modelId),
    latexPost: "\\\\end{document}",
    latexPre:
      "\\\\documentclass[12pt]{article}\\special{papersize=3in,5in}\\\\usepackage[utf8]{inputenc}\\\\usepackage{amssymb,amsmath}\\\\pagestyle{empty}\\\\setlength{\\\\parindent}{0in}\\\\begin{document}",
    latexsvg: false,
    mod: timestamp,
    name: modelNameOverride || noteTypeName,
    req: [[0, "all", [0]]],
    sortf: 0,
    tags: [],
    tmpls,
    type: 0,
    usn: -1,
    vers: [],
  };
}

function buildModelFromFieldCount(
  modelId: number,
  deckId: number,
  fieldCount: number,
  templateCount: number,
  timestamp: number,
  templateId: CardTemplateId,
  modelNameOverride?: string,
) {
  const safeFieldCount = Math.max(2, fieldCount);
  const fieldNames = Array.from({ length: safeFieldCount }, (_, idx) =>
    idx === 0 ? "Front" : idx === 1 ? "Back" : `Field ${idx + 1}`,
  );
  return buildModelFromFields(
    modelId,
    deckId,
    fieldNames,
    templateCount,
    timestamp,
    templateId,
    modelNameOverride,
  );
}

export interface CreateApkgExportOptions extends CreateApkgModelOptions {
  /**
   * Target math delimiter format for exported Anki note fields:
   * - "katex" (default): Normalizes math syntax (`\(...\)`, `\[...\]`, `<anki-mathjax>`, etc.)
   *   into plain `$...$` and `$$...$$` for KaTeX templates without triggering Anki MathJax conversion.
   * - "anki_mathjax": Opt-in conversion of math into clean native Anki MathJax (`\(...\)` and `\[...\]`).
   */
  mathFormat?: ExportMathFormat;
}

export interface FormatMarkdownForAnkiOptions {
  /**
   * Target math delimiter format for Anki note fields (default: "katex").
   * Pass "preserve" to leave existing math delimiters unchanged.
   */
  mathFormat?: MathFormatMode;
}

/**
 * Formats and normalizes markdown content for storage in Anki note fields (flds).
 * Ensures that:
 * 1. Line endings are normalized and trailing whitespace on lines is stripped.
 * 2. Raw HTML <br> tags are normalized to standard newlines before formatting.
 * 3. Math expressions are formatted for the target renderer ("katex" by default, or opt-in "anki_mathjax").
 * 4. Accidental single-space indentations before top-level list markers (*, -, +, 1.)
 *    are removed so Markdown-it does not misclassify them as nested sub-bullets.
 * 5. Paragraph and list newlines are converted to <br> for Anki editor compatibility,
 *    without corrupting multi-line math blocks or code blocks.
 */
export function formatMarkdownForAnki(
  content: string,
  options?: FormatMarkdownForAnkiOptions,
): string {
  if (!content) return "";
  const mathFormat: MathFormatMode = options?.mathFormat ?? "katex";
  let str = content;

  // 1. Normalize line endings
  str = str.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // 2. Strip trailing whitespace from each line
  str = str.replace(/[ \t]+$/gm, "");

  // 3. Clean up existing raw <br> tags in markdown to standard newlines
  str = str.replace(/<br\s*[\/]?[^>]*>/gi, "\n");

  // 4. Repair escaped environment asterisks (e.g. \begin{align\*} -> \begin{align*})
  str = str.replace(/\\begin\{([a-zA-Z]+)\\\*\}/gi, "\\begin{$1*}");
  str = str.replace(/\\end\{([a-zA-Z]+)\\\*\}/gi, "\\end{$1*}");

  // 5. Normalize or convert math expressions according to the target export format
  str = formatMathForTarget(str, mathFormat);

  // Protect math formulas and code blocks so that internal newlines in LaTeX matrices,
  // bracketed display math, or aligned equations are never corrupted with <br> or backslash removals
  const placeholders: string[] = [];
  const protect = (match: string) => {
    const idx = placeholders.length;
    placeholders.push(match);
    return `XPROTECTEDCHUNK${idx}X`;
  };

  // Step A: Protect existing delimited blocks, inline code, and fenced code blocks
  str = str.replace(/```[\s\S]*?```/g, protect);
  str = str.replace(/`[^`\n]+`/g, protect);
  str = str.replace(/\$\$[\s\S]*?\$\$/g, protect);
  str = str.replace(/\\{1,2}\[[\s\S]*?\\{1,2}\]/g, protect);
  str = str.replace(/\\{1,2}\([^\n]*?\\{1,2}\)/g, protect);
  str = str.replace(/\\?<anki-mathjax[^>]*>[\s\S]*?\\?<\/anki-mathjax>/gi, protect);
  str = str.replace(/\$[^$\n]+?\$/g, protect);

  // Step B: Wrap any remaining bare LaTeX display environments (only reachable in "preserve" mode).
  const BARE_ENV_REGEX =
    /\\begin\{(align\*?|alignat\*?|equation\*?|gather\*?|multline\*?|flalign\*?|split|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|matrix|cases|dcases|rcases|drcases|aligned|alignedat\*?|gathered|array|CD)\}([\s\S]*?)\\end\{\1\}/gi;

  str = str.replace(BARE_ENV_REGEX, (match) => {
    const trimmed = match.trim();
    return protect(
      mathFormat === "anki_mathjax" ? `\\[\n${trimmed}\n\\]` : `$$\n${trimmed}\n$$`,
    );
  });

  // Step C: Protect any remaining generic \begin{...}...\end{...} environments so their contents are preserved
  str = str.replace(/\\begin\{([a-zA-Z*]+)\}[\s\S]*?\\end\{\1\}/gi, protect);

  // 6. Clean up stray backslash lines and trailing backslashes outside math
  str = str.replace(/(^|\n)\s*\\+\s*(?=\n|$)/g, "$1");
  str = str.replace(/([^\\])\\+[ \t]*(?=\n|$)/g, "$1");

  // 7. Normalize accidental single-space indentation before list markers (leaves 2+ spaces / tabs intact)
  str = str.replace(/(^|\n) ([*+-]|\d+\.) /g, "$1$2 ");

  // 8. Normalize multiple blank lines to clean double newlines and trim outer blank lines
  str = str.replace(/\n{3,}/g, "\n\n");
  str = str.replace(/^\n+|\n+$/g, "");

  // 9. Convert newlines to Anki HTML breaks (<br>)
  str = str.replace(/\n/g, "<br>");

  // Restore protected chunks
  str = str.replace(/XPROTECTEDCHUNK(\d+)X/g, (_, idx) => {
    return placeholders[Number(idx)] ?? "";
  });

  return str;
}

export interface CreateApkgOptions extends CreateApkgModelOptions {
  /**
   * When true, generates fresh GUIDs and IDs for notes, cards, and decks.
   * This guarantees that Anki treats the package as a brand-new independent deck,
   * avoiding duplicate card skips and note conflicts, while using deterministic
   * Note Type IDs so Anki reuses/updates matching Note Types rather than
   * creating duplicates, and preserving 100% of scheduling history and FSRS states.
   */
  regenerateIds?: boolean;
  /**
   * Target math delimiter format for exported Anki note fields (default: "katex").
   * Pass "preserve" to keep existing delimiters unchanged (e.g. when remaster math normalization is off).
   */
  mathFormat?: MathFormatMode;
}

async function initSqlJsInstance() {
  if (typeof window === "undefined") {
    const sqlModule = await import("sql.js");
    const init = sqlModule.default || sqlModule;
    return await init();
  }
  let initSqlJs = (window as any).initSqlJs;
  if (!initSqlJs) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/sql-wasm.js";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load sql.js"));
      document.head.appendChild(script);
    });
  }
  const init = (window as any).initSqlJs;
  if (!init) throw new Error("sql.js failed to load");
  return await init({ locateFile: () => "/sql-wasm.wasm" });
}

export async function createApkgFromAnkiJson(
  ankiJson: any,
  deckName: string,
  templateId: CardTemplateId = "default",
  options?: CreateApkgOptions,
): Promise<Blob> {
  const regenerateIds = Boolean(options?.regenerateIds);

  const SQL = await initSqlJsInstance();
  const db = new SQL.Database();

  db.exec(APKG_SCHEMA);
  db.exec(APKG_COL);

  const timestamp = Math.floor(Date.now() / 1000);
  const fallbackDeckId = Date.now();
  const fallbackModelId = fallbackDeckId + 1;
  let idGen = fallbackDeckId * 100;

  // Remapping registries when regenerateIds is active
  const deckIdMap = new Map<number, number>();
  let nextDeckId = fallbackDeckId;
  const getDeckId = (origId: number): number => {
    if (!regenerateIds) return origId;
    if (!deckIdMap.has(origId)) {
      deckIdMap.set(origId, nextDeckId++);
    }
    return deckIdMap.get(origId)!;
  };

  const modelIdMap = new Map<number, number>();
  let nextModelId = fallbackModelId;
  const getModelId = (origId: number): number => {
    if (!regenerateIds) return origId;
    if (!modelIdMap.has(origId)) {
      modelIdMap.set(origId, nextModelId++);
    }
    return modelIdMap.get(origId)!;
  };

  const cardIdMap = new Map<number, number>();

  // Preserve col properties (such as creation time `crt`) from original deck if available,
  // preventing relative card due dates from drifting by thousands of days.
  const colCrt = toFiniteNumber(ankiJson?.col?.crt, timestamp);
  const colMod = toFiniteNumber(ankiJson?.col?.mod, timestamp * 1000);
  const colScm = toFiniteNumber(ankiJson?.col?.scm, timestamp * 1000);
  // collection.anki2 in standard .apkg packages must always use schema version 11.
  // Modern Anki schemas (ver 14+) store config in a dedicated SQLite `config` table;
  // setting ver > 11 causes Anki to execute `SELECT ... FROM config` and crash with
  // 'no such table: config'.
  const colVer = 11;
  const colDty = toFiniteNumber(ankiJson?.col?.dty, 0);
  const colUsn = toFiniteNumber(ankiJson?.col?.usn, 0);
  const colLs = toFiniteNumber(ankiJson?.col?.ls, 0);

  db.exec(
    "UPDATE col SET crt = ?, mod = ?, scm = ?, ver = ?, dty = ?, usn = ?, ls = ? WHERE id = 1",
    [colCrt, colMod, colScm, colVer, colDty, colUsn, colLs],
  );

  const colRes = db.exec("SELECT decks, models, conf FROM col");
  const decksObj = JSON.parse(colRes[0].values[0][0] as string);
  const modelsObj = JSON.parse(colRes[0].values[0][1] as string);
  const confObj = JSON.parse(colRes[0].values[0][2] as string);

  const noteEntries: Array<{ deckId: number; deckName: string; note: any }> = [];

  if (ankiJson?.decks?.byId && typeof ankiJson.decks.byId === "object") {
    for (const [deckIdStr, rawDeck] of Object.entries(ankiJson.decks.byId as Record<string, any>)) {
      const parsedDeckId = toFiniteNumber(deckIdStr, fallbackDeckId);
      const rawName = typeof rawDeck?.fullName === "string" && rawDeck.fullName.trim()
        ? rawDeck.fullName
        : typeof rawDeck?.name === "string" && rawDeck.name.trim()
          ? rawDeck.name
          : deckName;
      const notes = Array.isArray(rawDeck?.notes) ? rawDeck.notes : [];

      notes.forEach((note: any) => {
        noteEntries.push({ deckId: parsedDeckId, deckName: rawName, note });
      });
    }
  } else if (Array.isArray(ankiJson?.notes)) {
    ankiJson.notes.forEach((note: any) => {
      noteEntries.push({ deckId: fallbackDeckId, deckName, note });
    });
  } else {
    throw new Error("Merged JSON has no supported note structure. Expected notes[] or decks.byId.");
  }

  if (!noteEntries.length) {
    throw new Error("Merged JSON contains no notes to export.");
  }

  const decksToCreate = new Map<number, string>();
  const origModelFieldCount = new Map<number, number>();
  const origModelTemplateCount = new Map<number, number>();

  for (const entry of noteEntries) {
    const targetDid = getDeckId(entry.deckId);
    let targetDeckName = entry.deckName;
    if (regenerateIds && !targetDeckName.includes("(Remastered)")) {
      targetDeckName = `${targetDeckName} (Remastered)`;
    }
    decksToCreate.set(targetDid, targetDeckName);

    const cards = Array.isArray(entry.note?.cards) ? entry.note.cards : [];
    for (const card of cards) {
      const origDid = toFiniteNumber(card?.did, entry.deckId);
      const targetCardDid = getDeckId(origDid);
      if (!decksToCreate.has(targetCardDid)) {
        decksToCreate.set(
          targetCardDid,
          regenerateIds ? `Deck ${targetCardDid} (Remastered)` : `Deck ${targetCardDid}`,
        );
      }
    }

    const origMid = toFiniteNumber(entry.note?.mid, fallbackModelId);
    const fieldCount = typeof entry.note?.flds === "string" && entry.note.flds.length
      ? entry.note.flds.split("\x1f").length
      : 2;
    const maxOrd = cards.reduce((acc: number, card: any) => {
      return Math.max(acc, toFiniteNumber(card?.ord, 0));
    }, 0);
    const templateCount = maxOrd + 1;

    origModelFieldCount.set(origMid, Math.max(origModelFieldCount.get(origMid) ?? 0, fieldCount));
    origModelTemplateCount.set(origMid, Math.max(origModelTemplateCount.get(origMid) ?? 1, templateCount));
  }

  const firstDeckId = decksToCreate.keys().next().value ?? fallbackDeckId;

  for (const [did, name] of decksToCreate.entries()) {
    decksObj[String(did)] = {
      collapsed: false,
      conf: 1,
      desc: "",
      dyn: 0,
      extendNew: 0,
      extendRev: 50,
      id: did,
      lrnToday: [0, 0],
      mod: timestamp,
      name,
      newToday: [0, 0],
      revToday: [0, 0],
      timeToday: [0, 0],
      usn: -1,
    };
  }

  interface SourceAnkiModelField {
    name?: string;
    ord?: number;
  }
  interface SourceAnkiModelTemplate {
    name?: string;
    qfmt?: string;
    afmt?: string;
    ord?: number;
  }
  interface SourceAnkiModel {
    id?: string | number;
    mod?: number;
    name?: string;
    css?: string;
    flds?: SourceAnkiModelField[];
    tmpls?: SourceAnkiModelTemplate[];
    fieldNames?: string[];
    templates?: SourceAnkiModelTemplate[];
    [key: string]: unknown;
  }

  // Normalize source models (handles both legacy col.models and modern loadModelsNew metadata)
  const sourceModelsByOrigMid = new Map<number, SourceAnkiModel>();
  if (ankiJson?.models && typeof ankiJson.models === "object") {
    for (const [midStr, rawModel] of Object.entries(ankiJson.models as Record<string, SourceAnkiModel>)) {
      const origMid = toFiniteNumber(midStr, fallbackModelId);
      if (rawModel && Array.isArray(rawModel.flds) && rawModel.flds.length > 0) {
        sourceModelsByOrigMid.set(origMid, JSON.parse(JSON.stringify(rawModel)) as SourceAnkiModel);
      } else if (rawModel && Array.isArray(rawModel.fieldNames) && rawModel.fieldNames.length > 0) {
        const normalized = buildModelFromFields(
          origMid,
          firstDeckId,
          rawModel.fieldNames,
          origModelTemplateCount.get(origMid) ?? (Array.isArray(rawModel.templates) ? rawModel.templates.length : 1),
          timestamp,
          "default",
          typeof rawModel.name === "string" && rawModel.name.trim() ? rawModel.name.trim() : undefined,
          Array.isArray(rawModel.templates) ? rawModel.templates : undefined,
          typeof rawModel.css === "string" ? rawModel.css : undefined,
        );
        sourceModelsByOrigMid.set(origMid, normalized);
      }
    }
  }

  const resolveRemasteredModelIdentity = (origMid: number, fieldNames: string[], origName?: string) => {
    const selectedTemplate = CARD_TEMPLATES[templateId] || CARD_TEMPLATES.default;
    if (!regenerateIds) {
      return {
        targetMid: origMid,
        modelName: origName || resolveNoteTypeNames(templateId, fieldNames.slice(2), "per_schema", options?.customNoteTypeName).noteTypeName,
      };
    }

    let modelName: string;
    if (templateId !== "default" || options?.customNoteTypeName?.trim()) {
      modelName = resolveNoteTypeNames(templateId, fieldNames.slice(2), "per_schema", options?.customNoteTypeName).noteTypeName;
    } else if (origName && origName.trim() && !/^basic(-\d+)?$/i.test(origName.trim())) {
      modelName = origName.includes("(Remastered)") ? origName : `${origName} (Remastered)`;
    } else {
      modelName = resolveNoteTypeNames("default", fieldNames.slice(2), "per_schema").noteTypeName;
    }

    const schemaKey = `schedae:v1:${selectedTemplate.id}:${modelName}:${fieldNames.join("\x1f")}`;
    return {
      targetMid: computeDeterministicModelId(schemaKey),
      modelName,
    };
  };

  // Pre-resolve origMid -> targetMid consistently across modelsObj, conf.curModel, and notes.mid
  const allOrigMids = new Set<number>([
    ...origModelFieldCount.keys(),
    ...sourceModelsByOrigMid.keys(),
  ]);

  for (const origMid of allOrigMids) {
    const srcModel = sourceModelsByOrigMid.get(origMid);
    const fieldNames: string[] = srcModel?.flds?.length
      ? [...srcModel.flds].sort((a, b) => (a.ord ?? 0) - (b.ord ?? 0)).map((f) => String(f.name || "Field"))
      : Array.from({ length: Math.max(2, origModelFieldCount.get(origMid) ?? 2) }, (_, idx) =>
          idx === 0 ? "Front" : idx === 1 ? "Back" : `Field ${idx + 1}`,
        );

    const { targetMid, modelName } = resolveRemasteredModelIdentity(
      origMid,
      fieldNames,
      typeof srcModel?.name === "string" ? srcModel.name : undefined,
    );
    modelIdMap.set(origMid, targetMid);

    if (modelsObj[String(targetMid)]) continue;

    if (srcModel) {
      const clonedModel = JSON.parse(JSON.stringify(srcModel));
      clonedModel.id = targetMid;
      clonedModel.mod = timestamp;
      clonedModel.name = modelName;

      // Apply requested template CSS & front/back markup while preserving exact field schema
      if (templateId && templateId !== "default" && CARD_TEMPLATES[templateId]) {
        const tpl = CARD_TEMPLATES[templateId];
        const { qfmt, afmt } = buildTemplateQfmtAfmt(
          templateId,
          fieldNames[0] || "Front",
          fieldNames[1] || "Back",
          fieldNames.slice(2),
        );

        clonedModel.css = tpl.css;
        if (Array.isArray(clonedModel.tmpls) && clonedModel.tmpls.length > 0) {
          clonedModel.tmpls[0].name = tpl.cardTypeName;
          clonedModel.tmpls[0].qfmt = qfmt;
          clonedModel.tmpls[0].afmt = afmt;
        }
      }
      modelsObj[String(targetMid)] = clonedModel;
    } else {
      modelsObj[String(targetMid)] = buildModelFromFieldCount(
        targetMid,
        firstDeckId,
        origModelFieldCount.get(origMid) ?? 2,
        origModelTemplateCount.get(origMid) ?? 1,
        timestamp,
        templateId,
        modelName,
      );
    }
  }

  const firstOrigMid = origModelFieldCount.keys().next().value;
  const firstModelId = firstOrigMid !== undefined ? getModelId(firstOrigMid) : fallbackModelId;

  confObj.activeDecks = [firstDeckId];
  confObj.curDeck = firstDeckId;
  confObj.curModel = String(firstModelId);

  db.exec("UPDATE col SET conf = ?, decks = ?, models = ?", [
    JSON.stringify(confObj),
    JSON.stringify(decksObj),
    JSON.stringify(modelsObj),
  ]);

  const mathFormat: MathFormatMode = options?.mathFormat ?? "katex";

  for (const entry of noteEntries) {
    const note = entry.note ?? {};

    const frontRaw = typeof note.front === "string" ? note.front : "";
    const backRaw = typeof note.back === "string" ? note.back : "";
    const frontHTML = formatMarkdownForAnki(frontRaw, { mathFormat });
    const backHTML = formatMarkdownForAnki(backRaw, { mathFormat });
    let flds = `${frontHTML}\x1f${backHTML}`;
    if (typeof note.flds === "string" && note.flds.length) {
      const parts = note.flds.split("\x1f");
      if (parts.length >= 2) {
        parts[0] = frontRaw ? frontHTML : formatMarkdownForAnki(parts[0], { mathFormat });
        parts[1] = backRaw ? backHTML : formatMarkdownForAnki(parts[1], { mathFormat });
        for (let pIdx = 2; pIdx < parts.length; pIdx++) {
          parts[pIdx] = formatMarkdownForAnki(parts[pIdx], { mathFormat });
        }
        flds = parts.join("\x1f");
      } else {
        flds = parts.map((p: string) => formatMarkdownForAnki(p, { mathFormat })).join("\x1f");
      }
    }

    const noteId = regenerateIds ? ++idGen : toFiniteNumber(note.id, ++idGen);
    const origMid = toFiniteNumber(note.mid, fallbackModelId);
    const noteMid = getModelId(origMid);
    // Use current timestamp so Anki's "Update notes: If newer" updates existing notes
    // in the collection rather than skipping them as duplicates
    const noteMod = timestamp;
    const noteUsn = toFiniteNumber(note.usn, -1);
    const noteTags = typeof note.tags === "string" ? note.tags : "";
    const noteGuid = regenerateIds
      ? generateGuid()
      : (typeof note.guid === "string" && note.guid.length ? note.guid : generateGuid());

    db.exec(
      "INSERT INTO notes (id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        noteId,
        noteGuid,
        noteMid,
        noteMod,
        noteUsn,
        noteTags,
        flds,
        frontHTML,
        0,
        0,
        typeof note.data === "string" ? note.data : "",
      ],
    );

    const cards = Array.isArray(note.cards) && note.cards.length
      ? note.cards
      : [{ ord: 0, did: entry.deckId }];

    cards.forEach((card: any, idx: number) => {
      const scheduling = card?.scheduling ?? {};

      const origCardId = toFiniteNumber(card?.id, 0);
      const cardId = regenerateIds ? ++idGen : toFiniteNumber(card?.id, ++idGen);
      if (origCardId) {
        cardIdMap.set(origCardId, cardId);
      }

      const origDid = toFiniteNumber(card?.did, entry.deckId);
      const cardDid = getDeckId(origDid);
      const cardOrd = toFiniteNumber(card?.ord, idx);
      const cardMod = toFiniteNumber(scheduling.mod ?? card?.mod, timestamp);
      const cardUsn = toFiniteNumber(scheduling.usn ?? card?.usn, -1);
      const cardType = toFiniteNumber(scheduling.type ?? card?.type, 0);
      const cardQueue = toFiniteNumber(scheduling.queue ?? card?.queue, 0);
      const cardDue = toFiniteNumber(scheduling.due ?? card?.due, 0);
      const cardIvl = toFiniteNumber(scheduling.ivl ?? card?.ivl, 0);
      const cardFactor = toFiniteNumber(scheduling.factor ?? card?.factor, 2500);
      const cardReps = toFiniteNumber(scheduling.reps ?? card?.reps, 0);
      const cardLapses = toFiniteNumber(scheduling.lapses ?? card?.lapses, 0);
      const cardLeft = toFiniteNumber(scheduling.left ?? card?.left, 0);
      const cardOdue = toFiniteNumber(scheduling.odue ?? card?.odue, 0);
      const cardOdid = toFiniteNumber(scheduling.odid ?? card?.odid, 0);
      const cardFlags = toFiniteNumber(scheduling.flags ?? card?.flags, 0);
      const cardData = typeof scheduling.data === "string" && scheduling.data.length
        ? scheduling.data
        : (typeof card?.data === "string" ? card.data : "");

      db.exec(
        "INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          cardId,
          noteId,
          cardDid,
          cardOrd,
          cardMod,
          cardUsn,
          cardType,
          cardQueue,
          cardDue,
          cardIvl,
          cardFactor,
          cardReps,
          cardLapses,
          cardLeft,
          cardOdue,
          cardOdid,
          cardFlags,
          cardData,
        ],
      );
    });
  }

  // Preserve review history (revlog) if present from source deck
  if (Array.isArray(ankiJson?.revlog) && ankiJson.revlog.length > 0) {
    for (const r of ankiJson.revlog) {
      const origId = toFiniteNumber(r.id, 0);
      const origCid = toFiniteNumber(r.cid, 0);
      const targetCid = regenerateIds ? (cardIdMap.get(origCid) ?? origCid) : origCid;
      if (origId && targetCid) {
        db.exec(
          "INSERT OR IGNORE INTO revlog (id, cid, usn, ease, ivl, lastIvl, factor, time, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            origId,
            targetCid,
            toFiniteNumber(r.usn, -1),
            toFiniteNumber(r.ease, 0),
            toFiniteNumber(r.ivl, 0),
            toFiniteNumber(r.lastIvl, 0),
            toFiniteNumber(r.factor, 0),
            toFiniteNumber(r.time, 0),
            toFiniteNumber(r.type, 0),
          ],
        );
      }
    }
  }

  const data = db.export();
  const zip = new JSZip();
  zip.file("collection.anki2", data);

  const mediaObj: Record<string, string> = {};
  let mediaIndex = 0;

  const ankiMediaGlob: Record<string, () => Promise<string>> = typeof (import.meta as any).glob === "function"
    ? (import.meta as any).glob('/public/anki-media/**/*', { query: '?url', import: 'default' })
    : {};

  for (const [path, resolveUrl] of Object.entries(ankiMediaGlob)) {
    const filename = path.split('/').pop();
    if (!filename || filename === '.DS_Store') continue;

    try {
      const url = (await resolveUrl()) as string;
      const response = await fetch(url);

      const isHtmlFallback = response.headers.get("content-type")?.includes("text/html");
      if (response.ok && !isHtmlFallback) {
        const arrayBuffer = await response.arrayBuffer();
        mediaObj[String(mediaIndex)] = filename;
        zip.file(String(mediaIndex), arrayBuffer);
        mediaIndex++;
      }
    } catch {
      // Ignore optional media fetch failures during export.
    }
  }

  zip.file("media", JSON.stringify(mediaObj));

  return zip.generateAsync({ type: "blob" });
}

export async function createApkg(
  cards: FlashCard[],
  deckName: string,
  templateId: CardTemplateId = "default",
  customCss?: string,
  options?: CreateApkgExportOptions,
): Promise<Blob> {
  const SQL = await initSqlJsInstance();
  const db = new SQL.Database();

  db.exec(APKG_SCHEMA);
  db.exec(APKG_COL);

  const timestamp = Math.floor(Date.now() / 1000);
  const deckId = new Date().getTime();
  const resolvedModel = resolveApkgModelConfig(cards, templateId, options);
  const modelId = resolvedModel.modelId;

  const deckJson = {
    collapsed: false,
    conf: 1,
    desc: "",
    dyn: 0,
    extendNew: 0,
    extendRev: 50,
    id: deckId,
    lrnToday: [163, 2],
    mod: timestamp,
    name: deckName,
    newToday: [163, 2],
    revToday: [163, 0],
    timeToday: [163, 23598],
    usn: -1
  };

  const customFieldNames = resolvedModel.customFieldNames;
  const selectedTemplate = CARD_TEMPLATES[templateId] || CARD_TEMPLATES.default;

  const fldsConfig = [
    { name: "Front", ord: 0, font: "Arial", media: [], rtl: false, size: 20, sticky: false },
    { name: "Back", ord: 1, font: "Arial", media: [], rtl: false, size: 20, sticky: false },
    ...customFieldNames.map((name, idx) => ({
      name,
      ord: idx + 2,
      font: "Arial",
      media: [],
      rtl: false,
      size: 16,
      sticky: false,
    })),
  ];

  const { qfmt: cardQfmt, afmt: cardAfmt } = buildTemplateQfmtAfmt(
    templateId,
    "Front",
    "Back",
    customFieldNames,
  );

  const modelJson = {
    css: customCss || selectedTemplate.css,
    did: deckId,
    flds: fldsConfig,
    id: String(modelId),
    latexPost: "\\\\end{document}",
    latexPre: "\\\\documentclass[12pt]{article}\\special{papersize=3in,5in}\\\\usepackage[utf8]{inputenc}\\\\usepackage{amssymb,amsmath}\\\\pagestyle{empty}\\\\setlength{\\\\parindent}{0in}\\\\begin{document}",
    latexsvg: false,
    mod: timestamp,
    name: resolvedModel.noteTypeName,
    req: [
      [0, "all", [0]]
    ],
    sortf: 0,
    tags: [],
    tmpls: [
      {
        name: resolvedModel.cardTypeName,
        qfmt: cardQfmt,
        afmt: cardAfmt,
        bafmt: "",
        bqfmt: "",
        bfont: "",
        bsize: 0,
        did: null,
        ord: 0
      }
    ],
    type: 0,
    usn: -1,
    vers: []
  };

  const colRes = db.exec("SELECT decks, models, conf FROM col");
  const decksObj = JSON.parse(colRes[0].values[0][0] as string);
  const modelsObj = JSON.parse(colRes[0].values[0][1] as string);
  const confObj = JSON.parse(colRes[0].values[0][2] as string);

  decksObj[String(deckId)] = deckJson;
  modelsObj[String(modelId)] = modelJson;
  confObj.activeDecks = [deckId];
  confObj.curDeck = deckId;
  confObj.curModel = String(modelId);

  db.exec("UPDATE col SET conf = ?, decks = ?, models = ?", [
    JSON.stringify(confObj),
    JSON.stringify(decksObj),
    JSON.stringify(modelsObj)
  ]);

  let idGen = deckId * 100;
  const mathFormat: ExportMathFormat = options?.mathFormat ?? "katex";

  for (const card of cards) {
    const noteId = ++idGen;
    const frontHTML = formatMarkdownForAnki(card.front, { mathFormat });
    const backHTML = formatMarkdownForAnki(card.back || "", { mathFormat });
    const extraFlds = customFieldNames.map((name) =>
      formatMarkdownForAnki(getCustomFieldValue(card.customFields, name), { mathFormat })
    );
    const flds = [frontHTML, backHTML, ...extraFlds].join("\x1f");
    
    const noteTags = (card.tags || "").trim() ? ` ${(card.tags || "").trim()} ` : "";

    db.exec(
      "INSERT INTO notes (id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        noteId, generateGuid(), modelId, timestamp, -1, noteTags, flds, frontHTML, 0, 0, ""
      ]
    );

    const cardId = ++idGen;
    db.exec(
      "INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        cardId, noteId, deckId, 0, timestamp, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ""
      ]
    );
  }

  const data = db.export();
  const zip = new JSZip();
  zip.file("collection.anki2", data);

  const mediaObj: Record<string, string> = {};
  let mediaIndex = 0;

  // Automatically fetch and bundle specified media files if present in the public folder.
  const ankiMediaGlob: Record<string, () => Promise<string>> = typeof (import.meta as any).glob === "function"
    ? (import.meta as any).glob('/public/anki-media/**/*', { query: '?url', import: 'default' })
    : {};

  for (const [path, resolveUrl] of Object.entries(ankiMediaGlob)) {
    const filename = path.split('/').pop();
    if (!filename || filename === '.DS_Store') continue;

    try {
      const url = (await resolveUrl()) as string;
      const response = await fetch(url);
      
      const isHtmlFallback = response.headers.get("content-type")?.includes("text/html");
      if (response.ok && !isHtmlFallback) {
        const arrayBuffer = await response.arrayBuffer();
        mediaObj[String(mediaIndex)] = filename;
        // Anki media folder must be flat, so we store everything (css, js, fonts) in the root
        zip.file(String(mediaIndex), arrayBuffer);
        mediaIndex++;
        console.log(`[Anki Media] Bundled ${filename} from ${path}`);
      }
    } catch (e) {
      console.warn(`[Anki Media] Could not fetch ${filename} for bundling: `, e);
    }
  }

  zip.file("media", JSON.stringify(mediaObj));

  const blob = await zip.generateAsync({ type: "blob" });
  return blob;
}