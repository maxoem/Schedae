import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  TopicBadgeTransformer,
  parseTopicPrefix,
  formatTopicToAnkiTag,
} from "../transformers/topicBadgeTransformer";
import { DeckTransformerService } from "../deckTransformerService";
import { DeckParserService } from "@/services/deckParser/deckParserService";
import { createApkg } from "@/converters/jsonToApkg";
import { apkgConverter } from "@/converters/apkg";
import type { FlashCard } from "@/converters/types";

describe("TopicBadgeTransformer", () => {
  describe("parseTopicPrefix", () => {
    test("detects $$Topic | Subtopic$$", () => {
      const res = parseTopicPrefix("$$Metriken | Regression$$ Wie lautet die mathematische Formel?");
      assert.ok(res);
      assert.equal(res.matchedPrefix, "$$Metriken | Regression$$");
      assert.equal(res.topicText, "Metriken | Regression");
    });

    test("detects `$$Topic | Subtopic$$` wrapped in code backticks", () => {
      const res = parseTopicPrefix("`$$Metriken | Regression$$` Wie lautet die mathematische Formel?");
      assert.ok(res);
      assert.equal(res.topicText, "Metriken | Regression");
    });

    test("detects [Topic | Subtopic]", () => {
      const res = parseTopicPrefix("[Machine Learning | Supervised] Erkläre Overfitting.");
      assert.ok(res);
      assert.equal(res.matchedPrefix, "[Machine Learning | Supervised]");
      assert.equal(res.topicText, "Machine Learning | Supervised");
    });

    test("detects 【Topic】 CJK brackets", () => {
      const res = parseTopicPrefix("【Statistik | Hypothesentests】 Was ist der p-Wert?");
      assert.ok(res);
      assert.equal(res.topicText, "Statistik | Hypothesentests");
    });

    test("ignores actual mathematical equations in $$...$$", () => {
      assert.equal(parseTopicPrefix("$$E = mc^2$$ Was bedeutet diese Gleichung?"), null);
      assert.equal(parseTopicPrefix("$$\\int_0^1 x^2 dx = \\frac{1}{3}$$ Berechne das Integral."), null);
      assert.equal(parseTopicPrefix("$$f(x) = 2x + 1$$ Finde die Ableitung."), null);
    });

    test("ignores citations and checkboxes in [...]", () => {
      assert.equal(parseTopicPrefix("[1] Laut Quelle ist dies korrekt."), null);
      assert.equal(parseTopicPrefix("[1, 2, 3] Mehrere Belege."), null);
      assert.equal(parseTopicPrefix("[x] Abgehakt"), null);
      assert.equal(parseTopicPrefix("[ ] Offen"), null);
    });
  });

  describe("formatTopicToAnkiTag", () => {
    test("formats pipe separated topic to Anki hierarchical tag", () => {
      assert.equal(formatTopicToAnkiTag("Metriken | Regression"), "Metriken::Regression");
    });

    test("handles multiple levels and spaces", () => {
      assert.equal(
        formatTopicToAnkiTag("Machine Learning / Deep Learning / Neural Networks"),
        "Machine_Learning::Deep_Learning::Neural_Networks"
      );
    });

    test("handles greater-than and colon separators", () => {
      assert.equal(formatTopicToAnkiTag("Informatik > Algorithmen :: Sortieren"), "Informatik::Algorithmen::Sortieren");
    });
  });

  describe("TopicBadgeTransformer end-to-end", () => {
    const transformer = new TopicBadgeTransformer();

    test("transforms card with $$Metriken | Regression$$ prefix", () => {
      const card: FlashCard = {
        front: "$$Metriken | Regression$$ Wie lautet die Formel des MSE?",
        back: "MSE = \\frac{1}{n} \\sum (y - \\hat{y})^2",
      };

      assert.equal(transformer.canTransform(card), true);

      const transformed = transformer.transform(card);
      assert.equal(transformed.front, "Wie lautet die Formel des MSE?");
      assert.equal(transformed.customFields?.Topic, "Metriken | Regression");
      assert.equal(transformed.tags, "Metriken::Regression");
    });

    test("preserves existing custom fields and existing tags", () => {
      const card: FlashCard = {
        front: "[Statistik | Normalverteilung] Was ist sigma?",
        back: "Die Standardabweichung.",
        customFields: { Quelle: "Buch A" },
        tags: "klausur_2025",
      };

      const transformed = transformer.transform(card);
      assert.equal(transformed.front, "Was ist sigma?");
      assert.equal(transformed.customFields?.Quelle, "Buch A");
      assert.equal(transformed.customFields?.Topic, "Statistik | Normalverteilung");
      assert.equal(transformed.tags, "klausur_2025 Statistik::Normalverteilung");
    });
  });

  describe("DeckTransformerService card-level integration & opt-out", () => {
    const service = new DeckTransformerService();

    test("transforms cards when extractTopicBadges is enabled (default)", () => {
      const cards: FlashCard[] = [
        {
          front: "$$Metriken | Regression$$ Was ist MSE?",
          back: "Mean Squared Error",
        },
      ];

      const res = service.transformCards(cards);
      assert.equal(res[0].front, "Was ist MSE?");
      assert.equal(res[0].customFields?.Topic, "Metriken | Regression");
      assert.equal(res[0].tags, "Metriken::Regression");
    });

    test("skips transformation when extractTopicBadges is explicitly disabled", () => {
      const cards: FlashCard[] = [
        {
          front: "$$Metriken | Regression$$ Was ist MSE?",
          back: "Mean Squared Error",
        },
      ];

      const res = service.transformCards(cards, {
        cleanListBullets: true,
        normalizeMath: true,
        htmlToMarkdown: true,
        stripFieldLabels: true,
        normalizeWhitespace: true,
        extractTopicBadges: false,
        targetTemplate: "markdown_basic",
      });

      assert.equal(res[0].front, "$$Metriken | Regression$$ Was ist MSE?");
      assert.equal(res[0].customFields?.Topic, undefined);
    });
  });

  describe("End-to-End User Input Parsing & APKG Export", () => {
    test("correctly parses user input with extractTopicBadges enabled", () => {
      const input = `* **Vorderseite:** $$Metriken | Regression$$ Wie lautet die mathematische Formel des **Mean Squared Error (MSE)**, wie wird er geometrisch interpretiert und welche Konsequenz hat die Quadrierung auf Ausreißer?
* **Rückseite:** Die Formel lautet: $$MSE = \\frac{1}{n} \\sum_{i=1}^n (y_i - \\hat{y}_i)^2$$`;

      const result = DeckParserService.parse(input, { extractTopicBadges: true });
      assert.equal(result.success, true);
      assert.equal(result.cards.length, 1);

      const card = result.cards[0];
      assert.equal(
        card.front,
        "Wie lautet die mathematische Formel des **Mean Squared Error (MSE)**, wie wird er geometrisch interpretiert und welche Konsequenz hat die Quadrierung auf Ausreißer?"
      );
      assert.equal(card.customFields?.Topic, "Metriken | Regression");
      assert.equal(card.tags, "Metriken::Regression");
    });

    test("exports card with Topic badge and tags into native APKG", async () => {
      const card: FlashCard = {
        front: "Wie lautet die Formel des MSE?",
        back: "MSE = ...",
        customFields: { Topic: "Metriken | Regression" },
        tags: "Metriken::Regression",
      };

      const blob = await createApkg([card], "ML Metrics Deck", "markdown_basic");
      const arrayBuffer = await blob.arrayBuffer();
      assert.ok(arrayBuffer.byteLength > 0);

      const decoded = await apkgConverter.convert(arrayBuffer, "test.apkg");
      assert.equal(decoded.cards.length, 1);
      assert.ok(decoded.cards[0].front.includes('<div class="card-topic-badge">Metriken | Regression</div>'));
      assert.ok(decoded.cards[0].front.includes("Wie lautet die Formel des MSE?"));
      assert.equal(decoded.cards[0].customFields?.Topic, "Metriken | Regression");
    });
  });
});
