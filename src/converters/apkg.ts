import JSZip from "jszip";
import { type Database, type QueryExecResult } from "sql.js";  // type-only import is fine
import { decompress } from "fzstd";
import type { Converter, ConversionResult, FlashCard } from "./types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CardTemplate {
  name: string;
  qfmt: string;
  afmt: string;
  ord: number;
}

interface NoteField {
  name: string;
  ord: number;
}

interface Model {
  id: string;
  name: string;
  flds: NoteField[];
  tmpls: CardTemplate[];
  css: string;
}

interface ModelInfo {
  name: string;
  fieldNames: string[];
  templates: CardTemplate[];
  css: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Anki uses \x1f (ASCII unit separator, 0x1F) to join note fields. */
const FIELD_SEP = "\x1f";

/**
 * SQLite3 magic header bytes (first 16 bytes of every SQLite file).
 * Includes the null terminator at position 15.
 */
const SQLITE_MAGIC = new Uint8Array([
  0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, // "SQLite f"
  0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00, // "ormat 3\0"
]);

// ── sql.js singleton ──────────────────────────────────────────────────────────

// Cache the resolved value, not the promise, so a failed load can be retried.
let _sqlJs: Awaited<ReturnType<typeof import("sql.js")["default"]>> | null = null;

async function loadSqlJs(): Promise<void> {
  if (typeof window === "undefined") {
    const sqlModule = await import("sql.js");
    const init = sqlModule.default || sqlModule;
    _sqlJs = await init();
    return;
  }
  if ((window as any).initSqlJs) return; // already loaded

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/sql-wasm.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load sql.js"));
    document.head.appendChild(script);
  });
}

async function getSql() {
  if (!_sqlJs) {
    await loadSqlJs();
    if (!_sqlJs && typeof window !== "undefined") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const init = (window as any).initSqlJs;
      if (!init) throw new Error("sql.js not loaded");
      _sqlJs = await init({
        locateFile: () => "/sql-wasm.wasm",
      });
    }
  }
  if (!_sqlJs) throw new Error("sql.js failed to initialize");
  return _sqlJs;
}


// ── sql.js result helpers ─────────────────────────────────────────────────────

/**
 * Converts a sql.js column-oriented result into an array of row objects.
 * Returns [] for empty results.
 */
function rowsToObjects<T extends object>(result: QueryExecResult[]): T[] {
  if (!result.length) return [];
  const { columns, values } = result[0]!;
  console.log(result)
  return values.map(
    (row) => Object.fromEntries(columns.map((col, i) => [col, row[i] ?? null])) as T,
  );
}

/** Safe PRAGMA wrapper — returns [] if the table does not exist. */
function tableColumns(db: Database, table: string): string[] {
  try {
    return rowsToObjects<{ name: string }>(
      db.exec(`PRAGMA table_info(${table})`),
    ).map((r) => r.name);
  } catch {
    return [];
  }
}

/** Returns all user table names in the database. */
function listTables(db: Database): string[] {
  return rowsToObjects<{ name: string }>(
    db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"),
  ).map((r) => r.name);
}

// ── Protobuf helpers ──────────────────────────────────────────────────────────

/**
 * Minimal protobuf varint decoder.
 * Returns [value, bytesConsumed].
 */
function decodeVarint(buf: Uint8Array, offset: number): [number, number] {
  let result = 0;
  let shift = 0;
  let i = offset;

  while (i < buf.length) {
    if (shift >= 64) throw new Error("Varint too long");
    const byte = buf[i++];
    result |= (byte & 0x7f) << shift;
    shift += 7;
    if ((byte & 0x80) === 0) return [result, i - offset];
  }

  throw new Error("Varint terminated unexpectedly");
}

/**
 * Extracts a specific string field from a protobuf blob.
 *
 * Anki's CardTemplateConfig layout (rslib/src/notetype.proto):
 *   field 1  = id (int64)
 *   field 2  = name (string)     — not used here
 *   field 3  = mtime_secs (int64)
 *   field 4  = qfmt (string)     ← front template
 *   field 5  = afmt (string)     ← back template
 *   field 6  = bqfmt (string)
 *   field 7  = bafmt (string)
 *   ...
 *
 * Anki's NotetypeConfig layout:
 *   field 1  = id (int64)
 *   ...
 *   field 9  = css (string)      ← per-notetype CSS
 *   ...
 */
