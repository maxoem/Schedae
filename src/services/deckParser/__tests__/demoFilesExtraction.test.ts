import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DeckParserService } from "../deckParserService";
import { MarkdownSectionsExtractor } from "../extractors/markdownSectionsExtractor";
import { KeyValueExtractor } from "../extractors/keyValueExtractor";
import { JsonExtractor } from "../extractors/jsonExtractor";
import { FormatDetector } from "../heuristics/formatDetector";

// Resolve paths to the demo files (check src/data first, fallback to test data)
function loadDemoFile(filename: string): string {
  const primaryPath = path.resolve(process.cwd(), "src/data", filename);
  const fallbackPath = path.resolve(process.cwd(), "src/services/deckParser/__tests__/data", filename);
  const targetPath = fs.existsSync(primaryPath) ? primaryPath : fallbackPath;
  return fs.readFileSync(targetPath, "utf-8");
}

describe("Demo Markdown Files Extraction Verification", () => {
  const headerContent = loadDemoFile("header-format.md");
  const header2Content = loadDemoFile("header-format2.md");
  const bulletContent = loadDemoFile("bulletpoint-format.md");
  const bullet2Content = loadDemoFile("bulletpoint-format2.md");

  describe("header-format.md (# Karte / ## Frage / ## Antwort)", () => {
    test("MarkdownSectionsExtractor canExtract identifies the format", () => {
      const extractor = new MarkdownSectionsExtractor();
      assert.equal(extractor.canExtract(headerContent), true);
    });

    test("MarkdownSectionsExtractor extracts all 14 cards accurately", () => {
      const extractor = new MarkdownSectionsExtractor();
      const result = extractor.extract(headerContent, {});

      assert.equal(result.cards.length, 14, "Expected exactly 14 flashcards from header-format.md");

      // Verify Card 1
      const card1 = result.cards[0];
      assert.ok(card1.front.includes("basale"), "Card 1 front should mention basale Überzeugungen");
      assert.ok(card1.front.includes("nicht-basale Überzeugungen"));
      assert.ok(card1.back.includes("Fundamentalismus"));
      assert.ok(card1.back.includes("Basale Überzeugungen"));
      assert.ok(card1.back.includes("Nicht-basale Überzeugungen"));

      // Verify Card 14 (last card)
      const card14 = result.cards[13];
      assert.ok(card14.front.length > 10, "Card 14 should have a non-empty question");
      assert.ok(card14.back.length > 10, "Card 14 should have a non-empty answer");
    });

    test("FormatDetector classifies header-format.md with high confidence", () => {
      const detection = FormatDetector.detect(headerContent);
      assert.equal(detection.patternId, "markdown-sections");
      assert.ok(detection.confidence >= 0.95);
    });

    test("DeckParserService (Auto-Detect Default) parses header-format.md end-to-end", () => {
      const result = DeckParserService.parse(headerContent);
      assert.equal(result.success, true);
      assert.equal(result.cards.length, 14);
      assert.equal(result.usedStrategyId, "markdown-sections");
    });
  });

  describe("header-format2.md (# Karte / ## Vorderseite / ## **Rückseite:**)", () => {
    test("MarkdownSectionsExtractor canExtract identifies the format", () => {
      const extractor = new MarkdownSectionsExtractor();
      assert.equal(extractor.canExtract(header2Content), true);
    });

    test("MarkdownSectionsExtractor extracts all 2 cards accurately", () => {
      const extractor = new MarkdownSectionsExtractor();
      const result = extractor.extract(header2Content, {});

      assert.equal(result.cards.length, 2, "Expected exactly 2 flashcards from header-format2.md");

      // Verify Card 1 (Topologischer Raum / Topologie)
      const card1 = result.cards[0];
      assert.ok(card1.front.includes("Topologie"), "Card 1 front should mention Topologie");
      assert.ok(card1.front.includes("topologischen Raum"));
      assert.ok(card1.back.includes("Potenzmenge"));
      assert.ok(card1.back.includes("Leere Menge und Gesamtmenge"));
      assert.ok(card1.back.includes("Abgeschlossenheit unter endlichen Schnitten"));

      // Verify Card 2 (Metrischer Raum)
      const card2 = result.cards[1];
      assert.ok(card2.front.includes("metrischer Raum"), "Card 2 front should ask about metrischer Raum");
      assert.ok(card2.back.includes("Distanzfunktion (Metrik)"));
      assert.ok(card2.back.includes("Mathematischer Hinweis zur"));
    });

    test("FormatDetector classifies header-format2.md with high confidence", () => {
      const detection = FormatDetector.detect(header2Content);
      assert.equal(detection.patternId, "markdown-sections");
      assert.ok(detection.confidence >= 0.95);
    });

    test("DeckParserService (Auto-Detect Default) parses header-format2.md end-to-end", () => {
      const result = DeckParserService.parse(header2Content);
      assert.equal(result.success, true);
      assert.equal(result.cards.length, 2);
      assert.equal(result.usedStrategyId, "markdown-sections");
      assert.equal(result.detectedFormat, "markdown-headings");
    });
  });

  describe("bulletpoint-format.md (* **Vorderseite:** / * **Rückseite:** / * **Quelle(n):**)", () => {
    test("KeyValueExtractor canExtract identifies bullet key-value format", () => {
      const extractor = new KeyValueExtractor();
      assert.equal(extractor.canExtract(bulletContent), true);
    });

    test("KeyValueExtractor extracts all 16 cards with custom Quelle(n) field", () => {
      const extractor = new KeyValueExtractor();
      const result = extractor.extract(bulletContent, {});

      assert.equal(result.cards.length, 16, "Expected exactly 16 flashcards from bulletpoint-format.md");

      // Verify Card 1 (Universelle Lerndefinition nach Mitchell)
      const card1 = result.cards[0];
      assert.ok(card1.front.includes("Tom Mitchell"), "Card 1 front should ask about Mitchell lerndefinition");
      assert.ok(card1.back.includes("[Formale Struktur]"), "Card 1 back should retain Formale Struktur bullet");
      assert.ok(card1.back.includes("[Semantischer Kern]"), "Card 1 back should retain Semantischer Kern bullet");
      assert.ok(card1.back.includes("[Transfer-Indikator]"), "Card 1 back should retain Transfer-Indikator bullet");
      assert.ok(card1.customFields, "Card 1 must have customFields");
      assert.ok(card1.customFields["Quelle(n)"], "Card 1 must include custom field 'Quelle(n)'");
      assert.ok(card1.customFields["Quelle(n)"].includes("Goodfellow et al."), "Quelle(n) should reference Goodfellow");

      // Verify Card 16 (Bias-Variance Tradeoff)
      const card16 = result.cards[15];
      assert.ok(card16.front.includes("Bias") && card16.front.includes("Variance"), "Card 16 should cover Bias and Variance");
      assert.ok(card16.back.includes("Bias"), "Card 16 back should explain Bias and Variance");
      assert.ok(card16.customFields?.["Quelle(n)"], "Card 16 must have Quelle(n) field");
    });

    test("FormatDetector classifies bulletpoint-format.md with custom fields flag", () => {
      const detection = FormatDetector.detect(bulletContent);
      assert.equal(detection.patternId, "bullet-list");
      assert.equal(detection.hasCustomFields, true);
      assert.ok(detection.confidence >= 0.9);
    });

    test("DeckParserService (Auto-Detect Default) parses bulletpoint-format.md end-to-end", () => {
      const result = DeckParserService.parse(bulletContent);
      assert.equal(result.success, true);
      assert.equal(result.cards.length, 16);
      assert.equal(result.usedStrategyId, "key-value");
      assert.equal(result.detectedFormat, "markdown-sections");
      assert.ok(result.cards.every((c) => c.customFields && Boolean(c.customFields["Quelle(n)"])));
    });
  });

  describe("bulletpoint-format2.md (### Karte / **Vorderseite:** / **Rückseite:**)", () => {
    test("FormatDetector classifies bulletpoint-format2.md as bold-italic", () => {
      const detection = FormatDetector.detect(bullet2Content);
      assert.equal(detection.patternId, "bold-italic");
      assert.ok(detection.confidence >= 0.9);
    });

    test("DeckParserService (Auto-Detect Default) parses bulletpoint-format2.md end-to-end", () => {
      const result = DeckParserService.parse(bullet2Content);
      assert.equal(result.success, true);
      assert.equal(result.cards.length, 2);
      assert.equal(result.usedStrategyId, "regex");
      assert.equal(result.detectedFormat, "custom-delimiters");

      // Verify Card 1
      const card1 = result.cards[0];
      assert.ok(card1.front.includes("Topologie"), "Card 1 front should mention Topologie");
      assert.ok(card1.front.includes("topologischen Raum"));
      assert.ok(card1.back.includes("Potenzmenge"));
      assert.ok(card1.back.includes("Leere Menge und Gesamtmenge"));
      assert.ok(!card1.back.includes("**Rückseite:**") && !card1.back.includes("**Rückseite:**"), "Back should not contain marker");

      // Verify Card 2
      const card2 = result.cards[1];
      assert.ok(card2.front.includes("metrischer Raum"), "Card 2 front should ask about metrischer Raum");
      assert.ok(card2.back.includes("Distanzfunktion (Metrik)"));
      assert.ok(card2.back.includes("Mathematischer Hinweis zur"));
      assert.ok(!card2.back.includes("**Rückseite:**") && !card2.back.includes("**Rückseite:**"), "Back should not contain marker");
    });
  });

  describe("Cross-Extractor Invariance & Robustness", () => {
    test("JsonExtractor canExtract correctly rejects markdown files", () => {
      const jsonExt = new JsonExtractor();
      assert.equal(jsonExt.canExtract(headerContent), false);
      assert.equal(jsonExt.canExtract(bulletContent), false);
    });

    test("MarkdownSectionsExtractor canExtract correctly rejects purely bullet-formatted text", () => {
      const secExt = new MarkdownSectionsExtractor();
      // bulletpoint-format.md uses * **Vorderseite:**, not ## Vorderseite
      assert.equal(secExt.canExtract(bulletContent), false);
    });
  });
});
