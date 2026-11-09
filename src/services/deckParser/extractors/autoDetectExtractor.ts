import type { ExtractorOptions, ExtractorResult, ExtractorStrategy } from "../types";
import { FormatDetector } from "../heuristics/formatDetector";
import { JsonExtractor } from "./jsonExtractor";
import { MarkdownSectionsExtractor } from "./markdownSectionsExtractor";
import { KeyValueExtractor } from "./keyValueExtractor";
import { StencilExtractor } from "./stencilExtractor";
import { RegexExtractor } from "./regexExtractor";

/**
 * AutoDetectExtractor implements ExtractorStrategy to heuristically inspect
 * input text (especially Card 1) and dispatch extraction to the optimal specialized extractor.
 */
export class AutoDetectExtractor implements ExtractorStrategy {
  public readonly id = "auto";
  public readonly label = "✨ Auto-Detect Format";

  private jsonExtractor: JsonExtractor;
  private markdownSectionsExtractor: MarkdownSectionsExtractor;
  private keyValueExtractor: KeyValueExtractor;
  private stencilExtractor: StencilExtractor;
  private regexExtractor: RegexExtractor;

  constructor(options?: {
    jsonExtractor?: JsonExtractor;
    markdownSectionsExtractor?: MarkdownSectionsExtractor;
    keyValueExtractor?: KeyValueExtractor;
    stencilExtractor?: StencilExtractor;
    regexExtractor?: RegexExtractor;
  }) {
    this.jsonExtractor = options?.jsonExtractor ?? new JsonExtractor();
    this.markdownSectionsExtractor = options?.markdownSectionsExtractor ?? new MarkdownSectionsExtractor();
    this.keyValueExtractor = options?.keyValueExtractor ?? new KeyValueExtractor();
    this.stencilExtractor = options?.stencilExtractor ?? new StencilExtractor();
    this.regexExtractor = options?.regexExtractor ?? new RegexExtractor();
  }

  /**
   * AutoDetect can handle any non-empty input.
   */
  public canExtract(text: string): boolean {
    return text.trim().length > 0;
  }

  /**
   * Runs the format heuristic detector and invokes the matching extractor.
   */
  public extract(text: string, options: ExtractorOptions = {}): ExtractorResult {
    // 1. Check if input is JSON
    if (this.jsonExtractor.canExtract(text)) {
      const res = this.jsonExtractor.extract(text, options);
      if (res.cards.length > 0) return res;
    }

    // 2. Check if AI Stencil heuristic is explicitly requested
    if (options.parserMode === "heuristic" && options.aiStencil) {
      const res = this.stencilExtractor.extract(text, options);
      if (res.cards.length > 0) return res;
    }

    // 3. Inspect structure with FormatDetector
    const heuristic = FormatDetector.detect(text);

    // 4. Prioritize candidate extractors based on detected pattern heuristic
    const prioritizedExtractors: ExtractorStrategy[] = [];

    switch (heuristic.patternId) {
      case "json":
        prioritizedExtractors.push(this.jsonExtractor);
        break;
      case "markdown-sections":
      case "markdown-headings":
        prioritizedExtractors.push(this.markdownSectionsExtractor);
        break;
      case "bullet-list":
        prioritizedExtractors.push(this.keyValueExtractor);
        break;
      case "bold-italic":
      case "generic-qa":
        prioritizedExtractors.push(this.regexExtractor);
        break;
    }

    // Append remaining extractors as fallback cascade
    const fallbackChain: ExtractorStrategy[] = [
      this.markdownSectionsExtractor,
      this.keyValueExtractor,
      this.regexExtractor,
    ];

    for (const extractor of fallbackChain) {
      if (!prioritizedExtractors.includes(extractor)) {
        prioritizedExtractors.push(extractor);
      }
    }

    // Try extractors in prioritized order
    for (const extractor of prioritizedExtractors) {
      if (extractor.canExtract(text)) {
        const res = extractor.extract(text, options);
        if (res.cards.length > 0) return res;
      }
    }

    // 7. No cards extracted
    return {
      cards: [],
      matchedStrategy: "auto",
      diagnostics: [
        {
          id: "no-cards-detected",
          level: "info",
          message: `Auto-detection completed (pattern: ${heuristic.patternId}), but no valid flashcards could be parsed.`,
        },
      ],
    };
  }
}
