import type {
  ContentTransformer,
  CardTransformer,
  TransformationConfig,
  TransformationContext,
} from "./types";
import type { FlashCard } from "@/converters/types";
import { DEFAULT_TRANSFORMATION_CONFIG } from "./types";
import { FieldLabelTransformer } from "./transformers/fieldLabelTransformer";
import { HtmlToMarkdownTransformer } from "./transformers/htmlToMarkdownTransformer";
import { MathEnvironmentTransformer } from "./transformers/mathEnvironmentTransformer";
import { ListBulletTransformer } from "./transformers/listBulletTransformer";
import { WhitespaceTransformer } from "./transformers/whitespaceTransformer";
import { TopicBadgeTransformer } from "./transformers/topicBadgeTransformer";

export interface TransformationReport {
  appliedTransformers: string[];
  original: string;
  result: string;
  hasChanged: boolean;
}

export class DeckTransformerService {
  private transformers: ContentTransformer[] = [];
  private cardTransformers: CardTransformer[] = [];

  constructor(
    customContentTransformers?: ContentTransformer[],
    customCardTransformers?: CardTransformer[]
  ) {
    if (customContentTransformers && customContentTransformers.length > 0) {
      this.transformers = [...customContentTransformers].sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
    } else {
      this.transformers = this.createDefaultTransformers();
    }

    if (customCardTransformers && customCardTransformers.length > 0) {
      this.cardTransformers = [...customCardTransformers].sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
    } else {
      this.cardTransformers = this.createDefaultCardTransformers();
    }
  }

  private createDefaultTransformers(): ContentTransformer[] {
    return [
      new FieldLabelTransformer(),
      new HtmlToMarkdownTransformer(),
      new MathEnvironmentTransformer(),
      new ListBulletTransformer(),
      new WhitespaceTransformer(),
    ].sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
  }

  private createDefaultCardTransformers(): CardTransformer[] {
    return [
      new TopicBadgeTransformer(),
    ].sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
  }

  /**
   * Registers a new content transformer or replaces an existing one with the same id.
   */
  registerTransformer(transformer: ContentTransformer): void {
    const existingIdx = this.transformers.findIndex((t) => t.id === transformer.id);
    if (existingIdx >= 0) {
      this.transformers[existingIdx] = transformer;
    } else {
      this.transformers.push(transformer);
    }
    this.transformers.sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
  }

  /**
   * Unregisters a content transformer by id.
   */
  unregisterTransformer(id: string): boolean {
    const initialLen = this.transformers.length;
    this.transformers = this.transformers.filter((t) => t.id !== id);
    return this.transformers.length < initialLen;
  }

  /**
   * Returns list of currently registered content transformers.
   */
  getTransformers(): readonly ContentTransformer[] {
    return [...this.transformers];
  }

  /**
   * Registers a new card-level transformer or replaces an existing one with the same id.
   */
  registerCardTransformer(transformer: CardTransformer): void {
    const existingIdx = this.cardTransformers.findIndex((t) => t.id === transformer.id);
    if (existingIdx >= 0) {
      this.cardTransformers[existingIdx] = transformer;
    } else {
      this.cardTransformers.push(transformer);
    }
    this.cardTransformers.sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
  }

  /**
   * Unregisters a card-level transformer by id.
   */
  unregisterCardTransformer(id: string): boolean {
    const initialLen = this.cardTransformers.length;
    this.cardTransformers = this.cardTransformers.filter((t) => t.id !== id);
    return this.cardTransformers.length < initialLen;
  }

  /**
   * Returns list of currently registered card-level transformers.
   */
  getCardTransformers(): readonly CardTransformer[] {
    return [...this.cardTransformers];
  }

  /**
   * Checks whether a specific transformer is enabled according to the given TransformationConfig.
   */
  private isTransformerEnabled(transformerId: string, config: TransformationConfig): boolean {
    switch (transformerId) {
      case "topic-badges":
        return config.extractTopicBadges !== false;
      case "field-labels":
        return config.stripFieldLabels;
      case "html-to-markdown":
        return config.htmlToMarkdown;
      case "math-environments":
        return config.normalizeMath;
      case "list-bullets":
        return config.cleanListBullets;
      case "whitespace":
        return config.normalizeWhitespace;
      default:
        // Any custom registered transformer is enabled by default
        return true;
    }
  }

  /**
   * Transforms a whole card through card-level transformers (e.g. topic badges)
   * and optionally through field-level content transformers on front and back.
   */
  transformCard(
    card: FlashCard,
    config: TransformationConfig = DEFAULT_TRANSFORMATION_CONFIG,
    context?: TransformationContext
  ): FlashCard {
    if (!card) return card;

    let current = { ...card };

    // 1. Apply CardTransformers (multi-field coordination, topic badge extraction)
    for (const transformer of this.cardTransformers) {
      if (!this.isTransformerEnabled(transformer.id, config)) {
        continue;
      }
      if (transformer.canTransform(current, context)) {
        current = transformer.transform(current, context);
      }
    }

    return current;
  }

  /**
   * Transforms a collection of cards through the card transformation pipeline.
   */
  transformCards(
    cards: FlashCard[],
    config: TransformationConfig = DEFAULT_TRANSFORMATION_CONFIG,
    context?: TransformationContext
  ): FlashCard[] {
    if (!cards || !Array.isArray(cards)) return [];
    return cards.map((card) => this.transformCard(card, config, context));
  }

  /**
   * Transforms a field content string through the pipeline.
   * For each active transformer, it verifies `canTransform` before applying it.
   */
  transformField(
    content: string,
    config: TransformationConfig = DEFAULT_TRANSFORMATION_CONFIG,
    context?: TransformationContext
  ): string {
    if (!content || typeof content !== "string") return "";

    let current = content;

    for (const transformer of this.transformers) {
      if (!this.isTransformerEnabled(transformer.id, config)) {
        continue;
      }

      // Check whether this transformer wants to apply to this content
      if (transformer.canTransform(current, context)) {
        current = transformer.transform(current, context);
      }
    }

    return current;
  }

  /**
   * Detailed transform returning a report of which transformers applied.
   */
  transformFieldWithReport(
    content: string,
    config: TransformationConfig = DEFAULT_TRANSFORMATION_CONFIG,
    context?: TransformationContext
  ): TransformationReport {
    if (!content || typeof content !== "string") {
      return {
        appliedTransformers: [],
        original: content || "",
        result: "",
        hasChanged: false,
      };
    }

    const appliedTransformers: string[] = [];
    let current = content;

    for (const transformer of this.transformers) {
      if (!this.isTransformerEnabled(transformer.id, config)) {
        continue;
      }

      if (transformer.canTransform(current, context)) {
        const next = transformer.transform(current, context);
        if (next !== current) {
          appliedTransformers.push(transformer.id);
          current = next;
        }
      }
    }

    return {
      appliedTransformers,
      original: content,
      result: current,
      hasChanged: current !== content,
    };
  }
}

// Global default singleton instance
export const defaultDeckTransformerService = new DeckTransformerService();
