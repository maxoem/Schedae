import JSZip from "jszip";
import type { FlashCard } from "./types";
import { CARD_TEMPLATES, type CardTemplateId } from "./templates";

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

function buildModelFromFieldCount(
  modelId: number,
  deckId: number,
  fieldCount: number,
  templateCount: number,
  timestamp: number,
  templateId: CardTemplateId,
) {
  const selectedTemplate = CARD_TEMPLATES[templateId] || CARD_TEMPLATES.default;
  const safeFieldCount = Math.max(2, fieldCount);
  const safeTemplateCount = Math.max(1, templateCount);

  const flds = Array.from({ length: safeFieldCount }, (_, idx) => ({
    name: idx === 0 ? "Front" : idx === 1 ? "Back" : `Field ${idx + 1}`,
    ord: idx,
    font: "Arial",
    media: [],
    rtl: false,
    size: 20,
    sticky: false,
  }));

  const tmpls = Array.from({ length: safeTemplateCount }, (_, idx) => ({
    name: `Card ${idx + 1}`,
    qfmt: selectedTemplate.qfmt,
    afmt: selectedTemplate.afmt,
    bafmt: "",
    bqfmt: "",
    bfont: "",
    bsize: 0,
    did: null,
    ord: idx,
  }));

  return {
    css: selectedTemplate.css,
    did: deckId,
    flds,
    id: String(modelId),
    latexPost: "\\\\end{document}",
    latexPre:
      "\\\\documentclass[12pt]{article}\\special{papersize=3in,5in}\\\\usepackage[utf8]{inputenc}\\\\usepackage{amssymb,amsmath}\\\\pagestyle{empty}\\\\setlength{\\\\parindent}{0in}\\\\begin{document}",
    latexsvg: false,
    mod: timestamp,
    name: `Basic-${modelId}`,
    req: [[0, "all", [0]]],
    sortf: 0,
    tags: [],
    tmpls,
    type: 0,
    usn: -1,
    vers: [],
  };
}

/**
 * Formats and normalizes markdown content for storage in Anki note fields (flds).
 * Ensures that:
 * 1. Line endings are normalized and trailing whitespace on lines is stripped.
 * 2. Raw HTML <br> tags immediately preceding list markers are normalized to standard newlines.
 * 3. Accidental single-space indentations before top-level list markers (*, -, +, 1.)
 *    are removed so Markdown-it does not misclassify them as nested sub-bullets.
 * 4. Paragraph and list newlines are converted to <br> for Anki editor compatibility,
 *    without introducing stray spaces after <br>.
 */
export function formatMarkdownForAnki(content: string): string {
  if (!content) return "";
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

  // Protect math formulas and code blocks so that internal newlines in LaTeX matrices,
  // bracketed display math, or aligned equations are never corrupted with <br> or backslash removals
  const placeholders: string[] = [];
  const protect = (match: string) => {
    const idx = placeholders.length;
    placeholders.push(match);
    return `XPROTECTEDCHUNK${idx}X`;
  };

  // Step A: Protect existing delimited blocks and code blocks
  str = str.replace(/```[\s\S]*?```/g, protect);
  str = str.replace(/\$\$[\s\S]*?\$\$/g, protect);
  str = str.replace(/\\{1,2}\[[\s\S]*?\\{1,2}\]/g, protect);
  str = str.replace(/\\{1,2}\([^\n]*?\\{1,2}\)/g, protect);
  str = str.replace(/\\?<anki-mathjax[^>]*>[\s\S]*?\\?<\/anki-mathjax>/gi, protect);
  str = str.replace(/\$[^$\n]+?\$/g, protect);

  // Step B: Wrap any remaining bare LaTeX display environments in display math ($$...$$).
  // Because all existing math delimiters ($$, \[, \(, <anki-mathjax>, $) and code blocks are
  // already replaced with placeholders, any \begin{...}...\end{\1} matched here is strictly bare.
  const BARE_ENV_REGEX =
    /\\begin\{(align\*?|alignat\*?|equation\*?|gather\*?|multline\*?|flalign\*?|split|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|matrix|cases|dcases|rcases|drcases|aligned|alignedat\*?|gathered|array|CD)\}([\s\S]*?)\\end\{\1\}/gi;

  str = str.replace(BARE_ENV_REGEX, (match) => {
    return protect(`$$\n${match.trim()}\n$$`);
  });

  // Step C: Protect any remaining generic \begin{...}...\end{...} environments so their contents are preserved
  str = str.replace(/\\begin\{([a-zA-Z*]+)\}[\s\S]*?\\end\{\1\}/gi, protect);

  // 5. Clean up stray backslash lines and trailing backslashes outside math
  str = str.replace(/(^|\n)\s*\\+\s*(?=\n|$)/g, "$1");
  str = str.replace(/([^\\])\\+[ \t]*(?=\n|$)/g, "$1");

  // 6. Normalize accidental single-space indentation before list markers (leaves 2+ spaces / tabs intact)
  str = str.replace(/(^|\n) ([*+-]|\d+\.) /g, "$1$2 ");

  // 7. Normalize multiple blank lines to clean double newlines
  str = str.replace(/\n{3,}/g, "\n\n");

  // 8. Convert newlines to Anki HTML breaks (<br>)
  str = str.replace(/\n/g, "<br>");

  // Restore protected chunks
  str = str.replace(/XPROTECTEDCHUNK(\d+)X/g, (_, idx) => {
    return placeholders[Number(idx)] ?? "";
  });

  return str;
}

