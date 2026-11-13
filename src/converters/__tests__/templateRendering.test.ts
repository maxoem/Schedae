import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import katex from "katex";
import { CARD_TEMPLATES } from "../templates";
import { formatMarkdownForAnki } from "../jsonToApkg";
import { convertKatexToAnkiMathJax, normalizeMathMarkdown } from "../../utils/mathUtils";
import { preparePreviewContent } from "../../utils/previewContent";
import { rehypeSafeInlineHtml } from "../../utils/rehypeSafeInlineHtml";

describe("Markdown & KaTeX Template Rendering", () => {
  test("CARD_TEMPLATES.markdown_basic includes LaTeX delimiters \\( and \\[", () => {
    const qfmt = CARD_TEMPLATES.markdown_basic.qfmt;
    assert.ok(qfmt.includes('left: "\\\\("'), "Front template must include inline \\( delimiter");
    assert.ok(qfmt.includes('left: "\\\\["'), "Front template must include display \\[ delimiter");
    assert.ok(qfmt.includes('left: "$$"'), "Front template must include display $$ delimiter");
    assert.ok(qfmt.includes('left: "$"'), "Front template must include inline $ delimiter");
  });

  test("CARD_TEMPLATES.markdown_basic script cleans up Anki MathJax tags (including block='true'), double backslashes, and list <br> spacing", () => {
    const qfmt = CARD_TEMPLATES.markdown_basic.qfmt;
    assert.ok(qfmt.includes("anki-mathjax"), "Template should handle anki-mathjax tags");
    assert.ok(qfmt.includes("(?:1|true)"), "Template should support both block='1' and block='true' anki-mathjax attributes");
    assert.ok(qfmt.includes("replaceHTMLElementsInString"), "Template should decode HTML entities");
    assert.ok(qfmt.includes("[*+-]"), "Template should normalize list markers");
  });

  test("CARD_TEMPLATES.markdown_basic back template queries and renders custom fields like Quelle", () => {
    const afmt = CARD_TEMPLATES.markdown_basic.afmt;
    assert.ok(afmt.includes(".md-custom-field"), "Back template must target .md-custom-field elements");
    assert.ok(afmt.includes("renderAllBackFields"), "Back template must have a function to render all back fields");
    assert.ok(afmt.includes("data-rendered"), "Back template should prevent double-rendering via data-rendered attribute");
  });

  test("CARD_TEMPLATES.markdown_basic CSS includes custom field and dark mode styles", () => {
    const css = CARD_TEMPLATES.markdown_basic.css;
    assert.ok(css.includes(".custom-field"), "CSS should include .custom-field styling");
    assert.ok(css.includes(".md-custom-field"), "CSS should include .md-custom-field styling");
    assert.ok(css.includes(".katex-display"), "CSS should style .katex-display");
    assert.ok(css.includes(".nightMode"), "CSS should support night mode");
  });

  test("formatMarkdownForAnki correctly formats list items and strips accidental sub-bullet indents", () => {
    // 1. Two top-level bullet items with empty line and trailing whitespace
    const inputWithEmptyLine =
      "* **Hoher Bias (Underfitting):** Sowohl Trainings- als auch Testfehler sind hoch. \n\n" +
      "* **Hohe Varianz (Overfitting):** Trainingsfehler ist sehr niedrig, aber Testfehler ist hoch.";

    const formatted = formatMarkdownForAnki(inputWithEmptyLine);
    assert.equal(
      formatted,
      "* **Hoher Bias (Underfitting):** Sowohl Trainings- als auch Testfehler sind hoch.<br><br>" +
      "* **Hohe Varianz (Overfitting):** Trainingsfehler ist sehr niedrig, aber Testfehler ist hoch."
    );

    // 2. Existing <br> tag with space before bullet (*...<br> *...) is normalized
    const inputWithBrSpace =
      "* **Hoher Bias:** Fehler hoch.<br> * **Hohe Varianz:** Fehler niedrig.";
    const formattedBr = formatMarkdownForAnki(inputWithBrSpace);
    assert.equal(
      formattedBr,
      "* **Hoher Bias:** Fehler hoch.<br>* **Hohe Varianz:** Fehler niedrig."
    );

    // 3. Accidental single-space indent before bullet is trimmed to column 0
    const inputWithSingleSpace =
      "* Item 1\n * Item 2 (accidental single space indent)";
    const formattedSingleSpace = formatMarkdownForAnki(inputWithSingleSpace);
    assert.equal(
      formattedSingleSpace,
      "* Item 1<br>* Item 2 (accidental single space indent)"
    );

    // 4. Intentional sub-bullets (2 or 4 spaces) are preserved
    const inputWithSubList =
      "* Parent item\n  * Child item (2 spaces)\n    * Sub-child item (4 spaces)";
    const formattedSubList = formatMarkdownForAnki(inputWithSubList);
    assert.equal(
      formattedSubList,
      "* Parent item<br>  * Child item (2 spaces)<br>    * Sub-child item (4 spaces)"
    );

    // 5. Existing <br> tags followed by intentional sub-bullet indentations are preserved
    const inputWithBrSubList =
      "* Parent item<br>  * Child item (2 spaces)<br>    * Sub-child item (4 spaces)";
    const formattedBrSubList = formatMarkdownForAnki(inputWithBrSubList);
    assert.equal(
      formattedBrSubList,
      "* Parent item<br>  * Child item (2 spaces)<br>    * Sub-child item (4 spaces)"
    );
  });

  test("formatMarkdownForAnki normalizes LaTeX / MathJax delimiters to plain KaTeX by default without corrupting row breaks", () => {
    // 1. Multi-line display math with square brackets \[...\] and row breaks \\
    const inputWithDisplay =
      "Solve the system:\n" +
      "\\[\n" +
      "\\begin{aligned}\n" +
      "2x + y &= 5 \\\\\n" +
      "x - y &= 1\n" +
      "\\end{aligned}\n" +
      "\\]\n" +
      "Result follows.";

    const formattedDisplay = formatMarkdownForAnki(inputWithDisplay);
    assert.ok(
      formattedDisplay.includes(
        "$$\n\\begin{aligned}\n2x + y &= 5 \\\\\nx - y &= 1\n\\end{aligned}\n$$"
      ),
      "Default export must normalize \\[...\\] into plain KaTeX $$...$$ while preserving \\\\ row breaks"
    );
    assert.ok(!formattedDisplay.includes("\\["), "Default export must not emit Anki MathJax \\[ delimiters");
    assert.ok(!formattedDisplay.includes("aligned<br>"), "Must not insert <br> inside $$...$$");
    assert.ok(formattedDisplay.startsWith("Solve the system:<br>"));
    assert.ok(formattedDisplay.endsWith("<br>Result follows."));

    // 2. Inline LaTeX parenthesized math \(...\) and double-escaped \\(...\\) -> $...$
    const inputWithInline = "Consider the function \\( f(x) = x^2 \\) for all \\\\( x \\in \\mathbb{R} \\\\).";
    const formattedInline = formatMarkdownForAnki(inputWithInline);
    assert.equal(
      formattedInline,
      "Consider the function $f(x) = x^2$ for all $x \\in \\mathbb{R}$.",
      "Default export must normalize \\(...\\) and \\\\(...\\\\) to plain KaTeX $...$"
    );

    // 3. Preserving explicit preserve mode keeps \[...\] untouched without inserting <br>
    const preserved = formatMarkdownForAnki(inputWithDisplay, { mathFormat: "preserve" });
    assert.ok(
      preserved.includes("\\[\n\\begin{aligned}\n2x + y &= 5 \\\\\nx - y &= 1\n\\end{aligned}\n\\]")
    );
  });

  test("formatMarkdownForAnki converts math to clean Anki MathJax delimiters when opt-in is enabled", () => {
    const input =
      "$$\n" +
      "\\text{IoU} = \\frac{|A \\cap B|}{|A \\cup B|}\n" +
      "$$\n" +
      "Some text here $inline math$ and double-escaped \\\\(D\\\\).";

    const formatted = formatMarkdownForAnki(input, { mathFormat: "anki_mathjax" });
    assert.ok(
      formatted.includes("\\[\n\\text{IoU} = \\frac{|A \\cap B|}{|A \\cup B|}\n\\]"),
      "Opt-in Anki MathJax must convert $$...$$ to clean \\[...\\]"
    );
    assert.ok(formatted.includes("Some text here \\(inline math\\)"));
    assert.ok(formatted.includes("double-escaped \\(D\\)"));
    assert.ok(!formatted.includes("\\\\("), "Must never emit double backslashes \\\\(");
    assert.ok(!formatted.includes("\\\\["), "Must never emit double backslashes \\[");
    assert.ok(!formatted.includes("$"), "Converted math should not leave raw $ delimiters");
  });

  test("convertKatexToAnkiMathJax protects code blocks and currency amounts", () => {
    const input = "Cost is $5 and $10.\n```bash\necho \"$HOME\"\n```\nFormula: $E = mc^2$";
    const converted = convertKatexToAnkiMathJax(input);
    assert.ok(converted.includes("Cost is $5 and $10."));
    assert.ok(converted.includes('echo "$HOME"'));
    assert.ok(converted.includes("Formula: \\(E = mc^2\\)"));
  });

  test("formatMarkdownForAnki wraps bare LaTeX environments in display math and repairs asterisks without double-wrapping", () => {
    // 1. Bare pmatrix environment wrapped in $$
    const bareMatrix =
      "Matrix definition:\n" +
      "\\begin{pmatrix}\n" +
      "1 & 0 \\\\\n" +
      "0 & 1\n" +
      "\\end{pmatrix}\n" +
      "End of matrix.";

    const formattedBare = formatMarkdownForAnki(bareMatrix);
    assert.ok(
      formattedBare.includes("$$\n\\begin{pmatrix}\n1 & 0 \\\\\n0 & 1\n\\end{pmatrix}\n$$"),
      "Bare pmatrix must be wrapped in $$ display math"
    );
    assert.ok(!formattedBare.includes("pmatrix<br>"), "No <br> inside pmatrix");

    // 2. Already wrapped environment must NOT be double-wrapped
    const alreadyWrapped =
      "$$\\begin{pmatrix}\n1 & 0 \\\\\n0 & 1\n\\end{pmatrix}$$";
    const formattedWrapped = formatMarkdownForAnki(alreadyWrapped);
    assert.ok(!formattedWrapped.includes("$$$$"), "Must not create $$$$ double delimiters");

    // 3. Corrupted escaped asterisk
    const corruptedAsterisk =
      "\\begin{align\\*}\n" +
      "a &= b \\\\\n" +
      "c &= d\n" +
      "\\end{align\\*}";
    const formattedAsterisk = formatMarkdownForAnki(corruptedAsterisk);
    assert.ok(formattedAsterisk.includes("\\begin{align*}"), "Escaped asterisk must be repaired");
    assert.ok(formattedAsterisk.includes("\\end{align*}"), "Escaped end asterisk must be repaired");
    assert.ok(formattedAsterisk.includes("$$\n\\begin{align*}"), "Repaired environment must be wrapped in $$");
  });

  test("normalizeMathMarkdown handles LaTeX and Anki MathJax delimiters", () => {
    // Inline math
    const inline = "Ein Programm lernt aus Erfahrung \\(E\\) bezüglich Aufgaben \\(T\\)";
    const normInline = normalizeMathMarkdown(inline);
    assert.equal(normInline, "Ein Programm lernt aus Erfahrung $E$ bezüglich Aufgaben $T$");

    // Display math
    const display = "\\[\\text{KI} \\supset \\text{ML}\\]";
    const normDisplay = normalizeMathMarkdown(display);
    assert.ok(normDisplay.includes("$$\\text{KI} \\supset \\text{ML}$$"));

    // Anki mathjax tag
    const ankiTag = "Erfahrung <anki-mathjax>E</anki-mathjax> bezüglich";
    const normAnki = normalizeMathMarkdown(ankiTag);
    assert.equal(normAnki, "Erfahrung $E$ bezüglich");

    // Anki mathjax tag with stray backslashes
    const ankiStray = "Erfahrung \\<anki-mathjax>E\\</anki-mathjax> bezüglich";
    const normAnkiStray = normalizeMathMarkdown(ankiStray);
    assert.equal(normAnkiStray, "Erfahrung $E$ bezüglich");

    // Anki mathjax tag with block="true" and stray backslashes (Anki 2.1.50+ format)
    const ankiBlockTrue =
      "Quotient:<br>\\<anki-mathjax block=\"true\">\\text{IoU} = \\frac{|A \\cap B|}{|A \\cup B|}\\</anki-mathjax>";
    const normAnkiBlockTrue = normalizeMathMarkdown(ankiBlockTrue);
    assert.ok(
      normAnkiBlockTrue.includes("$$\\text{IoU} = \\frac{|A \\cap B|}{|A \\cup B|}$$"),
      "block='true' anki-mathjax must normalize to $$...$$ display math"
    );

    // Double-escaped \\(E\\)
    const doubleEscaped = "Erfahrung \\\\(E\\\\) bezüglich";
    const normDouble = normalizeMathMarkdown(doubleEscaped);
    assert.equal(normDouble, "Erfahrung $E$ bezüglich");
  });

  test("formatMarkdownForAnki exports images as HTML <img> tags or flat Markdown references based on imageFormat", () => {
    const input =
      "Look at ![Diagram \"A\"](media/schedae-a1b2c3_test.png)\n" +
      "Code sample: `![code](media/ignore_me.png)`\n" +
      "```\n![block](media/ignore_block.png)\n```";

    const htmlOut = formatMarkdownForAnki(input, { imageFormat: "img_tag" });
    assert.ok(
      htmlOut.includes('<img src="schedae-a1b2c3_test.png" alt="Diagram &quot;A&quot;">'),
      "img_tag mode must emit escaped HTML <img> with flat filename",
    );
    assert.ok(htmlOut.includes("`![code](media/ignore_me.png)`"), "Inline code image example must remain untouched");
    assert.ok(htmlOut.includes("![block](media/ignore_block.png)"), "Fenced code image example must remain untouched");

    const mdOut = formatMarkdownForAnki(input, { imageFormat: "markdown" });
    assert.ok(
      mdOut.includes('![Diagram "A"](schedae-a1b2c3_test.png)'),
      "markdown mode must emit flat ![alt](filename) syntax",
    );
    assert.ok(!mdOut.includes("media/schedae-a1b2c3_test.png"), "markdown mode must strip virtual media/ prefix");
    assert.ok(mdOut.includes("`![code](media/ignore_me.png)`"));
  });

  test("CARD_TEMPLATES.markdown_basic renders HTML tags, quoted <img> attributes, Markdown, code blocks, and KaTeX safely with real markdown-it + katex", () => {
    const qfmt = CARD_TEMPLATES.markdown_basic.qfmt;
    const scriptMatch = qfmt.match(/<script>([\s\S]*?)<\/script>/i);
    assert.ok(scriptMatch, "Template must contain a client-side script block");

    // Load real _markdown-it.min.js shipped in public/anki-media/MDKaTeX
    type MarkdownItCtor = new (opts: Record<string, unknown>) => { render(src: string): string };
    interface MockNode {
      nodeType: number;
      nodeValue?: string;
      outerHTML?: string;
    }
    interface MockElement {
      innerHTML: string;
      textContent: string;
      childNodes: MockNode[];
    }

    const mdSource = fs.readFileSync(
      path.resolve(process.cwd(), "public/anki-media/MDKaTeX/_markdown-it.min.js"),
      "utf8",
    );
    const mdModule: { exports: unknown } = { exports: {} };
    new Function("module", "exports", mdSource)(mdModule, mdModule.exports);
    const realMarkdownIt = mdModule.exports as MarkdownItCtor;
    assert.equal(typeof realMarkdownIt, "function", "Expected markdown-it constructor from MDKaTeX bundle");

    // Minimal DOM element + renderMathInElement backed by real KaTeX
    const createMockElement = (initialHtml: string): MockElement => {
      let currentText = "";
      let currentHtml = initialHtml;
      const el: MockElement = {
        get innerHTML() {
          return currentHtml;
        },
        set innerHTML(val: string) {
          currentHtml = val;
        },
        get textContent() {
          return currentText;
        },
        set textContent(val: string) {
          currentText = val;
          el.childNodes = [{ nodeType: 3, nodeValue: val }];
        },
        childNodes: [],
      };
      return el;
    };

    const realRenderMathInElement = (el: MockElement) => {
      const text: string = el.textContent ?? "";
      const nodes: MockNode[] = [];
      // Match $$...$$ or inline $...$
      const tokenRegex = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = tokenRegex.exec(text)) !== null) {
        if (match.index > lastIndex) {
          nodes.push({ nodeType: 3, nodeValue: text.slice(lastIndex, match.index) });
        }
        const isDisplay = match[1] !== undefined;
        const tex = isDisplay ? match[1] : match[2];
        const rendered = katex.renderToString(tex, { displayMode: isDisplay, throwOnError: false });
        nodes.push({ nodeType: 1, outerHTML: rendered });
        lastIndex = match.index + match[0].length;
      }
      if (lastIndex < text.length) {
        nodes.push({ nodeType: 3, nodeValue: text.slice(lastIndex) });
      }
      el.childNodes = nodes;
    };

    const mockWindow: Record<string, unknown> & { applyRenderers?: (el: MockElement) => void } = {
      markdownit: realMarkdownIt,
      renderMathInElement: realRenderMathInElement,
    };
    const mockDocument = {
      querySelector: () => null,
      querySelectorAll: () => [],
      head: { appendChild: () => {} },
      createElement: () => ({ setAttribute: () => {}, appendChild: () => {} }),
    };

    new Function("window", "document", "markdownit", "renderMathInElement", scriptMatch[1])(
      mockWindow,
      mockDocument,
      realMarkdownIt,
      realRenderMathInElement,
    );

    assert.equal(typeof mockWindow.applyRenderers, "function");

    // End-to-end test: quoted alt in <img>, HTML <span>/<u>, Markdown list, code spans, and tricky KaTeX
    const cardInput =
      '* **Diagramm:** <span style="color:red">wichtig</span> & <u>unterstrichen</u><br>' +
      'Code: `<br>` und `$x + y$`<br>' +
      'Inline math: $a_1 + b_2 \\text{ and } x*y*z$ und $x<b>y$<br>' +
      '$$\n\\begin{aligned}\nx &= 1 \\\\\ny &= 2\n\\end{aligned}\n$$\n\n' +
      formatMarkdownForAnki('Look at ![Diagram "A"](media/schedae-a1b2c3_test.png)', { imageFormat: "img_tag" }) +
      "\n\n" +
      formatMarkdownForAnki("Also ![Markdown Alt](md-image.png)", { imageFormat: "markdown" });

    const el = createMockElement(`<pre>${cardInput}</pre>`);
    mockWindow.applyRenderers(el);

    const renderedHtml: string = el.innerHTML;
    // 1. HTML <img> with &quot; in alt renders as real <img> tag, not escaped plain text
    assert.ok(
      renderedHtml.includes('<img src="schedae-a1b2c3_test.png" alt="Diagram &quot;A&quot;">'),
      `Expected valid <img> with &quot; alt attribute preserved, got:\n${renderedHtml}`,
    );
    assert.ok(!renderedHtml.includes("&lt;img"), "<img> must never be escaped as plain text");

    // 2. Markdown image syntax renders as <img>
    assert.ok(renderedHtml.includes('<img src="md-image.png" alt="Markdown Alt">'));

    // 3. User HTML tags render alongside Markdown bold/list
    assert.ok(renderedHtml.includes('<span style="color:red">wichtig</span>'), "<span> styling must survive");
    assert.ok(renderedHtml.includes("<u>unterstrichen</u>"), "<u> tag must render as HTML");
    assert.ok(renderedHtml.includes("<li><strong>Diagramm:</strong>"), "Markdown list + bold must render");

    // 4. Inline code `<br>` and `$x + y$` are preserved literally inside <code> without KaTeX corruption
    assert.ok(renderedHtml.includes("<code>&lt;br&gt;</code>"), "Inline code <br> must remain literal");
    assert.ok(renderedHtml.includes("<code>$x + y$</code>"), "Inline code $x + y$ must not become KaTeX");

    // 5. KaTeX spans must never be mangled by markdown-it (* -> <em>, <b -> raw tag, \\ -> \)
    assert.ok(!renderedHtml.includes("<em>y</em>"), "markdown-it must not turn x*y*z inside KaTeX into <em>");
    assert.ok(
      renderedHtml.includes("<annotation encoding=\"application/x-tex\">x&lt;b&gt;y</annotation>"),
      "KaTeX annotation with < and > must remain safely entity-escaped",
    );
    assert.ok(
      renderedHtml.includes("x &amp;= 1 \\\\"),
      `KaTeX \\begin{aligned} row break \\\\ must stay intact, got:\n${renderedHtml}`,
    );
  });

  test("preparePreviewContent preserves Markdown tables, blockquotes, nested lists, and code while converting <img>, inline formatting, and block HTML", () => {
    // 1. Raw HTML <img> tag with quoted alt, <br>, and MathJax alongside Markdown table & blockquote
    const mixedInput =
      "| A | B |\n|---|---|\n| 1 | 2 |\n\n" +
      "> Important note\n\n" +
      "* Item 1\n  * Subitem 1\n* Item 2\n\n" +
      '<img alt="Diagram &quot;A&quot;" src="interpreting-a-roc-curve.webp"><br>' +
      "Formula: <anki-mathjax>\\hat{y} = 1</anki-mathjax>";

    const previewOut1 = preparePreviewContent(mixedInput);
    assert.ok(previewOut1.includes("| A | B |\n|---|---|\n| 1 | 2 |"), "Markdown table must stay multiline");
    assert.ok(previewOut1.includes("> Important note"), "Markdown blockquote must remain intact");
    assert.ok(previewOut1.includes("* Item 1\n  * Subitem 1\n* Item 2"), "Nested list indentation must stay intact");
    assert.ok(
      previewOut1.includes('![Diagram "A"](interpreting-a-roc-curve.webp)'),
      "HTML <img> tag with &quot; alt must convert cleanly to Markdown image",
    );
    assert.ok(previewOut1.includes("$\\hat{y} = 1$"), "MathJax tags must normalize to KaTeX $...$");
    assert.ok(!previewOut1.includes("<img"), "Raw <img> tag should be converted for ReactMarkdown components.img");

    // 2. Code spans and fenced code blocks protect <br>, <img>, and <b>
    const codeInput =
      "Use `<br>`, `<img src=\"x.png\">`, and `<b>bold</b>`.\n```html\n<div><span>code</span></div>\n```";
    const previewOut2 = preparePreviewContent(codeInput);
    assert.ok(previewOut2.includes("`<br>`"), "Inline code <br> must not become newline");
    assert.ok(previewOut2.includes('`<img src="x.png">`'), "Inline code <img> must stay literal");
    assert.ok(previewOut2.includes("`<b>bold</b>`"), "Inline code <b> must stay literal");
    assert.ok(previewOut2.includes("```html\n<div><span>code</span></div>\n```"), "Fenced HTML code must stay literal");

    // 3. HTML formatting (<b>, <i>, <br>) converts cleanly while <u>/<sub>/<sup>/<mark>/<span> are preserved
    const formattedHtmlInput =
      "<b>Important:</b> check <i>carefully</i>.<br>" +
      '<u>underlined</u>, H<sub>2</sub>O, x<sup>2</sup>, <mark>hi</mark>, <span style="color:red">red</span>.';
    const previewOut3 = preparePreviewContent(formattedHtmlInput);
    assert.ok(previewOut3.includes("**Important:**"), "<b> must be converted to **bold**");
    assert.ok(
      previewOut3.includes("_carefully_") || previewOut3.includes("*carefully*"),
      "<i> must be converted to Markdown emphasis",
    );
    assert.ok(previewOut3.includes("\n"), "<br> must be converted to standard newlines");
    assert.ok(previewOut3.includes("<u>underlined</u>"), "<u> must remain for rehypeSafeInlineHtml");
    assert.ok(previewOut3.includes("H<sub>2</sub>O"), "<sub> must remain for rehypeSafeInlineHtml");
    assert.ok(previewOut3.includes('<span style="color:red">red</span>'), "<span> must remain for rehypeSafeInlineHtml");

    // 4. Pure HTML block (e.g. <ul><li>...) still converts cleanly via HtmlToMarkdownTransformer
    const blockHtmlInput = "<ul><li>First</li><li>Second</li></ul><p>After list</p>";
    const previewOut4 = preparePreviewContent(blockHtmlInput);
    assert.ok(previewOut4.includes("First") && previewOut4.includes("Second"));
    assert.ok(!previewOut4.includes("<ul>") && !previewOut4.includes("<p>"));
  });

  test("rehypeSafeInlineHtml converts safe HTML tags into HAST elements and drops unsafe scripts/attributes", () => {
    const hastTree = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "p",
          properties: {},
          children: [
            { type: "raw", value: "<u>" },
            { type: "text", value: "underlined" },
            { type: "raw", value: "</u>" },
            { type: "text", value: " H" },
            { type: "raw", value: "<sub>" },
            { type: "text", value: "2" },
            { type: "raw", value: "</sub>" },
            { type: "text", value: "O x" },
            { type: "raw", value: "<sup>" },
            { type: "text", value: "2" },
            { type: "raw", value: "</sup>" },
            { type: "text", value: " " },
            { type: "raw", value: "<mark>" },
            { type: "text", value: "hi" },
            { type: "raw", value: "</mark>" },
            { type: "text", value: " " },
            { type: "raw", value: '<span style="color:red" onclick="alert(1)">' },
            { type: "text", value: "red" },
            { type: "raw", value: "</span>" },
            { type: "raw", value: '<script>alert("xss")</script>' },
            { type: "raw", value: '<a href="javascript:alert(1)">' },
            { type: "text", value: "bad" },
            { type: "raw", value: "</a>" },
          ],
        },
        {
          type: "raw",
          value: '<div class="callout"><b>Bold</b> and <u>Safe</u></div>',
        },
      ],
    };

    rehypeSafeInlineHtml()(hastTree);
    const serialized = JSON.stringify(hastTree);

    assert.ok(serialized.includes('"tagName":"u"'), "<u> element must be built in HAST");
    assert.ok(serialized.includes('"tagName":"sub"'), "<sub> element must be built in HAST");
    assert.ok(serialized.includes('"tagName":"sup"'), "<sup> element must be built in HAST");
    assert.ok(serialized.includes('"tagName":"mark"'), "<mark> element must be built in HAST");
    assert.ok(serialized.includes('"style":{"color":"red"}'), "Safe inline style must parse to React style object");
    assert.ok(serialized.includes('"className":["callout"]'), "Safe class attribute on <div> must parse cleanly");
    assert.ok(!serialized.includes("script"), "<script> tag and its body must be dropped");
    assert.ok(!serialized.includes("onclick"), "Inline event handlers must be stripped");
    assert.ok(!serialized.includes("javascript:"), "javascript: href URLs must be stripped");
  });
});