function readProtoStringField(blob: Uint8Array, targetFieldNumber: number): string {
  const dec = new TextDecoder("utf-8", { fatal: false });
  let i = 0;
  while (i < blob.length) {
    const tagStart = i;
    const [tagByte, tagLen] = decodeVarint(blob, i);
    i += tagLen;

    const fieldNumber = tagByte >>> 3;
    const wireType = tagByte & 0x07;

    if (wireType === 0) {
      // Varint — skip
      const [, len] = decodeVarint(blob, i);
      i += len;
    } else if (wireType === 1) {
      // 64-bit — skip
      i += 8;
    } else if (wireType === 2) {
      // Length-delimited (string, bytes, embedded message)
      const [len, lenSize] = decodeVarint(blob, i);
      i += lenSize;
      if (fieldNumber === targetFieldNumber) {
        return dec.decode(blob.slice(i, i + len));
      }
      i += len;
    } else if (wireType === 5) {
      // 32-bit — skip
      i += 4;
    } else {
      // Unknown wire type — stop to avoid reading garbage
      console.warn(`[apkg] Unknown protobuf wire type ${wireType} at offset ${tagStart}`);
      break;
    }
  }
  return "";
}

// ── Schema: legacy (col.models JSON) ─────────────────────────────────────────

/**
 * Loads model info from the old `col.models` JSON column (Anki < 2.1.36).
 * Returns null when the column is absent or the JSON is empty/invalid.
 */
function loadModelsLegacy(db: Database): Map<string, ModelInfo> | null {
  if (!tableColumns(db, "col").includes("models")) return null;

  const rows = rowsToObjects<{ models: string | null }>(
    db.exec("SELECT models FROM col LIMIT 1"),
  );
  const modelsJson = rows[0]?.models;
  if (!modelsJson) return null;

  let parsed: Record<string, Model>;
  try {
    parsed = JSON.parse(modelsJson) as Record<string, Model>;
  } catch {
    return null;
  }
  if (!Object.keys(parsed).length) return null;

  return new Map(
    Object.entries(parsed).map(([mid, m]) => [
      mid,
      {
        name: m.name ?? "",
        fieldNames: [...m.flds].sort((a, b) => a.ord - b.ord).map((f) => f.name),
        templates: [...m.tmpls].sort((a, b) => a.ord - b.ord),
        css: m.css ?? "",
      },
    ]),
  );
}

// ── Schema: new (notetypes / fields / templates tables) ───────────────────────

/**
 * Loads model info from the new split-table schema (Anki ≥ 2.1.36).
 * qfmt, afmt, and CSS are extracted from protobuf `config` blobs using the
 * correct field numbers rather than heuristics.
 * Returns null when the `notetypes` table does not exist.
 */