export interface CreateApkgOptions {
  /**
   * When true, generates fresh GUIDs and IDs for notes, cards, models, and decks.
   * This guarantees that Anki treats the package as a brand-new independent deck,
   * avoiding duplicate card skips, note conflicts, and notetype schema rejections,
   * while preserving 100% of scheduling history, review logs, and FSRS states.
   */
  regenerateIds?: boolean;
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
  const modelFieldCount = new Map<number, number>();
  const modelTemplateCount = new Map<number, number>();

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
    const targetMid = getModelId(origMid);
    const fieldCount = typeof entry.note?.flds === "string" && entry.note.flds.length
      ? entry.note.flds.split("\x1f").length
      : 2;
    const maxOrd = cards.reduce((acc: number, card: any) => {
      return Math.max(acc, toFiniteNumber(card?.ord, 0));
    }, 0);
    const templateCount = maxOrd + 1;

    modelFieldCount.set(targetMid, Math.max(modelFieldCount.get(targetMid) ?? 0, fieldCount));
    modelTemplateCount.set(targetMid, Math.max(modelTemplateCount.get(targetMid) ?? 1, templateCount));
  }

  const firstDeckId = decksToCreate.keys().next().value ?? fallbackDeckId;
  const firstModelId = modelFieldCount.keys().next().value ?? fallbackModelId;

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

  // 1. Preserve original models from source deck if available (preserves exact field names,
  // template structures, IDs, and prevents Anki from reporting "Notetype changed / conflict").
  if (ankiJson?.models && typeof ankiJson.models === "object") {
    for (const [midStr, rawModel] of Object.entries(ankiJson.models as Record<string, any>)) {
      if (rawModel && Array.isArray(rawModel.flds) && rawModel.flds.length > 0) {
        const origMid = toFiniteNumber(midStr, fallbackModelId);
        const targetMid = getModelId(origMid);
        const clonedModel = JSON.parse(JSON.stringify(rawModel));
        clonedModel.id = targetMid;
        clonedModel.mod = timestamp;
        if (regenerateIds && typeof clonedModel.name === "string" && !clonedModel.name.includes("(Remastered)")) {
          clonedModel.name = `${clonedModel.name} (Remastered)`;
        }

        // If a specific template style was requested, apply CSS & template formatting
        // while preserving exact field schema
        if (templateId && templateId !== "default" && CARD_TEMPLATES[templateId]) {
          const tpl = CARD_TEMPLATES[templateId];
          clonedModel.css = tpl.css;
          if (Array.isArray(clonedModel.tmpls) && clonedModel.tmpls.length > 0) {
            clonedModel.tmpls[0].qfmt = tpl.qfmt;
            clonedModel.tmpls[0].afmt = tpl.afmt;
          }
        }
        modelsObj[String(targetMid)] = clonedModel;
      }
    }
  }

  // 2. For any models not present in source deck, build fallback models
  for (const [targetMid, count] of modelFieldCount.entries()) {
    if (!modelsObj[String(targetMid)]) {
      modelsObj[String(targetMid)] = buildModelFromFieldCount(
        targetMid,
        firstDeckId,
        count,
        modelTemplateCount.get(targetMid) ?? 1,
        timestamp,
        templateId,
      );
    }
  }

  confObj.activeDecks = [firstDeckId];
  confObj.curDeck = firstDeckId;
  confObj.curModel = String(firstModelId);

  db.exec("UPDATE col SET conf = ?, decks = ?, models = ?", [
    JSON.stringify(confObj),
    JSON.stringify(decksObj),
    JSON.stringify(modelsObj),
  ]);

  for (const entry of noteEntries) {
    const note = entry.note ?? {};

    const frontRaw = typeof note.front === "string" ? note.front : "";
    const backRaw = typeof note.back === "string" ? note.back : "";
    const frontHTML = formatMarkdownForAnki(frontRaw);
    const backHTML = formatMarkdownForAnki(backRaw);
    let flds = `${frontHTML}\x1f${backHTML}`;
    if (typeof note.flds === "string" && note.flds.length) {
      const parts = note.flds.split("\x1f");
      if (parts.length >= 2) {
        parts[0] = frontRaw ? frontHTML : formatMarkdownForAnki(parts[0]);
        parts[1] = backRaw ? backHTML : formatMarkdownForAnki(parts[1]);
        for (let pIdx = 2; pIdx < parts.length; pIdx++) {
          parts[pIdx] = formatMarkdownForAnki(parts[pIdx]);
        }
        flds = parts.join("\x1f");
      } else {
        flds = parts.map((p: string) => formatMarkdownForAnki(p)).join("\x1f");
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

export async function createApkg(cards: FlashCard[], deckName: string, templateId: CardTemplateId = "default", customCss?: string): Promise<Blob> {
  const SQL = await initSqlJsInstance();
  const db = new SQL.Database();

  db.exec(APKG_SCHEMA);
  db.exec(APKG_COL);

  const timestamp = Math.floor(Date.now() / 1000);
  const deckId = new Date().getTime();
  const modelId = deckId + 1;

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

  const customFieldNames: string[] = [];
  const seenCustomKeys = new Set<string>();
  for (const card of cards) {
    if (card.customFields) {
      for (const key of Object.keys(card.customFields)) {
        if (!seenCustomKeys.has(key)) {
          seenCustomKeys.add(key);
          customFieldNames.push(key);
        }
      }
    }
  }

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

  let cardAfmt = selectedTemplate.afmt;
  for (const name of customFieldNames) {
    // Topic is elevated to a first-class badge on the front, not rendered as generic back footer
    if (name.toLowerCase() === "topic") continue;

    const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, "-");
    if (templateId === "markdown_basic") {
      cardAfmt += `\n{{#${name}}}<div class="custom-field custom-field-${safeName}"><hr><b>${name}:</b><div class="md-custom-field md-field"><pre>{{${name}}}</pre></div></div>{{/${name}}}`;
    } else {
      cardAfmt += `\n{{#${name}}}<div class="custom-field custom-field-${safeName}"><hr><b>${name}:</b><br>{{${name}}}</div>{{/${name}}}`;
    }
  }

  let cardQfmt = selectedTemplate.qfmt;
  const topicFieldName = customFieldNames.find((n) => n.toLowerCase() === "topic");
  if (topicFieldName) {
    cardQfmt = `{{#${topicFieldName}}}<div class="card-topic-badge">{{${topicFieldName}}}</div>{{/${topicFieldName}}}\n` + cardQfmt;
  }

  const modelJson = {
    css: customCss || selectedTemplate.css,
    did: deckId,
    flds: fldsConfig,
    id: String(modelId),
    latexPost: "\\\\end{document}",
    latexPre: "\\\\documentclass[12pt]{article}\\special{papersize=3in,5in}\\\\usepackage[utf8]{inputenc}\\\\usepackage{amssymb,amsmath}\\\\pagestyle{empty}\\\\setlength{\\\\parindent}{0in}\\\\begin{document}",
    latexsvg: false,
    mod: timestamp,
    name: "Basic",
    req: [
      [0, "all", [0]]
    ],
    sortf: 0,
    tags: [],
    tmpls: [
      {
        name: "Card 1",
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

  const colRes = db.exec("SELECT decks, models FROM col");
  const decksObj = JSON.parse(colRes[0].values[0][0] as string);
  const modelsObj = JSON.parse(colRes[0].values[0][1] as string);

  decksObj[String(deckId)] = deckJson;
  modelsObj[String(modelId)] = modelJson;

  db.exec("UPDATE col SET decks = ?, models = ?", [
    JSON.stringify(decksObj),
    JSON.stringify(modelsObj)
  ]);

  let idGen = deckId * 100;

  for (const card of cards) {
    const noteId = ++idGen;
    const frontHTML = formatMarkdownForAnki(card.front);
    const backHTML = formatMarkdownForAnki(card.back || "");
    const extraFlds = customFieldNames.map((name) =>
      formatMarkdownForAnki(card.customFields?.[name] || "")
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