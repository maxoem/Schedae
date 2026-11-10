import { JsonExtractor } from "./extractors/jsonExtractor";
import { MarkdownSectionsExtractor } from "./extractors/markdownSectionsExtractor";
import { KeyValueExtractor } from "./extractors/keyValueExtractor";
import { StencilExtractor } from "./extractors/stencilExtractor";
import { RegexExtractor } from "./extractors/regexExtractor";
import { AutoDetectExtractor } from "./extractors/autoDetectExtractor";
import { FormatDetector, type FormatHeuristicResult } from "./heuristics/formatDetector";
import { FRONT_KEYWORDS_PATTERN, CARD_KEYWORDS_PATTERN } from "./keywords";
import type { DeckParseResult, DetectedFormat, ExtractorOptions, ExtractorStrategy } from "./types";
import { defaultDeckTransformerService, DEFAULT_TRANSFORMATION_CONFIG } from "@/services/deckTransformer";

export class DeckParserService {
  private static extractors = new Map<string, ExtractorStrategy>();
  private static defaultExtractorId = "auto";

  // Initialize and register extractors with auto-detection as default
  static {
    const autoExtractor = new AutoDetectExtractor();
    const jsonExtractor = new JsonExtractor();
    const sectionsExtractor = new MarkdownSectionsExtractor();
    const keyValueExtractor = new KeyValueExtractor();
    const stencilExtractor = new StencilExtractor();
    const regexExtractor = new RegexExtractor();

    this.registerExtractor(autoExtractor, true);
    this.registerExtractor(jsonExtractor);
    this.registerExtractor(sectionsExtractor);
    this.registerExtractor(keyValueExtractor);
    this.registerExtractor(stencilExtractor);
    this.registerExtractor(regexExtractor);
  }

  /**
   * Register a new or custom extractor strategy in the service.
   * If isDefault is true, this extractor becomes the default strategy.
   */
  public static registerExtractor(extractor: ExtractorStrategy, isDefault = false): void {
    this.extractors.set(extractor.id, extractor);
    if (isDefault) {
      this.defaultExtractorId = extractor.id;
    }
  }

  /**
   * Retrieves an extractor strategy by its id.
   */
  public static getExtractor(id: string): ExtractorStrategy | undefined {
    return this.extractors.get(id);
  }

  /**
   * Retrieves all currently registered extractor strategies.
   */
  public static getRegisteredExtractors(): ExtractorStrategy[] {
    return Array.from(this.extractors.values());
  }

  /**
   * Sets the default extractor strategy id.
   */
  public static setDefaultExtractor(id: string): void {
    if (!this.extractors.has(id)) {
      throw new Error(`Cannot set default extractor: No extractor registered with id '${id}'`);
    }
    this.defaultExtractorId = id;
  }

  /**
   * Retrieves the currently active default extractor.
   */
  public static getDefaultExtractor(): ExtractorStrategy {
    const defaultExtractor = this.extractors.get(this.defaultExtractorId);
    if (!defaultExtractor) {
      throw new Error(`Default extractor with id '${this.defaultExtractorId}' is not registered`);
    }
    return defaultExtractor;
  }

  /**
   * Fast structural heuristic that inspects Card 1 without running full extraction.
   */
  public static detectFormat(text: string): FormatHeuristicResult {
    return FormatDetector.detect(text);
  }

