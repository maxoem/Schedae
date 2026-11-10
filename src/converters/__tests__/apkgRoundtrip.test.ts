import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createApkg, createApkgFromAnkiJson } from "../jsonToApkg";
import { apkgConverter, decodeApkgRaw } from "../apkg";
import type { FlashCard } from "../types";

describe("APKG Binary Round-Trip Verification", () => {
  const cards: FlashCard[] = [
    {
      front: "What is Fermat's Little Theorem?",
      back: "If $p$ is a prime and $a$ is an integer not divisible by $p$, then:\n\n$$a^{p-1} \\equiv 1 \\pmod{p}$$",
      customFields: {
        "Category": "Number Theory",
        "Quelle": "Hardy & Wright",
      },
    },
    {
      front: "What is Bayes' Theorem?",
      back: "P(A|B) = \\frac{P(B|A) P(A)}{P(B)}",
    },
  ];

  test("cards -> createApkg -> apkgConverter.convert preserves card content and structure", async () => {
    const deckName = "Test Mathematics Deck";
    const blob = await createApkg(cards, deckName, "markdown_basic");
    const arrayBuffer = await blob.arrayBuffer();

    assert.ok(arrayBuffer.byteLength > 0, "Generated APKG buffer must not be empty");

    const result = await apkgConverter.convert(arrayBuffer, `${deckName}.apkg`);

    assert.equal(result.cards.length, cards.length, "Decoded card count must match original");

    // Check front and back content
    assert.ok(result.cards[0].front.includes("Fermat's Little Theorem"));
    assert.ok(result.cards[0].back.includes("a^{p-1}"));
    assert.ok(result.cards[1].front.includes("Bayes' Theorem"));
    assert.ok(result.cards[1].back.includes("P(A|B)"));

    // Check custom fields
    assert.ok(result.cards[0].customFields, "Card 1 must retain customFields");
    assert.equal(result.cards[0].customFields?.["Category"], "Number Theory");
    assert.equal(result.cards[0].customFields?.["Quelle"], "Hardy & Wright");
  });

  test("unified mode exports Markdown+Katex with stable modelId across plain and Topic decks", async () => {
    const plainBlob = await createApkg([{ front: "Q1", back: "A1" }], "Deck One", "markdown_basic", undefined, {
      noteTypeMode: "unified",
    });
    const topicBlob = await createApkg(
      [{ front: "Q2", back: "A2", customFields: { Topic: "Math | Algebra" } }],
      "Deck Two",
      "markdown_basic",
      undefined,
      { noteTypeMode: "unified" },
    );

    const rawPlain = await decodeApkgRaw(await plainBlob.arrayBuffer(), "reduced", ["mid"]);
    const rawTopic = await decodeApkgRaw(await topicBlob.arrayBuffer(), "reduced", ["mid"]);

    const plainModelIds = Object.keys(rawPlain.models);
    const topicModelIds = Object.keys(rawTopic.models);
    assert.equal(plainModelIds.length, 1);
    assert.equal(plainModelIds[0], topicModelIds[0], "Both decks should share the exact same model ID");

    const model = rawPlain.models[plainModelIds[0]];
    assert.equal(model.name, "Markdown+Katex");
    assert.equal(model.tmpls[0].name, "Markdown+Katex");
    assert.deepEqual(
      model.flds.map((f: { name: string }) => f.name),
      ["Front", "Back", "Topic"],
    );
  });

  test("per_schema mode separates plain and Topic Note Types cleanly with deterministic IDs", async () => {
    const plainBlob1 = await createApkg([{ front: "Q1", back: "A1" }], "Plain 1", "markdown_basic", undefined, {
      noteTypeMode: "per_schema",
    });
    const plainBlob2 = await createApkg([{ front: "Q2", back: "A2" }], "Plain 2", "markdown_basic", undefined, {
      noteTypeMode: "per_schema",
    });
    const topicBlob = await createApkg(
      [{ front: "Q3", back: "A3", customFields: { Topic: "Physics" } }],
      "Topic Deck",
      "markdown_basic",
      undefined,
      { noteTypeMode: "per_schema" },
    );

    const rawPlain1 = await decodeApkgRaw(await plainBlob1.arrayBuffer(), "reduced");
    const rawPlain2 = await decodeApkgRaw(await plainBlob2.arrayBuffer(), "reduced");
    const rawTopic = await decodeApkgRaw(await topicBlob.arrayBuffer(), "reduced");

    const plainMid1 = Object.keys(rawPlain1.models)[0];
    const plainMid2 = Object.keys(rawPlain2.models)[0];
    const topicMid = Object.keys(rawTopic.models)[0];

    assert.equal(plainMid1, plainMid2, "Matching per_schema decks must reuse the same model ID");
    assert.notEqual(plainMid1, topicMid);
    assert.equal(rawPlain1.models[plainMid1].name, "Markdown+Katex");
    assert.deepEqual(
      rawPlain1.models[plainMid1].flds.map((f: { name: string }) => f.name),
      ["Front", "Back"],
    );
    assert.equal(rawTopic.models[topicMid].name, "Markdown+Katex (Topic)");
    assert.deepEqual(
      rawTopic.models[topicMid].flds.map((f: { name: string }) => f.name),
      ["Front", "Back", "Topic"],
    );
  });

  test("createApkgFromAnkiJson normalizes loadModelsNew metadata and avoids Basic-<timestamp>", async () => {
    const ankiJson = {
      models: {
        "999000111222": {
          name: "Basic",
          fieldNames: ["Front", "Back"],
          templates: [{ name: "Card 1", qfmt: "{{Front}}", afmt: "{{FrontSide}}<hr id=answer>{{Back}}", ord: 0 }],
          css: "",
        },
      },
      notes: [
        {
          id: 1,
          guid: "abc123",
          mid: 999000111222,
          front: "What is 2+2?",
          back: "4",
          cards: [{ id: 10, ord: 0, did: 1 }],
        },
      ],
    };

    const blob = await createApkgFromAnkiJson(ankiJson, "Remastered Test", "markdown_basic", {
      regenerateIds: true,
    });
    const raw = await decodeApkgRaw(await blob.arrayBuffer(), "reduced", ["mid"]);
    const modelIds = Object.keys(raw.models);
    assert.equal(modelIds.length, 1);

    const model = raw.models[modelIds[0]];
    assert.equal(model.name, "Markdown+Katex");
    assert.equal(model.tmpls[0].name, "Markdown+Katex");
    assert.ok(!/^Basic-\d+/.test(model.name), "Must not emit Basic-<timestamp>");

    // Should match per_schema 2-field Markdown+Katex modelId
    const directPlain = await createApkg([{ front: "Q", back: "A" }], "Direct", "markdown_basic", undefined, {
      noteTypeMode: "per_schema",
    });
    const rawDirect = await decodeApkgRaw(await directPlain.arrayBuffer(), "reduced");
    assert.equal(modelIds[0], Object.keys(rawDirect.models)[0]);
  });
});
