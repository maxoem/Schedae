import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  PARSER_KEYWORDS,
  isFrontKeyword,
  isBackKeyword,
  isCardKeyword,
  isBareFieldLabel,
  isMetadataKeyword,
  isCardHeader,
  CARD_HEADER_REGEX,
  HEADING_FRONT_REGEX,
  HEADING_BACK_REGEX,
  BULLET_FRONT_REGEX,
  BULLET_BACK_REGEX,
  PLAIN_FRONT_REGEX,
  PLAIN_BACK_REGEX,
  BOLD_FRONT_REGEX,
  BOLD_BACK_REGEX,
} from "../keywords";

describe("Multilingual Keywords & Patterns Suite", () => {
  test("All keywords in PARSER_KEYWORDS are in canonical NFC format", () => {
    for (const [category, words] of Object.entries(PARSER_KEYWORDS)) {
      for (const word of words) {
        assert.equal(
          word,
          word.normalize("NFC"),
          `Keyword '${word}' in category '${category}' must be NFC normalized`
        );
      }
    }
  });

  test("isFrontKeyword recognizes multilingual front aliases", () => {
    // English & German
    assert.ok(isFrontKeyword("Front"));
    assert.ok(isFrontKeyword("question"));
    assert.ok(isFrontKeyword("prompt"));
    assert.ok(isFrontKeyword("Frage"));
    assert.ok(isFrontKeyword("Vorderseite"));
    assert.ok(isFrontKeyword("q"));

    // Spanish & Italian
    assert.ok(isFrontKeyword("pregunta"));
    assert.ok(isFrontKeyword("anverso"));
    assert.ok(isFrontKeyword("domanda"));

    // Negative tests
    assert.ok(!isFrontKeyword("random"));
    assert.ok(!isFrontKeyword("answer"));
  });

  test("isBackKeyword recognizes multilingual back aliases", () => {
    // English & German
    assert.ok(isBackKeyword("Back"));
    assert.ok(isBackKeyword("answer"));
    assert.ok(isBackKeyword("solution"));
    assert.ok(isBackKeyword("Antwort"));
    assert.ok(isBackKeyword("Rückseite"));
    assert.ok(isBackKeyword("Lösung"));

    // French
    assert.ok(isBackKeyword("réponse"));

    // Spanish
    assert.ok(isBackKeyword("respuesta"));
    assert.ok(isBackKeyword("solución"));
    assert.ok(isBackKeyword("reverso"));

    // Italian
    assert.ok(isBackKeyword("risposta"));
    assert.ok(isBackKeyword("soluzione"));

    // Handles NFD input transparently
    assert.ok(isBackKeyword("Ru\u0308ckseite"));
    assert.ok(isBackKeyword("re\u0301ponse"));
  });

  test("isMetadataKeyword recognizes multilingual metadata attributes", () => {
    // German
    assert.ok(isMetadataKeyword("Quelle"));
    assert.ok(isMetadataKeyword("Quellen"));
    assert.ok(isMetadataKeyword("Kategorie"));
    assert.ok(isMetadataKeyword("Hinweis"));
    assert.ok(isMetadataKeyword("Notizen"));

    // English
    assert.ok(isMetadataKeyword("Source"));
    assert.ok(isMetadataKeyword("sources"));
    assert.ok(isMetadataKeyword("Tags"));
    assert.ok(isMetadataKeyword("Category"));
    assert.ok(isMetadataKeyword("Notes"));
    assert.ok(isMetadataKeyword("Hint"));

    // French
    assert.ok(isMetadataKeyword("catégorie"));
    assert.ok(isMetadataKeyword("remarques"));
    assert.ok(isMetadataKeyword("références"));

    // Spanish
    assert.ok(isMetadataKeyword("fuente"));
    assert.ok(isMetadataKeyword("categoría"));
    assert.ok(isMetadataKeyword("notas"));
  });

  test("CARD_HEADER_REGEX enforces structural anchors and avoids mathematical false positives", () => {
    // Valid numbered headers
    assert.ok(isCardHeader("Karte 1:"));
    assert.ok(isCardHeader("Karte 1.1"));
    assert.ok(isCardHeader("Card 5"));
    assert.ok(isCardHeader("Carte 3.2:"));
    assert.ok(isCardHeader("Tarjeta 10"));
    assert.ok(isCardHeader("Carta 4:"));

    // Must NOT match natural words or mathematical manifold terms
    assert.ok(!isCardHeader("Karte (Chart)"));
    assert.ok(!isCardHeader("Karte (Chart) \\varphi:"));
    assert.ok(!isCardHeader("Cardholder"));
    assert.ok(!isCardHeader("Cardigan"));
  });

  test("Structural heading detection patterns match multilingual headings", () => {
    assert.ok(HEADING_FRONT_REGEX.test("## Front"));
    assert.ok(HEADING_FRONT_REGEX.test("### Frage"));
    assert.ok(HEADING_FRONT_REGEX.test("# Pregunta"));
    assert.ok(HEADING_FRONT_REGEX.test("## Domanda"));

    assert.ok(HEADING_BACK_REGEX.test("## Back"));
    assert.ok(HEADING_BACK_REGEX.test("## Antwort"));
    assert.ok(HEADING_BACK_REGEX.test("### Rückseite"));
    assert.ok(HEADING_BACK_REGEX.test("## Réponse"));
    assert.ok(HEADING_BACK_REGEX.test("## Respuesta"));
  });

  test("Structural bullet detection patterns match multilingual bullet lists", () => {
    assert.ok(BULLET_FRONT_REGEX.test("* **Vorderseite:** What is X?"));
    assert.ok(BULLET_FRONT_REGEX.test("- **Question:** What is X?"));
    assert.ok(BULLET_FRONT_REGEX.test("* **Pregunta:** ¿Qué es X?"));

    assert.ok(BULLET_BACK_REGEX.test("* **Rückseite:** It is Y."));
    assert.ok(BULLET_BACK_REGEX.test("- **Answer:** It is Y."));
    assert.ok(BULLET_BACK_REGEX.test("* **Réponse:** C'est Y."));
    assert.ok(BULLET_BACK_REGEX.test("- **Respuesta:** Es Y."));
  });

  test("isCardKeyword and isBareFieldLabel detect bare delimiter labels accurately", () => {
    assert.ok(isCardKeyword("Karte"));
    assert.ok(isCardKeyword("Card"));
    assert.ok(!isCardKeyword("Chart"));

    assert.ok(isBareFieldLabel("**Vorderseite:**"));
    assert.ok(isBareFieldLabel("Front:"));
    assert.ok(isBareFieldLabel("### Question"));
    assert.ok(isBareFieldLabel("* **Rückseite:**"));
    assert.ok(!isBareFieldLabel("**Vorderseite:** Was ist eine Topologie?"));
    assert.ok(!isBareFieldLabel("1. Wann nennt man einen topologischen Raum Mannigfaltigkeit?"));
  });
});
