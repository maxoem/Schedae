import TurndownService from "turndown";
import type { ContentTransformer, TransformationContext } from "../types";

export class HtmlToMarkdownTransformer implements ContentTransformer {
  readonly id = "html-to-markdown";
  readonly name = "HTML to Clean Markdown";
  readonly description = "Converts legacy HTML markup into clean modern Markdown while strictly safeguarding math formulas and code blocks.";
  readonly order = 20;

  private turndown: TurndownService;

  constructor() {
    this.turndown = new TurndownService({
      headingStyle: "atx",
      hr: "---",
      bulletListMarker: "-",
      codeBlockStyle: "fenced",
    });
    // Crucial: do not escape markdown characters (like *, _, [, $, \) during HTML-to-markdown conversion
    this.turndown.escape = (str: string) => str;
  }

  canTransform(content: string, _context?: TransformationContext): boolean {
    if (!content || typeof content !== "string") return false;
    // Check if the string contains HTML markup other than <anki-mathjax> or simple <br> tags
    // (simple <br> tags are handled cleanly by ListBulletTransformer without needing full HTML parsing)
    const nonMathHtmlPattern = /<(?!anki-mathjax|\/anki-mathjax|br\s*[\/]?>)[a-z][\w-]*(\s+[^>]*)?>/i;
    return nonMathHtmlPattern.test(content);
  }

  transform(content: string, _context?: TransformationContext): string {
    if (!content) return "";

    // Protect all math structures and code blocks so Turndown never escapes or alters their contents
    const placeholders: string[] = [];
    const protect = (match: string) => {
      const idx = placeholders.length;
      placeholders.push(match);
      // Use strictly alphanumeric tokens: no underscores or asterisks that Turndown could touch
      return `XPROTECTEDCHUNK${idx}X`;
    };

    let s = content;

    // 1. Protect existing code blocks and inline code
    s = s.replace(/```[\s\S]*?```/g, protect);
    s = s.replace(/`[^`\n]+`/g, protect);
    // 2. Protect Anki MathJax tags
    s = s.replace(/\\?<anki-mathjax[^>]*>[\s\S]*?\\?<\/anki-mathjax>/gi, protect);
    // 3. Protect display math $$ ... $$
    s = s.replace(/\$\$[\s\S]*?\$\$/g, protect);
    // 4. Protect inline math $ ... $
    s = s.replace(/\$[^$\n]+?\$/g, protect);
    // 5. Protect LaTeX delimiters \[ ... \] and \( ... \)
    s = s.replace(/\\{1,2}\[([\s\S]*?)\\{1,2}\]/g, protect);
    s = s.replace(/\\{1,2}\(([^\n]*?)\\{1,2}\)/g, protect);
    // 6. Protect LaTeX environments: \begin{...} ... \end{...}
    s = s.replace(/\\begin\{([a-z*]+)\}[\s\S]*?\\end\{\1\}/gi, protect);

    // Run Turndown on the protected content
    try {
      s = this.turndown.turndown(s);
    } catch {
      // Fallback: strip standard basic wrapper tags
      s = s.replace(/<[\/]?pre[^>]*>/gi, "");
      s = s.replace(/<[\/]?span[^>]*>/gi, "");
      s = s.replace(/<[\/]?div[^>]*>/gi, "");
      s = s.replace(/<[\/]?p[^>]*>/gi, "\n");
    }

    // Strip legacy/stray <span> tags that may remain after Turndown
    s = s.replace(/<[\/]?span[^>]*>/gi, "");

    // Restore protected chunks cleanly
    s = s.replace(/XPROTECTEDCHUNK(\d+)X/g, (_, idx) => {
      return placeholders[Number(idx)] ?? "";
    });

    return s;
  }
}
