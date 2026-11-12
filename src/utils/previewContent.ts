import { dedentText } from "@/lib/utils";
import { normalizeMathMarkdown } from "@/utils/mathUtils";
import { HtmlToMarkdownTransformer } from "@/services/deckTransformer/transformers/htmlToMarkdownTransformer";

const htmlTransformer = new HtmlToMarkdownTransformer();

/**
 * Normalizes card text for markdown preview:
 * - Converts HTML tags (such as <img>, <b>, <i>, <ul>) to Markdown so ReactMarkdown renders them without escaping
 * - Converts <br> tags to standard newlines
 * - Normalizes math expressions (<anki-mathjax>, LaTeX delimiters) to KaTeX syntax ($ and $$)
 */
export function preparePreviewContent(text: string): string {
  if (!text || typeof text !== "string") return "";
  let raw = dedentText(text);
  if (htmlTransformer.canTransform(raw)) {
    raw = htmlTransformer.transform(raw);
  }
  raw = raw.replace(/<br\s*[\/]?>/gi, "\n");
  return normalizeMathMarkdown(raw);
}
