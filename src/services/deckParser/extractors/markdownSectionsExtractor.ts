import { unified } from "unified";
import remarkParse from "remark-parse";
import { toString } from "mdast-util-to-string";
import { dedentText } from "@/lib/utils";
import type { FlashCard } from "@/converters/types";
import type {
  ExtractorOptions,
  ExtractorResult,
  ExtractorStrategy,
  DiagnosticIssue,
} from "../types";
import {
  isFrontKeyword,
  isBackKeyword,
  HEADING_FRONT_REGEX,
  HEADING_BACK_REGEX,
} from "../keywords";

function cleanHeadingTitle(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/^[*_~`#\s]+|[*_~`#\s]+$/g, "")
    .replace(/^:+|:+$/g, "")
    .replace(/^[*_~`#\s]+|[*_~`#\s]+$/g, "")
    .trim();
}

interface ParsedSection {
  title: string;
  normalizedTitle: string;
  content: string;
}

interface RawCard {
  title?: string;
  sections: ParsedSection[];
}

export class MarkdownSectionsExtractor implements ExtractorStrategy {
  readonly id = "markdown-sections";
  readonly label = "Hierarchical Headings (# Card / ## Fields)";

  canExtract(text: string): boolean {
    if (!text || text.trim().length === 0) return false;
    const norm = text.normalize("NFC");
    return HEADING_FRONT_REGEX.test(norm) && HEADING_BACK_REGEX.test(norm);
  }

  extract(text: string, _options: ExtractorOptions): ExtractorResult {
    const diagnostics: DiagnosticIssue[] = [];
    const cleanText = text.trim();

    let tree: any;
    try {
      tree = unified().use(remarkParse).parse(cleanText);
    } catch {
      diagnostics.push({
        id: "markdown-parse-error",
        level: "error",
        message: "Failed to parse markdown content.",
      });
      return { cards: [], matchedStrategy: this.id, diagnostics };
    }

    const children: any[] = Array.isArray(tree.children) ? tree.children : [];
    if (children.length === 0) {
      return { cards: [], matchedStrategy: this.id, diagnostics };
    }

    // 1. Identify all headings in the AST
    interface HeadingInfo {
      index: number;
      depth: number;
      title: string;
      cleanedTitle: string;
      startOffset: number;
      endOffset: number;
      isFront: boolean;
      isBack: boolean;
    }

    const headings: HeadingInfo[] = [];
    for (let i = 0; i < children.length; i++) {
      const node = children[i];
      if (node.type === "heading" && node.position) {
        const title = (toString(node) || "").trim();
        const cleanedTitle = cleanHeadingTitle(title);
        headings.push({
          index: i,
          depth: node.depth,
          title,
          cleanedTitle,
          startOffset: node.position.start.offset,
          endOffset: node.position.end.offset,
          isFront: isFrontKeyword(cleanedTitle),
          isBack: isBackKeyword(cleanedTitle),
        });
      }
    }

    // Determine the section depth: the most representative depth for Front / Back headings
    const frontBackDepths = headings.filter((h) => h.isFront || h.isBack).map((h) => h.depth);
    if (frontBackDepths.length === 0) {
      return { cards: [], matchedStrategy: this.id, diagnostics };
    }

    // Use minimum depth among Front/Back (e.g. depth 2 for ## Front or depth 3 for ### Question)
    const sectionDepth = Math.min(...frontBackDepths);

    // 2. Partition AST children into Card Chunks
    const rawCards: RawCard[] = [];
    let currentCard: RawCard = { sections: [] };

    // Helper: start a new card
    const finalizeCurrentCard = () => {
      if (currentCard.sections.length > 0) {
        rawCards.push(currentCard);
        currentCard = { sections: [] };
      }
    };

    let i = 0;
    while (i < children.length) {
      const node = children[i];

      // Thematic breaks (---, ***) act as card boundaries
      if (node.type === "thematicBreak") {
        finalizeCurrentCard();
        i++;
        continue;
      }

      // Headings with depth < sectionDepth (e.g. # Card 1) act as card boundaries
      if (node.type === "heading" && node.depth < sectionDepth) {
        finalizeCurrentCard();
        currentCard.title = (toString(node) || "").trim();
        i++;
        continue;
      }

      // Headings at sectionDepth (e.g. ## Front, ## Back, ## Notes)
      if (node.type === "heading" && node.depth === sectionDepth) {
        const title = (toString(node) || "").trim();
        const cleanedTitle = cleanHeadingTitle(title);
        const isFront = isFrontKeyword(cleanedTitle);

        // If we already have a Front section in currentCard and encounter another Front heading,
        // it means a new card is starting!
        const alreadyHasFront = currentCard.sections.some((s) => isFrontKeyword(s.normalizedTitle));
        if (isFront && alreadyHasFront) {
          finalizeCurrentCard();
        }

        // Collect all content nodes until the next section heading (depth <= sectionDepth),
        // card boundary, or end of document
        const contentNodes: any[] = [];
        let nextIdx = i + 1;
        while (nextIdx < children.length) {
          const nextNode = children[nextIdx];
          if (nextNode.type === "thematicBreak") break;
          if (nextNode.type === "heading" && nextNode.depth <= sectionDepth) break;
          contentNodes.push(nextNode);
          nextIdx++;
        }

        let sectionContent = "";
        if (contentNodes.length > 0) {
          const start = contentNodes[0].position?.start?.offset;
          const end = contentNodes[contentNodes.length - 1].position?.end?.offset;
          if (typeof start === "number" && typeof end === "number" && end >= start) {
            sectionContent = cleanText.substring(start, end).trim();
          } else {
            sectionContent = contentNodes.map((n) => toString(n)).join("\n\n").trim();
          }
        }

        currentCard.sections.push({
          title,
          normalizedTitle: cleanedTitle,
          content: sectionContent,
        });

        i = nextIdx;
        continue;
      }

      // Any other loose node before the first section
      i++;
    }

    finalizeCurrentCard();

    // 3. Map RawCards to FlashCard objects
    const cards: FlashCard[] = [];
    rawCards.forEach((rawCard, cardIdx) => {
      let front = "";
      let back = "";
      const customFields: Record<string, string> = {};

      for (const section of rawCard.sections) {
        if (isFrontKeyword(section.normalizedTitle)) {
          front = front ? `${front}\n\n${section.content}` : section.content;
        } else if (isBackKeyword(section.normalizedTitle)) {
          back = back ? `${back}\n\n${section.content}` : section.content;
        } else {
          // Custom field: preserve original title format (e.g. "Notes", "Sources", "Code Example")
          const fieldName = cleanHeadingTitle(section.title);
          if (fieldName) {
            if (customFields[fieldName]) {
              customFields[fieldName] += `\n\n${section.content}`;
            } else {
              customFields[fieldName] = section.content;
            }
          }
        }
      }

      front = dedentText(front);
      back = dedentText(back);
      const cleanCustomFields: Record<string, string> = {};
      for (const [k, v] of Object.entries(customFields)) {
        const cleaned = dedentText(v);
        if (cleaned) {
          cleanCustomFields[k] = cleaned;
        }
      }

      // Quality diagnostics
      if (!front && !back && Object.keys(cleanCustomFields).length === 0) {
        diagnostics.push({
          id: `card-${cardIdx}-empty`,
          level: "warning",
          message: `Card #${cardIdx + 1} has no front or back content.`,
          cardIndex: cardIdx,
        });
        return;
      }

      if (!front) {
        diagnostics.push({
          id: `card-${cardIdx}-no-front`,
          level: "warning",
          message: `Card #${cardIdx + 1} is missing a Question / Front heading.`,
          cardIndex: cardIdx,
        });
      }

      if (!back) {
        diagnostics.push({
          id: `card-${cardIdx}-no-back`,
          level: "warning",
          message: `Card #${cardIdx + 1} is missing an Answer / Back heading.`,
          cardIndex: cardIdx,
        });
      }

      // LaTeX delimiter balance check
      const singleDollarCount = (front.match(/(?<!\\)\$/g) || []).length;
      if (singleDollarCount % 2 !== 0) {
        diagnostics.push({
          id: `card-${cardIdx}-unclosed-latex`,
          level: "info",
          message: `Card #${cardIdx + 1} may have an unclosed LaTeX math '$' delimiter.`,
          cardIndex: cardIdx,
        });
      }

      cards.push({
        id: `card-${cardIdx + 1}`,
        front,
        back,
        ...(Object.keys(cleanCustomFields).length > 0 ? { customFields: cleanCustomFields } : {}),
      });
    });

    return {
      cards,
      matchedStrategy: this.id,
      diagnostics,
    };
  }
}
