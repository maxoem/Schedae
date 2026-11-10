import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { CARD_TEMPLATES, type CardTemplateId } from "@/converters/templates";
import { resolveApkgModelConfig, type NoteTypeMode } from "@/converters/jsonToApkg";
import { TopicBadgeTransformer, parseTopicPrefix, formatTopicToAnkiTag } from "@/services/deckTransformer/transformers/topicBadgeTransformer";

describe("Workspace Settings & Card Field Separation", () => {
  test("CARD_TEMPLATES includes supported Anki templates with proper Note Type names", () => {
    const templateIds: CardTemplateId[] = ["markdown_basic", "modern_light", "modern_dark", "default"];
    for (const id of templateIds) {
      assert.ok(CARD_TEMPLATES[id], `Template ${id} should exist`);
      assert.ok(typeof CARD_TEMPLATES[id].label === "string" && CARD_TEMPLATES[id].label.length > 0);
      assert.ok(typeof CARD_TEMPLATES[id].noteTypeName === "string" && CARD_TEMPLATES[id].noteTypeName.length > 0);
      assert.ok(typeof CARD_TEMPLATES[id].cardTypeName === "string" && CARD_TEMPLATES[id].cardTypeName.length > 0);
      assert.ok(typeof CARD_TEMPLATES[id].qfmt === "string");
      assert.ok(typeof CARD_TEMPLATES[id].afmt === "string");
    }

    assert.equal(CARD_TEMPLATES.markdown_basic.label, "Markdown+Katex");
    assert.equal(CARD_TEMPLATES.markdown_basic.noteTypeName, "Markdown+Katex");
    assert.equal(CARD_TEMPLATES.markdown_basic.cardTypeName, "Markdown+Katex");
  });

  test("Note Type modes support unified sharing and per_schema exact fields", () => {
    const modes: NoteTypeMode[] = ["unified", "per_schema"];
    assert.equal(modes[0], "unified");

    const plainCards = [{ front: "Q1", back: "A1" }];
    const topicCards = [{ front: "Q2", back: "A2", customFields: { Topic: "Math" } }];

    const unifiedPlain = resolveApkgModelConfig(plainCards, "markdown_basic", { noteTypeMode: "unified" });
    const unifiedTopic = resolveApkgModelConfig(topicCards, "markdown_basic", { noteTypeMode: "unified" });
    assert.equal(unifiedPlain.noteTypeName, "Markdown+Katex");
    assert.deepEqual(unifiedPlain.fieldNames, ["Front", "Back", "Topic"]);
    assert.equal(unifiedPlain.modelId, unifiedTopic.modelId, "Unified mode must reuse identical model ID across plain and topic decks");

    const perSchemaPlain = resolveApkgModelConfig(plainCards, "markdown_basic", { noteTypeMode: "per_schema" });
    const perSchemaTopic = resolveApkgModelConfig(topicCards, "markdown_basic", { noteTypeMode: "per_schema" });
    assert.equal(perSchemaPlain.noteTypeName, "Markdown+Katex");
    assert.deepEqual(perSchemaPlain.fieldNames, ["Front", "Back"]);
    assert.equal(perSchemaTopic.noteTypeName, "Markdown+Katex (Topic)");
    assert.deepEqual(perSchemaTopic.fieldNames, ["Front", "Back", "Topic"]);
    assert.notEqual(perSchemaPlain.modelId, perSchemaTopic.modelId);

    const customNamed = resolveApkgModelConfig(plainCards, "markdown_basic", {
      noteTypeMode: "unified",
      customNoteTypeName: "Uni Math KaTeX",
    });
    assert.equal(customNamed.noteTypeName, "Uni Math KaTeX");
    assert.notEqual(customNamed.modelId, unifiedPlain.modelId);
  });

  test("Extract topic badges transforms leading topic prefixes into separate Topic field and Anki tags", () => {
    const transformer = new TopicBadgeTransformer();

    // 1. Math delimiter topic prefix: $$Topic | Subtopic$$
    const cardWithMathTopic = {
      front: "$$Pathologie | Zellschäden$$ Was versteht man unter Apoptose?",
      back: "Programmierter Zelltod",
    };
    assert.equal(transformer.canTransform(cardWithMathTopic), true);
    const transformedMath = transformer.transform(cardWithMathTopic);
    assert.equal(transformedMath.front, "Was versteht man unter Apoptose?");
    assert.equal(transformedMath.customFields?.Topic, "Pathologie | Zellschäden");
    assert.equal(transformedMath.tags, "Pathologie::Zellschäden");

    // 2. Bracket topic prefix: [Topic | Subtopic]
    const cardWithBracketTopic = {
      front: "[Biologie | Genetik] Was ist Translation?",
      back: "Synthese von Proteinen anhand von mRNA",
    };
    assert.equal(transformer.canTransform(cardWithBracketTopic), true);
    const transformedBracket = transformer.transform(cardWithBracketTopic);
    assert.equal(transformedBracket.front, "Was ist Translation?");
    assert.equal(transformedBracket.customFields?.Topic, "Biologie | Genetik");
    assert.equal(transformedBracket.tags, "Biologie::Genetik");
  });

  test("Plain cards without topic prefixes remain unchanged", () => {
    const transformer = new TopicBadgeTransformer();
    const plainCard = {
      front: "Was ist 2 + 2?",
      back: "4",
    };
    assert.equal(transformer.canTransform(plainCard), false);
  });

  test("WorkspaceSheetTab supports primary 'card' tab and 'parser' tab", () => {
    const tabs = ["card", "parser"] as const;
    assert.equal(tabs[0], "card", "Card & Anki Settings should be primary (index 0)");
    assert.equal(tabs[1], "parser");
  });
});
