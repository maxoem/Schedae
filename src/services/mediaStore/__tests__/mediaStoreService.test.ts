import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  InMemoryMediaStorage,
  MediaStoreService,
  buildMarkdownImageSnippet,
  collectCardsMediaFilenames,
  extractReferencedMediaFilenames,
  parseLocalMediaFilename,
  spliceTextAtSelection,
  stripMediaReferencesFromText,
} from "../index";

describe("Workspace MediaStoreService & Utilities", () => {
  test("parseLocalMediaFilename validates flat local refs and rejects traversal or external URLs", () => {
    assert.equal(parseLocalMediaFilename("media/schedae-123456.png"), "schedae-123456.png");
    assert.equal(parseLocalMediaFilename("  media/diagram.jpg  "), "diagram.jpg");
    assert.equal(parseLocalMediaFilename("media/../secret.png"), null);
    assert.equal(parseLocalMediaFilename("media/nested/img.png"), null);
    assert.equal(parseLocalMediaFilename("https://example.com/img.png"), null);
    assert.equal(parseLocalMediaFilename("blob:http://localhost/123"), null);
  });

  test("storeImageFile hashes and deduplicates identical blobs across pastes", async () => {
    const service = new MediaStoreService(new InMemoryMediaStorage());
    const bytesA = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]);
    const bytesB = new Uint8Array([137, 80, 78, 71, 9, 8, 7, 6]);

    const first = await service.storeImageFile(new Blob([bytesA], { type: "image/png" }), "image.png");
    const duplicate = await service.storeImageFile(new Blob([bytesA], { type: "image/png" }), "screenshot.png");
    const distinct = await service.storeImageFile(new Blob([bytesB], { type: "image/png" }), "image.png");

    assert.equal(first.filename, duplicate.filename);
    assert.equal(first.localRef, `media/${first.filename}`);
    assert.notEqual(first.filename, distinct.filename);

    const all = await service.rehydrate();
    assert.equal(all.length, 2, "Duplicate bytes must reuse existing stored record");
  });

  test("extractReferencedMediaFilenames and collectCardsMediaFilenames inspect cards while ignoring code blocks", () => {
    const markdown = [
      "Look at ![chart](media/schedae-aaa111.png) and `<img src=\"media/ignored-inline.png\">`.",
      "```md",
      "![ignored](media/ignored-fenced.png)",
      "```",
      '<img src="media/schedae-bbb222.webp" alt="diagram">',
    ].join("\n");

    const refs = extractReferencedMediaFilenames(markdown);
    assert.deepEqual(Array.from(refs).sort(), ["schedae-aaa111.png", "schedae-bbb222.webp"]);

    const cardRefs = collectCardsMediaFilenames([
      {
        front: "Q ![q](media/schedae-q1.png)",
        back: "A",
        customFields: {
          Notes: "See ![note](media/schedae-n1.jpg)",
        },
      },
    ]);
    assert.deepEqual(Array.from(cardRefs).sort(), ["schedae-n1.jpg", "schedae-q1.png"]);
  });

  test("pruneUnreferenced retains media used in saved batches even when source draft is cleared", async () => {
    const service = new MediaStoreService(new InMemoryMediaStorage());
    const itemDraft = await service.storeImageFile(new Blob(["draft-bytes"], { type: "image/png" }), "draft.png");
    const itemBatch = await service.storeImageFile(new Blob(["batch-bytes"], { type: "image/png" }), "batch.png");
    const itemUnused = await service.storeImageFile(new Blob(["unused-bytes"], { type: "image/png" }), "unused.png");

    const savedCards = [{ front: `Q ![](${itemBatch.localRef})`, back: "A" }];
    const activeSource = `### Question\n![](${itemDraft.localRef})\n### Answer\nOk`;
    const referenced = new Set([
      ...extractReferencedMediaFilenames(activeSource),
      ...collectCardsMediaFilenames(savedCards),
    ]);

    const pruned = await service.pruneUnreferenced(referenced);
    assert.deepEqual(pruned, [itemUnused.filename]);

    const payloads = await service.getExportPayloads(referenced);
    assert.deepEqual(
      payloads.map((p) => p.filename).sort(),
      [itemBatch.filename, itemDraft.filename].sort(),
    );
  });

  test("spliceTextAtSelection and stripMediaReferencesFromText handle cursor insertion and cleanup", () => {
    const snippet = buildMarkdownImageSnippet("media/schedae-123.png", "diagram");
    assert.equal(snippet, "![diagram](media/schedae-123.png)");

    const spliced = spliceTextAtSelection("### Answer\nSee here: ", snippet, 21, 21);
    assert.equal(spliced.value, "### Answer\nSee here: ![diagram](media/schedae-123.png)");
    assert.equal(spliced.cursorPos, spliced.value.length);

    const appended = spliceTextAtSelection("### Question\nWhat?", snippet);
    assert.equal(appended.value, "### Question\nWhat?\n![diagram](media/schedae-123.png)");

    const stripped = stripMediaReferencesFromText(appended.value, "schedae-123.png");
    assert.equal(stripped.trim(), "### Question\nWhat?");
  });
});