function loadModelsNew(db: Database): Map<string, ModelInfo> | null {
  if (!tableColumns(db, "notetypes").length) return null;

  interface NtRow { id: number; name: string; config: Uint8Array | null }
  interface FieldRow { ntid: number; ord: number; name: string }
  interface TmplRow { ntid: number; ord: number; name: string; config: Uint8Array | null }

  const notetypes = rowsToObjects<NtRow>(
    db.exec("SELECT id, name, config FROM notetypes"),
  );
  if (!notetypes.length) return null;

  // Build ntid-keyed maps in a single pass each to avoid O(n²) filtering.
  const fieldsByNtid = new Map<number, FieldRow[]>();
  for (const f of rowsToObjects<FieldRow>(
    db.exec("SELECT ntid, ord, name FROM fields ORDER BY ntid, ord"),
  )) {
    const arr = fieldsByNtid.get(f.ntid) ?? [];
    arr.push(f);
    fieldsByNtid.set(f.ntid, arr);
  }

  const tmplsByNtid = new Map<number, TmplRow[]>();
  for (const t of rowsToObjects<TmplRow>(
    db.exec("SELECT ntid, ord, name, config FROM templates ORDER BY ntid, ord"),
  )) {
    const arr = tmplsByNtid.get(t.ntid) ?? [];
    arr.push(t);
    tmplsByNtid.set(t.ntid, arr);
  }

  const map = new Map<string, ModelInfo>();

  for (const nt of notetypes) {
    const ntid = Number(nt.id);

    const fieldNames = (fieldsByNtid.get(ntid) ?? [])
      .sort((a, b) => a.ord - b.ord)
      .map((f) => f.name);

    const templates: CardTemplate[] = (tmplsByNtid.get(ntid) ?? [])
      .sort((a, b) => a.ord - b.ord)
      .map((t) => {
        let qfmt = "";
        let afmt = "";
        if (t.config instanceof Uint8Array && t.config.length > 0) {
          // CardTemplate.Config proto: field 1 = q_format, field 2 = a_format
          qfmt = readProtoStringField(t.config, 1);
          afmt = readProtoStringField(t.config, 2);
          console.debug(`[apkg] template "${t.name}" config hex (first 64 bytes):`, Array.from(t.config.slice(0, 64)).map(b => b.toString(16).padStart(2,'0')).join(' '));
          console.debug(`[apkg] template "${t.name}" qfmt (${qfmt.length} chars):`, qfmt.slice(0, 200));
          console.debug(`[apkg] template "${t.name}" afmt (${afmt.length} chars):`, afmt.slice(0, 200));
        } else {
          console.debug(`[apkg] template "${t.name}" has no config blob`);
        }
        // Hard fallback — renders all fields on both sides
        if (!qfmt) { console.warn(`[apkg] qfmt empty for "${t.name}", using fallback`); qfmt = fieldNames.map((n) => `{{${n}}}`).join("<br>"); }
        if (!afmt) { console.warn(`[apkg] afmt empty for "${t.name}", using fallback`); afmt = fieldNames.map((n) => `{{${n}}}`).join("<br>"); }
        return { name: t.name, qfmt, afmt, ord: t.ord };
      });

    // Notetype.Config proto: field 3 = css
    const css =
      nt.config instanceof Uint8Array && nt.config.length > 0
        ? readProtoStringField(nt.config, 3)
        : "";

    map.set(String(ntid), { name: nt.name || "", fieldNames, templates, css });
  }

  return map.size ? map : null;
}

// ── Template rendering ──────────────────────���─────────────────────────────────

/** Replace {{FieldName}} with the field value. */
function substituteFields(fmt: string, fields: Record<string, string>): string {
  return Object.entries(fields).reduce(
    (s, [name, value]) => s.replaceAll(`{{${name}}}`, value),
    fmt,
  );
}

/**
 * Handle {{#Field}}...{{/Field}} (show if non-empty) and
 * {{^Field}}...{{/Field}} (show if empty) conditional blocks.
 */
