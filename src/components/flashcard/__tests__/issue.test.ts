import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
	extractFlashcardsFromText,
	extractFlashcardsWithMeta,
	PREDEFINED_EXTRACTION_SETS,
	DEFAULT_SPLIT_SETTINGS,
} from "@/services/deckParser/splitSettings";

describe("extractFlashcardsFromText", () => {
	test("removes markdown card titles and label markers from front/back", () => {
		const md1 = `
# Karte 1: XY
## Frage
das ist die erste frage
## Antwort
das ist die erste antwort

# Karte 2: XY
## Frage
das ist die zweite frage
## Antwort
das ist die zweite antwort
`;

		const md2 = `
**Karte 1: XY**
*Frage:* abc
*Antwort:* def

**Karte 2: XY**
*Frage:* abd
*Antwort:* deg
`;

		const headingCards = extractFlashcardsFromText(md1, PREDEFINED_EXTRACTION_SETS[0]);
		assert.deepEqual(headingCards, [
			{
				front: "das ist die erste frage",
				back: "das ist die erste antwort",
			},
			{
				front: "das ist die zweite frage",
				back: "das ist die zweite antwort",
			},
		]);

		const boldItalicCards = extractFlashcardsFromText(md2, PREDEFINED_EXTRACTION_SETS[1]);
		assert.deepEqual(boldItalicCards, [
			{
				front: "abc",
				back: "def",
			},
			{
				front: "abd",
				back: "deg",
			},
		]);
	});

	test("does not falsely split on English prose starting with 'A ' or 'Back ' without a colon", () => {
		const md = `### Question
What is X?
A set X with topology T is called what?
Back in 1920 this was studied.
### Answer
A topological space.`;

		const cards = extractFlashcardsFromText(md, DEFAULT_SPLIT_SETTINGS);
		assert.equal(cards.length, 1);
		assert.ok(cards[0].front.includes("A set X with topology T is called what?"));
		assert.ok(cards[0].front.includes("Back in 1920 this was studied."));
		assert.equal(cards[0].back, "A topological space.");
	});

	test("extractFlashcardsWithMeta distinguishes matched markers from positional fallbacks", () => {
		const md = `### Karte 1

**Vorderseite:**
Was ist X?

**Rückseite:**
Es ist Y.`;

		const mismatched = extractFlashcardsWithMeta(md, {
			...DEFAULT_SPLIT_SETTINGS,
			questionMarkers: "Frage:",
			answerMarkers: "Antwort:",
		});
		assert.equal(mismatched.markerMatchedCards, 0);
		assert.equal(mismatched.positionalFallbackCards, 1);

		const matched = extractFlashcardsWithMeta(md, PREDEFINED_EXTRACTION_SETS[1]);
		assert.equal(matched.markerMatchedCards, 1);
		assert.equal(matched.positionalFallbackCards, 0);
		assert.equal(matched.cards[0].front, "Was ist X?");
		assert.equal(matched.cards[0].back, "Es ist Y.");
	});
});
