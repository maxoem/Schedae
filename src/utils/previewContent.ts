import { dedentText } from "@/lib/utils";
import { normalizeMathMarkdown } from "@/utils/mathUtils";
import { HtmlToMarkdownTransformer } from "@/services/deckTransformer/transformers/htmlToMarkdownTransformer";

const htmlTransformer = new HtmlToMarkdownTransformer();

const BLOCK_HTML_TAG_REGEX =
  /<(?:ul|ol|li|table|thead|tbody|tr|th|td|blockquote|div|p|h[1-6]|pre|hr)\b[^>]*>/i;

const MARKDOWN_STRUCTURE_REGEX =
  /(?:^\s*\|.+\|\s*$|\n\s*\|.+\|\s*$|^[ \t]*(?:[*+-]|\d+\.|>)\s|\n[ \t]*(?:[*+-]|\d+\.|>)\s)/;

const BLOCK_HTML_SEGMENT_REGEX =
  /<(ul|ol|table|blockquote|div|p|h[1-6]|pre)\b[^>]*>[\s\S]*?<\/\1>|<hr\b[^>]*>/gi;

function decodeHtmlAttr(value: string): string {
  return value
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&");
}

function htmlImgTagToMarkdown(fullTag: string, attrStr: string): string {
  const srcMatch = attrStr.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i);
  if (!srcMatch) return fullTag;

  const rawSrc = decodeHtmlAttr((srcMatch[1] ?? srcMatch[2] ?? srcMatch[3] ?? "").trim());
  if (!rawSrc) return fullTag;

  const altMatch = attrStr.match(/\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  const titleMatch = attrStr.match(/\btitle\s*=\s*(?:"([^"]*)"|'([^']*)')/i);

  const alt = decodeHtmlAttr((altMatch?.[1] ?? altMatch?.[2] ?? "").trim()).replace(/\]/g, "\\]");
  const title = decodeHtmlAttr((titleMatch?.[1] ?? titleMatch?.[2] ?? "").trim()).replace(/"/g, '\\"');

  const formattedSrc = /[\s()]/.test(rawSrc) ? `<${rawSrc}>` : rawSrc;
  return title ? `![${alt}](${formattedSrc} "${title}")` : `![${alt}](${formattedSrc})`;
}

function convertInlineHtmlFormatting(str: string): string {
  let out = str;
  for (let pass = 0; pass < 3; pass++) {
    const prev = out;
    out = out
      .replace(/<(?:b|strong)\b[^>]*>([\s\S]*?)<\/(?:b|strong)>/gi, "**$1**")
      .replace(/<(?:i|em)\b[^>]*>([\s\S]*?)<\/(?:i|em)>/gi, "*$1*")
      .replace(/<(?:s|del)\b[^>]*>([\s\S]*?)<\/(?:s|del)>/gi, "~~$1~~")
      .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, "`$1`")
      .replace(
        /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi,
        (_, dqHref: string | undefined, sqHref: string | undefined, label: string) => {
          const href = decodeHtmlAttr((dqHref ?? sqHref ?? "").trim());
          return href ? `[${label}](${href})` : label;
        },
      );
    if (out === prev) break;
  }
  return out;
}

/**
 * Prepares raw Anki card content (which may mix HTML tags like <img>, <b>, <br>,
 * <u>, <span style>, Markdown formatting, and MathJax/LaTeX delimiters)
 * for accurate ReactMarkdown + KaTeX rendering in the in-app preview.
 *
 * Unlike full-document Turndown passes, this protects code/math, converts <img> and
 * inline formatting without collapsing Markdown tables, blockquotes, or nested lists,
 * and applies HtmlToMarkdownTransformer only to blocks containing block-level HTML.
 */
export function preparePreviewContent(text: string): string {
  if (!text || typeof text !== "string") return "";

  let s = dedentText(text);
  s = normalizeMathMarkdown(s);

  const placeholders: string[] = [];
  const protect = (match: string) => {
    const idx = placeholders.length;
    placeholders.push(match);
    return `XSCHEDAEPREV${idx}X`;
  };

  // Protect code blocks, inline code, and normalized math expressions from HTML rewrites
  s = s.replace(/```[\s\S]*?```/g, protect);
  s = s.replace(/`[^`\n]+`/g, protect);
  s = s.replace(/\$\$[\s\S]*?\$\$/g, protect);
  s = s.replace(/(?<!\\)\$(?!\$)([^$\n]+?)(?<!\\)\$/g, protect);

  // Convert HTML line breaks and <img> tags while preserving surrounding Markdown structure
  s = s.replace(/<br\b[^>]*>/gi, "\n");
  s = s.replace(/<img\b([^>]*)>/gi, (fullTag, attrStr: string) => htmlImgTagToMarkdown(fullTag, attrStr));

  // Transform only blocks containing block-level HTML so Markdown tables, lists, and blockquotes keep formatting
  const chunks = s.split(/(\n{2,})/);
  s = chunks
    .map((chunk, i) => {
      if (i % 2 === 1 || !chunk) return chunk;

      if (BLOCK_HTML_TAG_REGEX.test(chunk) && htmlTransformer.canTransform(chunk)) {
        if (!MARKDOWN_STRUCTURE_REGEX.test(chunk)) {
          return htmlTransformer.transform(chunk);
        }
        return chunk.replace(BLOCK_HTML_SEGMENT_REGEX, (htmlSeg) => htmlTransformer.transform(htmlSeg));
      }

      return convertInlineHtmlFormatting(chunk);
    })
    .join("");

  // Restore protected code and math chunks untouched
  return s.replace(/XSCHEDAEPREV(\d+)X/g, (_, idx) => placeholders[Number(idx)] ?? "");
}
