import type { ContentTransformer, TransformationContext } from "../types";

export class ListBulletTransformer implements ContentTransformer {
  readonly id = "list-bullets";
  readonly name = "List Bullet & Indentation Formatter";
  readonly description = "Cleans stray <br> tags, removes useless stray backslashes outside math, repairs accidentally escaped list bullets and bold asterisks, and trims single-space indentations while strictly preserving intentional sub-bullets.";
  readonly order = 40;

  private static readonly BR_TAG_REGEX = /<br\s*[\/]?[^>]*>/i;
  private static readonly SINGLE_SPACE_BULLET_REGEX = /(^|\n) ([*+-]|\d+\.) /;
  private static readonly ESCAPED_BULLET_REGEX = /(^|\n|<br\s*[\/]?[^>]*>)\s*\\\*\s+/i;
  private static readonly ESCAPED_BOLD_REGEX = /\\\*\\\*/;
  private static readonly STRAY_BACKSLASH_LINE_REGEX = /(^|\n|<br\s*[\/]?[^>]*>)\s*\\+\s*(?=\n|<br\s*[\/]?[^>]*>|$)/i;
  private static readonly TRAILING_BACKSLASH_REGEX = /([^\\])\\+[ \t]*(?=\n|<br\s*[\/]?[^>]*>|$)/;

  canTransform(content: string, _context?: TransformationContext): boolean {
    if (!content || typeof content !== "string") return false;
    return (
      ListBulletTransformer.BR_TAG_REGEX.test(content) ||
      ListBulletTransformer.SINGLE_SPACE_BULLET_REGEX.test(content) ||
      ListBulletTransformer.ESCAPED_BULLET_REGEX.test(content) ||
      ListBulletTransformer.ESCAPED_BOLD_REGEX.test(content) ||
      ListBulletTransformer.STRAY_BACKSLASH_LINE_REGEX.test(content) ||
      ListBulletTransformer.TRAILING_BACKSLASH_REGEX.test(content)
    );
  }

  transform(content: string, _context?: TransformationContext): string {
    if (!content) return "";
    let s = content;

    // Protect all math structures and code blocks so LaTeX matrix \\ row breaks and math symbols are preserved
    const placeholders: string[] = [];
    const protect = (match: string) => {
      const idx = placeholders.length;
      placeholders.push(match);
      return `XPROTECTEDCHUNK${idx}X`;
    };

    s = s.replace(/```[\s\S]*?```/g, protect);
    s = s.replace(/`[^`\n]+`/g, protect);
    s = s.replace(/\$\$[\s\S]*?\$\$/g, protect);
    s = s.replace(/\\{1,2}\[[\s\S]*?\\{1,2}\]/g, protect);
    s = s.replace(/\\{1,2}\([^\n]*?\\{1,2}\)/g, protect);
    s = s.replace(/\\begin\{([a-z*]+)\}[\s\S]*?\\end\{\1\}/gi, protect);
    s = s.replace(/\\?<anki-mathjax[^>]*>[\s\S]*?\\?<\/anki-mathjax>/gi, protect);
    s = s.replace(/\$[^$\n]+?\$/g, protect);

    // 1. Remove standalone lines containing only backslashes (e.g. <br>\\\<br> or \n\\\n)
    s = s.replace(/(^|\n|<br\s*[\/]?[^>]*>)\s*\\+\s*(?=\n|<br\s*[\/]?[^>]*>|$)/gi, "$1");

    // 2. Remove trailing backslashes at end of lines outside math (e.g. "erlernt: \\")
    s = s.replace(/([^\\])\\+[ \t]*(?=\n|<br\s*[\/]?[^>]*>|$)/gi, "$1");

    // 3. Repair accidentally escaped list bullets (e.g. \* at line/string start or after <br>)
    s = s.replace(/(^|\n|<br\s*[\/]?[^>]*>)\s*\\\*\s+/gi, "$1* ");

    // 4. Repair accidentally escaped bold markers (e.g. \*\*Regression:\*\*)
    s = s.replace(/\\\*\\\*/g, "**");

    // 5. Strip raw <br> tags to standard newlines
    s = s.replace(/<br\s*[\/]?[^>]*>/gi, "\n");

    // 6. Strip accidental single-space indentations before list markers (leaves 2+ spaces / tabs intact)
    s = s.replace(/(^|\n) ([*+-]|\d+\.) /g, "$1$2 ");

    // Restore protected chunks
    s = s.replace(/XPROTECTEDCHUNK(\d+)X/g, (_, idx) => {
      return placeholders[Number(idx)] ?? "";
    });

    return s;
  }
}
