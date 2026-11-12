import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_LLM_MARKDOWN_FIELDS,
  buildLlmFormatGuideComment,
  chunkLlmMarkdownByTokens,
  evaluateLlmMergeCapability,
  exportDeckToLlmMarkdown,
  formatNoteToLlmMarkdown,
  hasAnyLlmFieldSelected,
  mergeLlmMarkdownIntoDeck,
  parseLlmMarkdownUpdates,
} from "../index";

describe("llmMarkdownService", () => {
  const sampleNote = {
    id: 1792602682971,
    front: "Definiere im Prüfungsstil (Oberbegriff, scharfe Abgrenzung, Beispiel): **Soft Margin** eines SVMs",
    back: [
      "* **Oberbegriff (Genus):** Eine Erweiterung des klassischen Hard-Margin-SVM-Konzepts für nicht ideal trennbare Datenmengen.  ",
      "* **Scharfe Abgrenzung (Differentia):** Duldete kontrollierte Verletzungen des Sicherheitsabstands oder Fehlklassifikationen im Training, indem die Maximierung der Margin gegen die Summe aller Slack-Fehler (\\\\(\\\\sum \\\\xi_i\\\\)) abgewogen wird.  ",
      "* **Beispiel/Kontext:** Verhindert Overfitting bei verrauschten Datenpunkten oder Ausreißern im Überlappungsbereich zweier Klassen.",
    ].join("\n"),
    tags: "ml svm",
    flds: "Old Front\x1fOld Back\x1fExtra Info",
  };

  describe("evaluateLlmMergeCapability", () => {
    test("returns 'full' when id, question, and answer are all selected", () => {
      const capability = evaluateLlmMergeCapability(DEFAULT_LLM_MARKDOWN_FIELDS);
      assert.equal(capability.status, "full");
      assert.equal(capability.canMerge, true);
      assert.equal(capability.canOpenMergeAssistant, true);
      assert.deepEqual(capability.missingFields, []);
      assert.deepEqual(capability.supportedOperations, ["question", "answer", "delete"]);
    });

    test("returns 'partial' when id + question are selected and answer is deselected", () => {
      const capability = evaluateLlmMergeCapability({ id: true, question: true, answer: false });
      assert.equal(capability.status, "partial");
      assert.equal(capability.canMerge, true);
      assert.equal(capability.canOpenMergeAssistant, true);
      assert.deepEqual(capability.missingFields, ["answer"]);
      assert.deepEqual(capability.supportedOperations, ["question", "delete"]);
      assert.match(capability.message, /Answer \(A:\)/);
    });

    test("returns 'partial' when id + answer are selected and question is deselected", () => {
      const capability = evaluateLlmMergeCapability({ id: true, question: false, answer: true });
      assert.equal(capability.status, "partial");
      assert.equal(capability.canMerge, true);
      assert.equal(capability.canOpenMergeAssistant, true);
      assert.deepEqual(capability.missingFields, ["question"]);
      assert.deepEqual(capability.supportedOperations, ["answer", "delete"]);
      assert.match(capability.message, /Question \(Q:\)/);
    });

    test("returns 'impossible' when id is deselected regardless of Q/A", () => {
      for (const question of [true, false]) {
        for (const answer of [true, false]) {
          const capability = evaluateLlmMergeCapability({ id: false, question, answer });
          assert.equal(capability.status, "impossible");
          assert.equal(capability.canMerge, false);
          assert.equal(capability.canOpenMergeAssistant, false);
          assert.ok(capability.missingFields.includes("id"));
        }
      }
    });

    test("returns 'impossible' for content merge when id is selected but both Q and A are deselected", () => {
      const capability = evaluateLlmMergeCapability({ id: true, question: false, answer: false });
      assert.equal(capability.status, "impossible");
      assert.equal(capability.canMerge, false);
      assert.equal(capability.canOpenMergeAssistant, false);
      assert.deepEqual(capability.missingFields, ["question", "answer"]);
    });
  });

  describe("formatNoteToLlmMarkdown & exportDeckToLlmMarkdown", () => {
    test("formats full card block identically to canonical ### deckId:noteId / Q: / A: / --- structure", () => {
      const block = formatNoteToLlmMarkdown(sampleNote, DEFAULT_LLM_MARKDOWN_FIELDS, "1792230495576");
      const expected = [
        "### 1792230495576:1792602682971",
        `Q: ${sampleNote.front}`,
        `A: ${sampleNote.back}`,
        "---",
      ].join("\n");
      assert.equal(block, expected);
    });

    test("omits deselected fields cleanly across combinations", () => {
      assert.equal(
        formatNoteToLlmMarkdown(sampleNote, { id: false, question: true, answer: true }, "1792230495576"),
        `Q: ${sampleNote.front}\nA: ${sampleNote.back}\n---`,
      );
      assert.equal(
        formatNoteToLlmMarkdown(sampleNote, { id: true, question: true, answer: false }, "1792230495576"),
        `### 1792230495576:1792602682971\nQ: ${sampleNote.front}\n---`,
      );
      assert.equal(
        formatNoteToLlmMarkdown(sampleNote, { id: true, question: false, answer: true }, "1792230495576"),
        `### 1792230495576:1792602682971\nA: ${sampleNote.back}\n---`,
      );
      assert.equal(
        formatNoteToLlmMarkdown(sampleNote, { id: true, question: false, answer: false }, "1792230495576"),
        "### 1792230495576:1792602682971\n---",
      );
      assert.equal(
        formatNoteToLlmMarkdown(sampleNote, { id: false, question: false, answer: false }, "1792230495576"),
        "",
      );
    });

    test("returns empty string from exportDeckToLlmMarkdown when no fields are selected", () => {
      const noFields = { id: false, question: false, answer: false };
      assert.equal(hasAnyLlmFieldSelected(noFields), false);
      assert.equal(
        exportDeckToLlmMarkdown({ notes: [sampleNote] }, noFields),
        "",
      );
    });

    test("exportDeckToLlmMarkdown supports both flat notes and hierarchical decks.byId", () => {
      const flatMd = exportDeckToLlmMarkdown(
        { notes: [sampleNote] },
        { id: true, question: true, answer: false },
        { includeGuideComment: false },
      );
      assert.equal(flatMd, `### 1792602682971\nQ: ${sampleNote.front}\n---`);

      const treeMd = exportDeckToLlmMarkdown(
        { decks: { byId: { "1792230495576": { notes: [sampleNote] } } } },
        { id: true, question: false, answer: true },
        { includeGuideComment: false },
      );
      assert.equal(treeMd, `### 1792230495576:1792602682971\nA: ${sampleNote.back}\n---`);
    });

    test("buildLlmFormatGuideComment adapts instructions to active field selection", () => {
      const withoutIdGuide = buildLlmFormatGuideComment({ id: false, question: true, answer: false });
      assert.ok(!withoutIdGuide.includes("# ### 12345"));
      assert.ok(withoutIdGuide.includes("# Q: <Frage/Prompt>"));
      assert.ok(!withoutIdGuide.includes("# A: <Antwort>"));
    });
  });

  describe("parseLlmMarkdownUpdates & mergeLlmMarkdownIntoDeck", () => {
    const originalDeck = {
      format: "anki-apkg-reduced-v2",
      decks: {
        byId: {
          "1792230495576": {
            id: 1792230495576,
            notes: [
              {
                id: 101,
                front: "Original Q1",
                back: "Original A1",
                tags: "tag1",
                flds: "Original Q1\x1fOriginal A1\x1fExtra1",
              },
              {
                id: 102,
                front: "Original Q2",
                back: "Original A2",
                tags: "tag2",
                flds: "Original Q2\x1fOriginal A2\x1fExtra2",
              },
              {
                id: 103,
                front: "Original Q3",
                back: "Original A3",
                tags: "tag3",
                flds: "Original Q3\x1fOriginal A3\x1fExtra3",
              },
            ],
          },
        },
      },
    };

    test("parses full, partial Q-only, partial A-only, and [DELETE] blocks while ignoring guide comments", () => {
      const guide = buildLlmFormatGuideComment(DEFAULT_LLM_MARKDOWN_FIELDS);
      const md = [
        guide,
        "### 1792230495576:101\nQ: Updated Q1 with inline A: mention\n---",
        "### 1792230495576:102\nA: Updated A2\n---",
        "### 1792230495576:103\n[DELETE]\n---",
      ].join("\n\n");

      const parsed = parseLlmMarkdownUpdates(md);
      assert.equal(parsed.blocksMissingId, 0);
      assert.equal(parsed.updates.get("101")?.front, "Updated Q1 with inline A: mention");
      assert.equal(parsed.updates.get("101")?.back, undefined);
      assert.equal(parsed.updates.get("102")?.front, undefined);
      assert.equal(parsed.updates.get("102")?.back, "Updated A2");
      assert.equal(parsed.updates.get("103")?.action, "delete");
    });

    test("partial merge preserves untouched fields in both note properties and flds", () => {
      const md = [
        "### 1792230495576:101\nQ: Refined Q1\n---",
        "### 1792230495576:102\nA: Refined A2\n---",
        "### 1792230495576:103\n[DELETE]\n---",
      ].join("\n\n");

      const { mergedJson, stats } = mergeLlmMarkdownIntoDeck(originalDeck, md);
      const notes = mergedJson.decks.byId["1792230495576"].notes;

      assert.equal(stats.updated, 2);
      assert.equal(stats.partialUpdated, 2);
      assert.equal(stats.deleted, 1);
      assert.equal(stats.unmodified, 0);
      assert.equal(notes.length, 2);

      // Note 101: front updated, back and extra preserved
      assert.equal(notes[0].front, "Refined Q1");
      assert.equal(notes[0].back, "Original A1");
      assert.equal(notes[0].flds, "Refined Q1\x1fOriginal A1\x1fExtra1");
      assert.equal(notes[0].tags, "tag1");

      // Note 102: back updated, front and extra preserved
      assert.equal(notes[1].front, "Original Q2");
      assert.equal(notes[1].back, "Refined A2");
      assert.equal(notes[1].flds, "Original Q2\x1fRefined A2\x1fExtra2");
    });

    test("reports blocksMissingId when markdown without ### ID headers is merged", () => {
      const mdWithoutIds = exportDeckToLlmMarkdown(
        originalDeck,
        { id: false, question: true, answer: true },
        { includeGuideComment: false },
      );

      const { stats } = mergeLlmMarkdownIntoDeck(originalDeck, mdWithoutIds);
      assert.equal(stats.updated, 0);
      assert.equal(stats.deleted, 0);
      assert.equal(stats.unmodified, 3);
      assert.equal(stats.blocksMissingId, 3);
    });
  });

  describe("chunkLlmMarkdownByTokens", () => {
    test("splits oversized markdown into valid card-aligned chunks ending with ---", () => {
      const notes = Array.from({ length: 4 }, (_, i) => ({
        id: i + 1,
        front: `Question ${i + 1} ${"x".repeat(80)}`,
        back: `Answer ${i + 1} ${"y".repeat(80)}`,
      }));
      const md = exportDeckToLlmMarkdown({ notes }, DEFAULT_LLM_MARKDOWN_FIELDS, {
        includeGuideComment: false,
      });

      const chunks = chunkLlmMarkdownByTokens(md, 60);
      assert.ok(chunks.length >= 2);
      for (const chunk of chunks) {
        assert.ok(chunk.trimEnd().endsWith("---"));
      }
    });
  });
});
