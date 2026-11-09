import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DeckParserService } from "../deckParserService";
import { KeyValueExtractor } from "../extractors/keyValueExtractor";
import { FormatDetector } from "../heuristics/formatDetector";

describe("Umlaut NFD vs NFC Normalization Suite", () => {
  const fixturePathNFD = path.resolve(
    process.cwd(),
    "src/services/deckParser/__tests__/fixtures/07-bulletpoint-format2/input.md"
  );
  const fixturePathNFC = path.resolve(
    process.cwd(),
    "src/services/deckParser/__tests__/fixtures/08-bulletpoint-format2-nfc/input.md"
  );

  const rawNFD = fs.readFileSync(fixturePathNFD, "utf-8");
  const rawNFC = fs.readFileSync(fixturePathNFC, "utf-8");

  test("Fixtures verify expected character encoding (NFD vs NFC)", () => {
    // NFD has combining diaeresis (u + \u0308)
    assert.ok(/Ru\u0308ckseite/.test(rawNFD), "07-bulletpoint-format2 must contain NFD 'Rückseite'");
    assert.ok(!/R\u00fcckseite/.test(rawNFD), "07-bulletpoint-format2 must not contain NFC 'Rückseite'");

    // NFC has precomposed character (\u00fc)
    assert.ok(/R\u00fcckseite/.test(rawNFC), "08-bulletpoint-format2-nfc must contain NFC 'Rückseite'");
    assert.ok(!/Ru\u0308ckseite/.test(rawNFC), "08-bulletpoint-format2-nfc must not contain NFD 'Rückseite'");
  });

  test("FormatDetector classifies both NFD and NFC input as bold-italic with high confidence", () => {
    const detectNFD = FormatDetector.detect(rawNFD);
    const detectNFC = FormatDetector.detect(rawNFC);

    assert.equal(detectNFD.patternId, "bold-italic");
    assert.equal(detectNFC.patternId, "bold-italic");
    assert.ok(detectNFD.confidence >= 0.9);
    assert.ok(detectNFC.confidence >= 0.9);
  });

  test("DeckParserService handles NFD and NFC inputs identically end-to-end", () => {
    const resultNFD = DeckParserService.parse(rawNFD);
    const resultNFC = DeckParserService.parse(rawNFC);

    // Both must succeed
    assert.equal(resultNFD.success, true, "NFD parse should succeed");
    assert.equal(resultNFC.success, true, "NFC parse should succeed");

    // Both must extract exactly 2 cards
    assert.equal(resultNFD.cards.length, 2, "NFD must yield 2 cards");
    assert.equal(resultNFC.cards.length, 2, "NFC must yield 2 cards");

    // Neither should have empty Front or Back
    assert.ok(resultNFC.cards[0].front.trim().length > 0, "Card 1 front must not be empty in NFC");
    assert.ok(resultNFC.cards[0].back.trim().length > 0, "Card 1 back must not be empty in NFC");
    assert.ok(resultNFC.cards[1].front.trim().length > 0, "Card 2 front must not be empty in NFC");
    assert.ok(resultNFC.cards[1].back.trim().length > 0, "Card 2 back must not be empty in NFC");

    // Check content semantics
    assert.ok(resultNFC.cards[0].front.includes("Topologie"));
    assert.ok(resultNFC.cards[0].back.includes("Potenzmenge"));
    assert.ok(resultNFC.cards[1].front.includes("metrischer Raum"));
    assert.ok(resultNFC.cards[1].back.includes("Distanzfunktion (Metrik)"));

    // Ensure diagnostics do not report empty front warnings
    const emptyFrontWarning = resultNFC.diagnostics.find((d) => d.id.includes("no-front"));
    assert.equal(emptyFrontWarning, undefined, "NFC should not produce empty Front diagnostic warnings");

    // Both strategies and formats must be identical
    assert.equal(resultNFC.usedStrategyId, resultNFD.usedStrategyId);
    assert.equal(resultNFC.detectedFormat, resultNFD.detectedFormat);
  });
});
