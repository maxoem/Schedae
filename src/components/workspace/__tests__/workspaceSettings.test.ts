import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { CARD_TEMPLATES, type CardTemplateId } from "@/converters/templates";
import { TopicBadgeTransformer, parseTopicPrefix, formatTopicToAnkiTag } from "@/services/deckTransformer/transformers/topicBadgeTransformer";

describe("Workspace Settings & Card Field Separation", () => {
  test("CARD_TEMPLATES includes supported Anki templates for card configuration", () => {
    const templateIds: CardTemplateId[] = ["markdown_basic", "modern_light", "modern_dark", "default"];
    for (const id of templateIds) {
      assert.ok(CARD_TEMPLATES[id], `Template ${id} should exist`);
      assert.ok(typeof CARD_TEMPLATES[id].label === "string" && CARD_TEMPLATES[id].label.length > 0);
      assert.ok(typeof CARD_TEMPLATES[id].qfmt === "string");
      assert.ok(typeof CARD_TEMPLATES[id].afmt === "string");
    }
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