function applyConditionals(fmt: string, fields: Record<string, string>): string {
  // Conditional: {{#Field}} ... {{/Field}}
  fmt = fmt.replace(/\{\{#(.+?)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, name: string, inner: string) => {
    const val = fields[name.trim()] ?? "";
    return val.trim() ? inner : "";
  });
  // Negated conditional: {{^Field}} ... {{/Field}}
  fmt = fmt.replace(/\{\{\^(.+?)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, name: string, inner: string) => {
    const val = fields[name.trim()] ?? "";
    return val.trim() ? "" : inner;
  });
  return fmt;
}

/**
 * Remove <script> and <style> blocks from rendered HTML.
 * Anki templates often embed KaTeX/Markdown rendering scripts directly in
 * qfmt/afmt; we strip them so consumers get clean content HTML. The
 * per-notetype CSS is preserved separately in FlashCard.style.
 */
function stripScriptsAndStyles(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .trim();
}

/**
 * If the rendered back starts with the rendered front content (common in Anki
 * templates that repeat the question field on the back), strip that prefix and
 * the following <hr> separator so only the answer portion remains.
 */
function stripFrontFromBack(front: string, back: string): string {
  const f = front.trim();
  const b = back.trim();
  if (f && b.startsWith(f)) {
    return b.slice(f.length).replace(/^\s*<hr\b[^>]*>\s*/i, "").trim();
  }
  return back;
}

/**
 * Render a card template:
 * 1. Apply conditional blocks
 * 2. Replace {{FieldName}} tokens
 * 3. Replace {{FrontSide}} with a sentinel, then after rendering strip
 *    everything up to and including it (keeps only the answer portion)
 * 4. Strip <script>/<style> boilerplate
 * 5. Clean up remaining unresolved tokens
 */
const FRONTSIDE_SENTINEL = "\x00FRONTSIDE\x00";

function renderTemplate(
  fmt: string,
  fields: Record<string, string>,
): string {
  let rendered = applyConditionals(fmt, fields);
  rendered = substituteFields(rendered, fields);
  // Mark where {{FrontSide}} was so we can cut the back to answer-only later
  rendered = rendered.replaceAll("{{FrontSide}}", FRONTSIDE_SENTINEL);
  // Strip <script>/<style> boilerplate injected by Anki add-ons (e.g. KaTeX)
  rendered = stripScriptsAndStyles(rendered);
  // Clean up any remaining unresolved tokens (e.g. {{Tags}}, {{Type}})
  rendered = rendered.replace(/\{\{[^}]+\}\}/g, "");
  return rendered;
}

// ── Card building strategies ──────────────────────────────────────────────────

/**
 * Strategy A: Full template rendering.
 * Resolves note-type templates → renders front and back HTML correctly,
 * including conditionals and {{FrontSide}}.
 */
function buildCardsViaTemplates(db: Database): { cards: FlashCard[]; style: string } | null {
  const modelMap = loadModelsLegacy(db) ?? loadModelsNew(db);
  if (!modelMap?.size) return null;

  interface NoteRow { id: number; mid: number; tags: string; flds: string }
  const noteMap = new Map(
    rowsToObjects<NoteRow>(db.exec("SELECT id, mid, tags, flds FROM notes")).map(
      (n) => [Number(n.id), n],
    ),
  );

  interface CardRow { nid: number; ord: number }
  const cards: FlashCard[] = [];
  const seenStyles = new Set<string>();
  const styles: string[] = [];

  for (const card of rowsToObjects<CardRow>(db.exec("SELECT nid, ord FROM cards"))) {
    const note = noteMap.get(Number(card.nid));
    if (!note) continue;

    const model = modelMap.get(String(note.mid));
    if (!model) continue;

    const ord = Number(card.ord);
    if (ord >= model.templates.length) continue;
    const tmpl = model.templates[ord]!;

    const fields = Object.fromEntries(
      model.fieldNames.map((name, i) => [name, note.flds.split(FIELD_SEP)[i] ?? ""]),
    );

    const front = renderTemplate(tmpl.qfmt, fields);
    let back = renderTemplate(tmpl.afmt, fields);

    // If {{FrontSide}} sentinel is present, keep only what follows it
    if (back.includes(FRONTSIDE_SENTINEL)) {
      back = back.slice(back.indexOf(FRONTSIDE_SENTINEL) + FRONTSIDE_SENTINEL.length)
        .replace(/^\s*<hr\b[^>]*>\s*/i, "").trim();
    } else {
      // No {{FrontSide}} token — the template may repeat the front field directly;
      // strip it from the start of the back
      back = stripFrontFromBack(front, back);
    }

    if (cards.length === 0) {
      console.debug('[apkg] first card — fieldNames:', model.fieldNames);
      console.debug('[apkg] first card — qfmt:', tmpl.qfmt.slice(0, 300));
      console.debug('[apkg] first card — afmt:', tmpl.afmt.slice(0, 300));
      console.debug('[apkg] first card — rendered front:', front.slice(0, 300));
      console.debug('[apkg] first card — rendered back:', back.slice(0, 300));
    }

    if (model.css && !seenStyles.has(model.css)) {
      seenStyles.add(model.css);
      styles.push(model.css);
    }

    const customFields: Record<string, string> = {};
    if (model.fieldNames.length > 2) {
      for (let i = 2; i < model.fieldNames.length; i++) {
        const name = model.fieldNames[i];
        const val = fields[name];
        if (val && val.trim()) {
          customFields[name] = val.trim();
        }
      }
    }

    cards.push({
      front,
      back,
      ...(Object.keys(customFields).length > 0 ? { customFields } : {}),
    });
  }

  return { cards, style: styles.join("\n") };
}

/**
 * Strategy B: Direct field[0] / field[1] extraction.
 * Universal fallback that works without any template/model info.
 * Does not include CSS styling.
 */
function buildCardsFromNoteFields(db: Database): FlashCard[] {
  return rowsToObjects<{ flds: string }>(db.exec("SELECT flds FROM notes"))
    .flatMap(({ flds }) => {
      if (!flds) return [];
      const parts = flds.split(FIELD_SEP);
      const front = stripScriptsAndStyles(parts[0] ?? "");
      const back = stripScriptsAndStyles(parts[1] ?? "");
      // Use a basic strip to check emptiness, but preserve original HTML as value
      const isEmpty = (s: string) => s.replace(/<[^>]*>/g, "").trim() === "";
      if (isEmpty(front) && isEmpty(back)) return [];
      return [{ front, back, style: "" }];
    });
}

// ── SQLite magic check ────────────────────────────────────────────────────────

function assertSQLiteMagic(bytes: Uint8Array, label: string): void {
  for (let i = 0; i < SQLITE_MAGIC.length; i++) {
    if (bytes[i] !== SQLITE_MAGIC[i]) {
      throw new Error(
        `"${label}" is not a valid SQLite3 database. ` +
          `Expected magic bytes at offset ${i} to be 0x${SQLITE_MAGIC[i]!.toString(16).padStart(2, "0")}, ` +
          `got 0x${(bytes[i] ?? 0).toString(16).padStart(2, "0")}.`,
      );
    }
  }
}

// ── Core decoder ──────────────────────────────────────────────────────────────

async function decodeApkg(buffer: ArrayBuffer): Promise<{ cards: FlashCard[]; style: string }> {
  const zip = await JSZip.loadAsync(buffer);

  // Pick the newest collection format present: anki21b > anki21 > anki2
  let dbBytes: Uint8Array;
  let collectionLabel: string;

  if (zip.file("collection.anki21b")) {
    collectionLabel = "collection.anki21b";
    const compressed = await zip.file("collection.anki21b")!.async("uint8array");
    dbBytes = decompress(new Uint8Array(compressed));
  } else if (zip.file("collection.anki21")) {
    collectionLabel = "collection.anki21";
    dbBytes = new Uint8Array(await zip.file("collection.anki21")!.async("uint8array"));
  } else if (zip.file("collection.anki2")) {
    collectionLabel = "collection.anki2";
    dbBytes = new Uint8Array(await zip.file("collection.anki2")!.async("uint8array"));
  } else {
    throw new Error(
      `No Anki collection file found in archive. Files present: ${Object.keys(zip.files).join(", ")}`,
    );
  }

  assertSQLiteMagic(dbBytes, collectionLabel);

  const SQL = await getSql();
  const db = new SQL.Database(dbBytes);

  try {
    const templateResult = buildCardsViaTemplates(db);
    let cards: FlashCard[];
    let style = "";

    if (templateResult && templateResult.cards.length > 0) {
      cards = templateResult.cards;
      style = templateResult.style;
    } else {
      console.warn(
        "[apkg] Template rendering yielded no cards — falling back to direct field extraction. " +
          `Tables: ${listTables(db).join(", ")}`,
      );
      cards = buildCardsFromNoteFields(db);
    }

    if (cards.length === 0) {
      throw new Error(
        `No cards could be extracted from the archive. Available tables: ${listTables(db).join(", ")}`,
      );
    }

    return { cards, style };
  } finally {
    db.close();
  }
}

// ── Converter export ──────────────────────────────────────────────────────────



// ── Raw DB Extractor (Full / Reduced) ─────────────────────────────────────────

export async function decodeApkgRaw(
  buffer: ArrayBuffer,
  mode: 'full' | 'reduced',
  selectedFields: string[] = ['front', 'back'],
  options: { includeScheduling?: boolean; includeDeckPreset?: boolean } = {}
): Promise<any> {
  const zip = await JSZip.loadAsync(buffer);
  
  let dbBytes: Uint8Array;
  
  if (zip.file("collection.anki21b")) {
    const compressed = await zip.file("collection.anki21b")!.async("uint8array");
    dbBytes = decompress(new Uint8Array(compressed));
  } else if (zip.file("collection.anki21")) {
    dbBytes = await zip.file("collection.anki21")!.async("uint8array");
  } else if (zip.file("collection.anki2")) {
    dbBytes = await zip.file("collection.anki2")!.async("uint8array");
  } else {
    throw new Error("No collection.anki2, collection.anki21, or collection.anki21b found in the .apkg file.");
  }
  
  const SQL = await getSql();
  const db = new SQL.Database(dbBytes);
  
  try {
    if (mode === 'full') {
      const result: Record<string, any[]> = {};
      const tables = ['col', 'notes', 'cards', 'revlog', 'graves'];
      for (const t of tables) {
        try {
          const rows = db.exec(`SELECT * FROM ${t}`);
          if (rows.length > 0) {
            const cols = rows[0].columns;
            result[t] = rows[0].values.map((val) => {
              const obj: Record<string, any> = {};
              cols.forEach((c, i) => { obj[c] = val[i]; });
              return obj;
            });
          } else {
            result[t] = [];
          }
        } catch (e) {
          // Table might not exist, skip
        }
      }
      return result;
    } else {
      const includeScheduling = options.includeScheduling ?? false;
      const includeDeckPreset = options.includeDeckPreset ?? false;

      const hasField = (field: string) => selectedFields.includes(field);

      let colMeta: Record<string, any> = {};
      try {
        const colRes = db.exec("SELECT * FROM col LIMIT 1");
        if (colRes.length && colRes[0].values.length) {
          const cols = colRes[0].columns;
          const vals = colRes[0].values[0];
          cols.forEach((colName, idx) => {
            colMeta[colName] = vals[idx];
          });
        }
      } catch {
        colMeta = {};
      }

      const decksJson = colMeta.decks ? String(colMeta.decks) : "";
      const dconfJson = colMeta.dconf ? String(colMeta.dconf) : "";

      let dconfById: Record<string, any> = {};
      if (dconfJson) {
        try {
          dconfById = JSON.parse(dconfJson) as Record<string, any>;
        } catch {
          dconfById = {};
        }
      }

      const nameToId = new Map<string, number>();
      const deckNodes = new Map<number, {
        id: number;
        name: string;
        fullName: string;
        confId?: number;
        preset?: Record<string, any>;
        parentId: number | null;
        childDeckIds: number[];
        notes: any[];
        stats: { notes: number; cards: number };
      }>();

      const hasDecksTable = tableColumns(db, "decks").length > 0;
      if (hasDecksTable) {
        const deckRows = rowsToObjects<{ id: number; name: string }>(db.exec("SELECT id, name FROM decks"));
        for (const row of deckRows) {
          const id = Number(row.id);
          const fullName = String(row.name).replace(/[\x1f\x1e]|::/g, "::");
          const parts = fullName.split("::");
          const name = parts[parts.length - 1] || fullName;
          
          nameToId.set(fullName, id);
          deckNodes.set(id, {
            id,
            name,
            fullName,
            parentId: null,
            childDeckIds: [],
            notes: [],
            stats: { notes: 0, cards: 0 },
          });
        }
      } else if (decksJson) {
        try {
          const parsed = JSON.parse(decksJson) as Record<string, { name?: string; conf?: number }>;
          for (const [deckIdStr, rawDeck] of Object.entries(parsed)) {
            const id = Number(deckIdStr);
            if (!Number.isFinite(id)) continue;

            const fullName = String(rawDeck?.name ?? `Deck ${id}`).replace(/[\x1f\x1e]|::/g, "::");
            const parts = fullName.split("::");
            const name = parts[parts.length - 1] || fullName;
            const confId = Number(rawDeck?.conf);
            const preset = Number.isFinite(confId) ? dconfById[String(confId)] : undefined;

            nameToId.set(fullName, id);
            deckNodes.set(id, {
              id,
              name,
              fullName,
              ...(Number.isFinite(confId) ? { confId } : {}),
              ...(includeDeckPreset && preset ? { preset } : {}),
              parentId: null,
              childDeckIds: [],
              notes: [],
              stats: { notes: 0, cards: 0 },
            });
          }
        } catch {
          // If col.decks is malformed we continue with cards-derived deck IDs only.
        }
      }

      // Establish parent relationships
      for (const deck of deckNodes.values()) {
        const idx = deck.fullName.lastIndexOf("::");
        if (idx > 0) {
          const parentName = deck.fullName.slice(0, idx);
          const parentId = nameToId.get(parentName) ?? null;
          deck.parentId = parentId;
        }
      }

      const noteRows = rowsToObjects<{
        id: number;
        guid: string;
        mid: number;
        mod: number;
        usn: number;
        tags: string;
        flds: string;
      }>(db.exec("SELECT id, guid, mid, mod, usn, tags, flds FROM notes"));

      const cardRows = rowsToObjects<{
        id: number;
        nid: number;
        did: number;
        ord: number;
        mod: number;
        usn: number;
        type: number;
        queue: number;
        due: number;
        ivl: number;
        factor: number;
        reps: number;
        lapses: number;
        left: number;
        odue: number;
        odid: number;
        flags: number;
        data?: string;
      }>(
        db.exec(
          tableColumns(db, "cards").includes("data")
            ? "SELECT id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data FROM cards"
            : "SELECT id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags FROM cards"
        ),
      );

      const cardsByNid = new Map<number, typeof cardRows>();
      for (const card of cardRows) {
        const nid = Number(card.nid);
        const arr = cardsByNid.get(nid) ?? [];
        arr.push(card);
        cardsByNid.set(nid, arr);

        if (!deckNodes.has(Number(card.did))) {
          const did = Number(card.did);
          deckNodes.set(did, {
            id: did,
            name: `Deck ${did}`,
            fullName: `Deck ${did}`,
            parentId: null,
            childDeckIds: [],
            notes: [],
            stats: { notes: 0, cards: 0 },
          });
        }
      }

      const normalizeCard = (card: (typeof cardRows)[number]) => {
        const cardData = typeof card.data === "string" ? card.data : "";
        const base: Record<string, any> = {
          id: Number(card.id),
          ord: Number(card.ord),
          did: Number(card.did),
          data: cardData,
        };

        if (includeScheduling) {
          base.scheduling = {
            type: Number(card.type),
            queue: Number(card.queue),
            due: Number(card.due),
            ivl: Number(card.ivl),
            factor: Number(card.factor),
            reps: Number(card.reps),
            lapses: Number(card.lapses),
            left: Number(card.left),
            odue: Number(card.odue),
            odid: Number(card.odid),
            flags: Number(card.flags),
            mod: Number(card.mod),
            usn: Number(card.usn),
            data: cardData,
          };
        }

        return base;
      };

      let totalNoteEntries = 0;

      for (const note of noteRows) {
        const fldsStr = String(note.flds ?? "");
        const flds = fldsStr ? fldsStr.split(FIELD_SEP) : [];

        const noteBase: Record<string, any> = {};

        if (hasField("front")) noteBase.front = flds[0] || "";
        if (hasField("back")) noteBase.back = flds[1] || "";
        if (hasField("extra")) {
          const extraParts = flds.slice(2);
          if (extraParts.length > 0) noteBase.extra = extraParts.join(" | ");
        }
        if (hasField("flds")) noteBase.flds = fldsStr;
        if (hasField("id")) noteBase.id = Number(note.id);
        if (hasField("guid")) noteBase.guid = note.guid;
        if (hasField("mid")) noteBase.mid = Number(note.mid);
        if (hasField("mod")) noteBase.mod = Number(note.mod);
        if (hasField("usn")) noteBase.usn = Number(note.usn);
        if (hasField("tags")) noteBase.tags = note.tags;

        const noteCards = cardsByNid.get(Number(note.id)) ?? [];
        const deckToCards = new Map<number, (typeof cardRows)>();
        for (const c of noteCards) {
          const did = Number(c.did);
          const arr = deckToCards.get(did) ?? [];
          arr.push(c);
          deckToCards.set(did, arr);
        }

        if (!deckToCards.size) {
          continue;
        }

        for (const [did, cardsInDeck] of deckToCards.entries()) {
          const deck = deckNodes.get(did);
          if (!deck) continue;

          const noteEntry: Record<string, any> = {
            ...noteBase,
            cards: cardsInDeck.map(normalizeCard),
          };

          deck.notes.push(noteEntry);
          deck.stats.notes += 1;
          deck.stats.cards += cardsInDeck.length;
          totalNoteEntries += 1;
        }
      }

      for (const deck of deckNodes.values()) {
        if (deck.parentId !== null) {
          const parent = deckNodes.get(deck.parentId);
          if (parent) parent.childDeckIds.push(deck.id);
        }
      }

      for (const deck of deckNodes.values()) {
        deck.childDeckIds.sort((a, b) => {
          const da = deckNodes.get(a)?.fullName ?? "";
          const dbn = deckNodes.get(b)?.fullName ?? "";
          return da.localeCompare(dbn);
        });
      }

      const rootDeckIds = Array.from(deckNodes.values())
        .filter((d) => d.parentId === null)
        .sort((a, b) => a.fullName.localeCompare(b.fullName))
        .map((d) => d.id);

      const deckById = Object.fromEntries(
        Array.from(deckNodes.values())
          .sort((a, b) => a.fullName.localeCompare(b.fullName))
          .map((d) => [String(d.id), d]),
      );

      let fullModels: Record<string, any> = {};
      if (colMeta.models) {
        try {
          fullModels = JSON.parse(String(colMeta.models));
        } catch {
          fullModels = {};
        }
      }
      const modelMap = loadModelsLegacy(db) ?? loadModelsNew(db);
      const models = Object.keys(fullModels).length > 0
        ? fullModels
        : (modelMap ? Object.fromEntries(modelMap) : {});

      let revlogRows: any[] = [];
      if (includeScheduling) {
        try {
          if (tableColumns(db, "revlog").length > 0) {
            revlogRows = rowsToObjects<{
              id: number;
              cid: number;
              usn: number;
              ease: number;
              ivl: number;
              lastIvl: number;
              factor: number;
              time: number;
              type: number;
            }>(db.exec("SELECT id, cid, usn, ease, ivl, lastIvl, factor, time, type FROM revlog"));
          }
        } catch {
          revlogRows = [];
        }
      }

      return {
        format: "anki-apkg-reduced-v2",
        summary: {
          deckCount: deckNodes.size,
          rootDeckCount: rootDeckIds.length,
          noteEntryCount: totalNoteEntries,
          cardCount: cardRows.length,
          includesScheduling: includeScheduling,
          includesDeckPreset: includeDeckPreset,
        },
        decks: {
          rootDeckIds,
          byId: deckById,
        },
        models,
        col: colMeta,
        revlog: revlogRows,
      };
    }
  } finally {
    db.close();
  }
}

export const apkgConverter: Converter = {
  name: "Anki Package (.apkg)",
  supportedExtensions: ["apkg"],
  binary: true,

  async convert(content: string | ArrayBuffer, _fileName: string): Promise<ConversionResult> {
    if (!(content instanceof ArrayBuffer)) {
      throw new TypeError(".apkg converter requires binary (ArrayBuffer) input.");
    }
    const { cards, style } = await decodeApkg(content);
    return { cards, sourceFormat: "anki-apkg", ...(style ? { style } : {}) };
  },
};