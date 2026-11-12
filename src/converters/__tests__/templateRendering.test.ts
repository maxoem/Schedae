import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { CARD_TEMPLATES } from "../templates";
import { formatMarkdownForAnki } from "../jsonToApkg";
import { convertKatexToAnkiMathJax, normalizeMathMarkdown } from "../../utils/mathUtils";

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
});
