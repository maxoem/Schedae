import {
  type SplitSettings,
  type RegexExtractionOutput,
  PREDEFINED_EXTRACTION_SETS,
  CANONICAL_SPLIT_SETTINGS,
  extractFlashcardsWithMeta,
} from "../splitSettings";
import { isBareFieldLabel } from "../keywords";
import type { ExtractorOptions, ExtractorResult, ExtractorStrategy, DiagnosticIssue } from "../types";

export class RegexExtractor implements ExtractorStrategy {
  readonly id = "regex";
  readonly label = "Delimited Markdown / Q&A";

  canExtract(text: string): boolean {
    return text.trim().length > 0;
  }

  extract(text: string, options: ExtractorOptions): ExtractorResult {
    const diagnostics: DiagnosticIssue[] = [];
    const activeSettings = options.splitSettings || CANONICAL_SPLIT_SETTINGS;

    // Prioritize activeSettings (explicit selection or canonical default) first
    let bestOutput: RegexExtractionOutput = {
      cards: [],
      markerMatchedCards: 0,
      positionalFallbackCards: 0,
    };
    let bestSettings: SplitSettings = activeSettings;

    try {
      bestOutput = extractFlashcardsWithMeta(text, activeSettings);
    } catch {
      // Ignore regex failure in activeSettings
    }

    // Fall back when activeSettings yielded 0 cards OR failed to match any Q/A markers
    // (pure positional fallback risks keeping bare keyword labels like "**Vorderseite:**" inside front/back).
    if (bestOutput.cards.length === 0 || bestOutput.markerMatchedCards === 0) {
      const candidates = [CANONICAL_SPLIT_SETTINGS, ...PREDEFINED_EXTRACTION_SETS];
      for (const candidate of candidates) {
        if (candidate.id && candidate.id === activeSettings.id) continue;
        try {
          const output = extractFlashcardsWithMeta(text, candidate);
          const isBetterMatch =
            output.markerMatchedCards > bestOutput.markerMatchedCards ||
            (output.markerMatchedCards === bestOutput.markerMatchedCards &&
              output.cards.length > bestOutput.cards.length);

          if (isBetterMatch) {
            bestOutput = output;
            bestSettings = candidate;
          }
        } catch {
          // Ignore regex failure in candidate
        }
      }
    }

    const bestExtracted = bestOutput.cards;

    if (bestExtracted.length === 0) {
      diagnostics.push({
        id: "regex-no-match",
        level: "warning",
        message: "No flashcards found. Try standard '### Question' and '### Answer' headings or adjust separators in Parser Tuning.",
      });
      return {
        cards: [],
        matchedStrategy: this.id,
        diagnostics,
        usedSettings: activeSettings,
      };
    }

    if (bestOutput.markerMatchedCards === 0 && bestOutput.positionalFallbackCards > 0) {
      diagnostics.push({
        id: "regex-positional-fallback",
        level: "info",
        message: "No explicit Question/Answer markers matched; cards were split by block position.",
      });
    }

    // Perform quality checks on extracted cards
    bestExtracted.forEach((card, index) => {
      const front = card.front.trim();
      const back = card.back.trim();

      if (!front) {
        diagnostics.push({
          id: `card-${index}-empty-front`,
          level: "warning",
          message: `Card #${index + 1} has an empty question (front).`,
          cardIndex: index,
        });
      } else if (isBareFieldLabel(front)) {
        diagnostics.push({
          id: `card-${index}-bare-label-front`,
          level: "warning",
          message: `Card #${index + 1} front contains only a field label ('${front}').`,
          cardIndex: index,
        });
      }
      if (!back) {
        diagnostics.push({
          id: `card-${index}-empty-back`,
          level: "warning",
          message: `Card #${index + 1} has an empty answer (back).`,
          cardIndex: index,
        });
      }

      // Check for unclosed KaTeX math delimiters ($ or $$)
      const singleDollarCount = (front.match(/(?<!\\)\$/g) || []).length;
      if (singleDollarCount % 2 !== 0) {
        diagnostics.push({
          id: `card-${index}-unclosed-latex`,
          level: "info",
          message: `Card #${index + 1} may have an unclosed LaTeX math '$' delimiter.`,
          cardIndex: index,
        });
      }
    });

    return {
      cards: bestExtracted,
      matchedStrategy: this.id,
      diagnostics,
      usedSettings: bestSettings,
    };
  }
}