  /**
   * Cleans input text according to the selected AI model preset.
   */
  public static normalizeInput(text: string, model: "auto" | "gemini" | "chatgpt" | "claude" = "auto"): string {
    if (!text) return "";
    let s = text.normalize("NFC");
    if (model === "gemini") {
      s = s
        .replace(/\[cite_start\]/gi, "")
        .replace(/\]+\]/gi, "")
        .replace(/\[\s*\d+(?:\s*,\s*\d+)*\s*\]/g, "");
    }
    // Clean accidental <br> tags to standard newlines
    s = s.replace(/<br\s*[\/]?[^>]*>/gi, "\n");
    // Normalize lines starting with an accidental single leading space before a list marker (preserves 2+ space sub-bullets)
    s = s.replace(/(^|\n) ([*+-]|\d+\.) /g, "$1$2 ");
    return s.replace(/\n{3,}/g, "\n\n").trim();
  }

  /**
   * Core parsing method that takes raw text, runs the default (auto-detect) or specified extractor,
   * and yields a comprehensive DeckParseResult.
   */
  public static parse(
    rawText: string,
    options: ExtractorOptions = {}
  ): DeckParseResult {
    const text = this.normalizeInput(rawText, options.normalizeModel);

    if (!text) {
      return {
        success: true,
        cards: [],
        detectedFormat: "empty",
        detectedFormatLabel: "No input provided",
        confidence: 0,
        diagnostics: [],
        usedStrategyId: "none",
      };
    }

    // Determine target extractor: options.extractorId or default (auto-detect)
    const targetExtractor = options.extractorId
      ? this.getExtractor(options.extractorId) ?? this.getDefaultExtractor()
      : this.getDefaultExtractor();

    const extractorResult = targetExtractor.extract(text, options);

    if (extractorResult.cards.length > 0) {
      const { detectedFormat, detectedFormatLabel, confidence } = this.deriveFormatMetadata(
        text,
        extractorResult.matchedStrategy,
        extractorResult.cards
      );

      let cards = extractorResult.cards;
      if (options.extractTopicBadges) {
        const transformConfig = options.transformConfig ?? {
          ...DEFAULT_TRANSFORMATION_CONFIG,
          extractTopicBadges: true,
        };
        cards = defaultDeckTransformerService.transformCards(cards, transformConfig);
      }

      return {
        success: true,
        cards,
        deckTitle: extractorResult.deckTitle,
        deckStyle: extractorResult.deckStyle,
        detectedFormat,
        detectedFormatLabel,
        confidence,
        diagnostics: extractorResult.diagnostics,
        appliedSplitSettings: extractorResult.usedSettings,
        usedStrategyId: extractorResult.matchedStrategy,
      };
    }

    // If target extractor didn't find cards and wasn't regex, try regex fallback
    if (targetExtractor.id !== "regex" && extractorResult.matchedStrategy !== "regex") {
      const regexExtractor = this.getExtractor("regex");
      if (regexExtractor) {
        const regexRes = regexExtractor.extract(text, options);
        if (regexRes.cards.length > 0) {
          const { detectedFormat, detectedFormatLabel, confidence } = this.deriveFormatMetadata(
            text,
            regexRes.matchedStrategy,
            regexRes.cards,
            regexRes.usedSettings?.id
          );

          let cards = regexRes.cards;
          if (options.extractTopicBadges) {
            const transformConfig = options.transformConfig ?? {
              ...DEFAULT_TRANSFORMATION_CONFIG,
              extractTopicBadges: true,
            };
            cards = defaultDeckTransformerService.transformCards(cards, transformConfig);
          }

          return {
            success: true,
            cards,
            detectedFormat,
            detectedFormatLabel,
            confidence,
            diagnostics: regexRes.diagnostics,
            appliedSplitSettings: regexRes.usedSettings,
            usedStrategyId: regexRes.matchedStrategy,
          };
        }
      }
    }

    // No cards could be identified
    return {
      success: false,
      cards: [],
      detectedFormat: "plain-text",
      detectedFormatLabel: "Unstructured Text",
      confidence: 0.1,
      diagnostics: extractorResult.diagnostics,
      usedStrategyId: extractorResult.matchedStrategy || "none",
    };
  }

  /**
   * Helper to derive user-friendly format labels, detected format keys, and confidence scores.
   */
  private static deriveFormatMetadata(
    text: string,
    strategyId: string,
    cards: { customFields?: Record<string, string> }[],
    splitSettingsId?: string
  ): { detectedFormat: DetectedFormat; detectedFormatLabel: string; confidence: number } {
    const hasCustomFields = cards.some(
      (c) => c.customFields && Object.keys(c.customFields).length > 0
    );

    if (strategyId === "json") {
      return {
        detectedFormat: "json",
        detectedFormatLabel: "JSON Cards Array",
        confidence: 0.98,
      };
    }

    if (strategyId === "stencil") {
      return {
        detectedFormat: "heuristic-stencil",
        detectedFormatLabel: "AI Structural Stencil",
        confidence: 0.9,
      };
    }

    if (strategyId === "markdown-sections") {
      return {
        detectedFormat: hasCustomFields ? "markdown-sections" : "markdown-headings",
        detectedFormatLabel: hasCustomFields
          ? "Markdown Sections & Custom Fields (##)"
          : "Markdown Headings (###)",
        confidence: 0.95,
      };
    }

    if (strategyId === "key-value") {
      const isBulleted = /^[ \t]*[-*+][ \t]+/m.test(text);
      return {
        detectedFormat: hasCustomFields
          ? "markdown-sections"
          : isBulleted
          ? "bullet-list"
          : "markdown-qa",
        detectedFormatLabel: hasCustomFields
          ? "Bullet List & Custom Fields (- Key:)"
          : isBulleted
          ? "Bullet List (Front: / Back:)"
          : "Key-Value Q&A (Front: / Back:)",
        confidence: 0.93,
      };
    }

    // Strategy regex or fallback
    const isHeadings = splitSettingsId === "headings" || new RegExp(`###\\s+(?:${FRONT_KEYWORDS_PATTERN})`, "i").test(text);
    const isBold = splitSettingsId === "bold-italic" || new RegExp(`\\*\\*(?:${FRONT_KEYWORDS_PATTERN}|${CARD_KEYWORDS_PATTERN})\\*\\*`, "i").test(text);
    const isQA = new RegExp(`^(?:Q:|${FRONT_KEYWORDS_PATTERN}:)`, "im").test(text);

    return {
      detectedFormat: isHeadings
        ? "markdown-headings"
        : isBold
        ? "custom-delimiters"
        : isQA
        ? "markdown-qa"
        : "custom-delimiters",
      detectedFormatLabel: isHeadings
        ? "Markdown Headings (###)"
        : isBold
        ? "Bold & Italic (**)"
        : isQA
        ? "Generic Q&A (Q: / A:)"
        : "Custom Delimiters",
      confidence: 0.92,
    };
  }
}
