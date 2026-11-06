export type CardTemplateId = "default" | "modern_light" | "modern_dark" | "markdown_basic";

export interface CardTemplateConfig {
  id: CardTemplateId;
  label: string;
  css: string;
  qfmt: string;
  afmt: string;
}

const markdownBasicFront = `
<div class="md-front md-field"><pre>{{Front}}</pre></div>

<script>
    (function() {
        function loadStyle(path, altUrl) {
            return new Promise((resolve) => {
                if (document.querySelector(\`link[href="\${path}"]\`)) return resolve();
                let el = document.createElement("link");
                el.rel = "stylesheet";
                el.href = path;
                el.onload = resolve;
                el.onerror = function() {
                    if (altUrl) {
                        let altEl = document.createElement("link");
                        altEl.rel = "stylesheet";
                        altEl.href = altUrl;
                        altEl.onload = resolve;
                        altEl.onerror = resolve;
                        document.head.appendChild(altEl);
                    } else {
                        resolve();
                    }
                };
                document.head.appendChild(el);
            });
        }

        function loadScript(path, globalVar, altUrl) {
            return new Promise((resolve) => {
                if (globalVar && typeof window[globalVar] !== "undefined") {
                    return resolve();
                }
                if (document.querySelector(\`script[src="\${path}"]\`)) {
                    return resolve();
                }
                let el = document.createElement("script");
                el.src = path;
                el.onload = resolve;
                el.onerror = function() {
                    if (altUrl) {
                        let altEl = document.createElement("script");
                        altEl.src = altUrl;
                        altEl.onload = resolve;
                        altEl.onerror = resolve;
                        document.head.appendChild(altEl);
                    } else {
                        resolve();
                    }
                };
                document.head.appendChild(el);
            });
        }

        window.replaceInString = function(str) {
            if (!str) return "";

            // Convert Anki's native MathJax tags (handles block="1", inline, and stray backslashes)
            str = str.replace(/\\\\?<anki-mathjax[^>]*?block=["']?1["']?[^>]*>([\\s\\S]*?)\\\\?<\\/anki-mathjax>/gi, "\\\\[$1\\\\]");
            str = str.replace(/\\\\?<anki-mathjax[^>]*>([\\s\\S]*?)\\\\?<\\/anki-mathjax>/gi, "\\\\($1\\\\)");

            // Normalize double-escaped math delimiters: \\( -> \(, \\[ -> \[, \\) -> \), \\] -> \]
            str = str.replace(/\\\\\\\\+([(\[])/g, "\\\\$1");
            str = str.replace(/\\\\\\\\+([)\\]])/g, "\\\\$1");

            // Strip editor HTML wrappers and line breaks
            str = str.replace(/<[\\/]?pre[^>]*>/gi, "");
            str = str.replace(/<br\\s*[\\/]?[^>]*>/gi, "\\n");
            str = str.replace(/<p[^>]*>/gi, "");
            str = str.replace(/<\\/p>/gi, "\\n");
            str = str.replace(/<div[^>]*>/gi, "");
            str = str.replace(/<\\/div[^>]*>/gi, "\\n");
            str = str.replace(/<[\\/]?span[^>]*>/gi, "");
            str = str.replace(/(^|\\n) ([*+-]|\\d+\\.) /g, "$1$2 ");

            return window.replaceHTMLElementsInString(str);
        };

        window.replaceHTMLElementsInString = function(str) {
            if (!str) return "";
            str = str.replace(/&nbsp;/gi, " ");
            str = str.replace(/&tab;/gi, "	");
            str = str.replace(/&gt;/gi, ">");
            str = str.replace(/&lt;/gi, "<");
            return str.replace(/&amp;/gi, "&");
        };

        window.applyRenderers = function(el) {
            if (!el) return;

            // 1. KaTeX Math rendering
            try {
                let text = el.innerHTML;
                text = window.replaceInString(text);
                el.textContent = text;
                if (typeof renderMathInElement !== "undefined") {
                    renderMathInElement(el, {
                        delimiters: [
                            {left: "$$", right: "$$", display: true},
                            {left: "\\\\(", right: "\\\\)", display: false},
                            {left: "$", right: "$", display: false},
                            {left: "\\\\[", right: "\\\\]", display: true}
                        ],
                        throwOnError: false
                    });
                }
            } catch (e) {
                console.error("renderMath error", e);
            }

            // 2. Markdown rendering (runs on el.innerHTML with KaTeX spans preserved)
            try {
                let text = el.innerHTML;
                if (typeof markdownit !== "undefined") {
                    let md = new markdownit({
                        typographer: true, 
                        html: true, 
                        highlight: function (str, lang) {
                            if (lang && typeof hljs !== "undefined" && hljs.getLanguage(lang)) {
                                try { return hljs.highlight(str, { language: lang }).value; } catch (__) {}
                            }
                            return ''; 
                        }
                    });
                    if (typeof markdownItMark !== "undefined") {
                        md = md.use(markdownItMark);
                    }
                    text = md.render(text);
                } else {
                    text = text.replace(/\\n/g, "<br>");
                }
                el.innerHTML = text;
            } catch (e) {
                console.error("markdown error", e);
            }
        };

        window.renderAllFrontFields = function() {
            var frontFields = document.querySelectorAll(".md-front");
            for (var i = 0; i < frontFields.length; i++) {
                var el = frontFields[i];
                if (!el.getAttribute("data-rendered")) {
                    el.setAttribute("data-rendered", "true");
                    window.applyRenderers(el);
                }
            }
        };

        async function initCards() {
            loadStyle("_katex.css", "https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css");
            loadStyle("_highlight.css", "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/styles/default.min.css");
            
            await loadScript("_highlight.js", "hljs", "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/highlight.min.js");
            await loadScript("_katex.min.js", "katex", "https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js");
            await loadScript("_auto-render.js", "renderMathInElement", "https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/contrib/auto-render.min.js");
            await loadScript("_markdown-it.min.js", "markdownit", "https://cdnjs.cloudflare.com/ajax/libs/markdown-it/13.0.1/markdown-it.min.js");
            await loadScript("_markdown-it-mark.js", "markdownItMark", "https://cdn.jsdelivr.net/gh/Jwrede/Anki-KaTeX-Markdown/_markdown-it-mark.js");
            await loadScript("_mhchem.js", null, "https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/contrib/mhchem.min.js");

            window.renderAllFrontFields();
        }

        if (typeof markdownit !== "undefined" && typeof renderMathInElement !== "undefined") {
            window.renderAllFrontFields();
        } else {
            initCards();

            let checkCount = 0;
            let checkInterval = setInterval(() => {
                checkCount++;
                if ((typeof markdownit !== 'undefined' && typeof renderMathInElement !== 'undefined') || checkCount > 30) {
                    clearInterval(checkInterval);
                    window.renderAllFrontFields();
                }
            }, 50);
        }
    })();
</script>
`;

const markdownBasicBack = `{{FrontSide}}

<hr id=answer>

<div class="md-back md-field"><pre>{{Back}}</pre></div>

<script>
    (function() {
        function renderAllBackFields() {
            if (typeof window.applyRenderers !== "function") return;
            var fields = document.querySelectorAll(".md-back, .md-custom-field, .custom-field .md-field");
            for (var i = 0; i < fields.length; i++) {
                var el = fields[i];
                if (!el.getAttribute("data-rendered")) {
                    el.setAttribute("data-rendered", "true");
                    window.applyRenderers(el);
                }
            }
        }

        if (typeof markdownit !== 'undefined' && typeof renderMathInElement !== 'undefined') {
            renderAllBackFields();
        } else {
            let checkInterval = setInterval(() => {
                if (typeof markdownit !== 'undefined' && typeof renderMathInElement !== 'undefined') {
                    clearInterval(checkInterval);
                    renderAllBackFields();
                }
            }, 50);

            setTimeout(() => {
                clearInterval(checkInterval);
                renderAllBackFields();
            }, 1500);
        }

        if (typeof MutationObserver !== 'undefined') {
            var observer = new MutationObserver(function() {
                renderAllBackFields();
            });
            observer.observe(document.body, { childList: true, subtree: true });
            setTimeout(function() { observer.disconnect(); }, 2000);
        }
    })();
</script>
`;


export const CARD_TEMPLATES: Record<CardTemplateId, CardTemplateConfig> = {
  default: {
    id: "default",
    label: "Basic (Anki Default)",
    css: ".card { font-family: arial; font-size: 20px; text-align: center; color: black; background-color: white; } .card-topic-badge { display: inline-block; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; padding: 2px 8px; border-radius: 9999px; background-color: rgba(0,0,0,0.07); color: #555; margin-bottom: 12px; }",
    qfmt: "{{Front}}",
    afmt: "{{FrontSide}}\\n\\n<hr id=answer>\\n\\n{{Back}}",
  },
  modern_light: {
    id: "modern_light",
    label: "Modern Clean",
    css: ".card { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 18px; text-align: center; color: #27272a; background-color: #ffffff; line-height: 1.6; padding: 20px; } .card.night_mode { background-color: #1a1a1a; color: #e5e5e5; } hr#answer { border: 0; border-bottom: 1px solid #e4e4e7; margin: 20px auto; width: 80%; } .night_mode hr#answer { border-bottom: 1px solid #3f3f46; } .front { font-weight: 600; font-size: 22px; margin-bottom: 15px; } .back { font-size: 18px; } .card-topic-badge { display: inline-block; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; padding: 3px 10px; border-radius: 9999px; background-color: rgba(0,0,0,0.06); color: #4b5563; margin-bottom: 14px; } .card.night_mode .card-topic-badge { background-color: rgba(255,255,255,0.12); color: #9ca3af; }",
    qfmt: "<div class='front'>{{Front}}</div>",
    afmt: "{{FrontSide}}\\n\\n<hr id=answer>\\n\\n<div class='back'>{{Back}}</div>",
  },
  modern_dark: {
    id: "modern_dark",
    label: "Modern Dark",
    css: ".card { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 18px; text-align: center; color: #e5e5e5; background-color: #18181b; line-height: 1.6; padding: 20px; } hr#answer { border: 0; border-bottom: 1px solid #3f3f46; margin: 20px auto; width: 80%; } .front { font-weight: 600; font-size: 22px; margin-bottom: 15px; color: #fafafa; } .back { font-size: 18px; } .card-topic-badge { display: inline-block; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; padding: 3px 10px; border-radius: 9999px; background-color: rgba(255,255,255,0.12); color: #9ca3af; margin-bottom: 14px; }",
    qfmt: "<div class='front'>{{Front}}</div>",
    afmt: "{{FrontSide}}\\n\\n<hr id=answer>\\n\\n<div class='back'>{{Back}}</div>",
  },
  markdown_basic: {
    id: "markdown_basic",
    label: "Markdown Basic (KaTeX)",
    css: `
/* --- Main Card Container --- */
.card {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 18px;
  font-weight: 400;
  line-height: 1.6;
  color: #222111;
  background-color: #ffffff;
  text-align: left;
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

/* --- Topic / Context Badge --- */
.card-topic-badge {
  display: inline-block;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 3px 10px;
  border-radius: 9999px;
  background-color: rgba(0, 0, 0, 0.06);
  color: #4b5563;
  margin-bottom: 14px;
}

.nightMode .card-topic-badge, .night_mode .card-topic-badge {
  background-color: rgba(255, 255, 255, 0.12);
  color: #9ca3af;
}

/* --- Headings --- */
h1, h2, h3 {
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #222;
  margin-top: 1.5em;
  margin-bottom: 0.5em;
  line-height: 1.2;
}

/* --- Bold Text --- */
b, strong {
  font-weight: 600;
  color: #000;
}

/* --- Lists --- */
ul, ol {
  margin-top: 0;
  margin-bottom: 1em;
  padding-left: 1.5em;
}

li {
  margin-bottom: 0.5em;
}

li strong {
  font-weight: 700;
}

/* Nested lists */
ul ul, ol ol {
  margin-top: 0.5em;
  font-size: 0.95em;
}

/* --- Math / KaTeX adjustments --- */
.katex {
  font-size: 1.1em; 
  line-height: 1.2;
}

.katex-display {
  margin: 1em 0;
  overflow-x: auto;
  overflow-y: hidden;
}

/* --- Custom Fields (Quelle, Sources, Notes) --- */
.custom-field {
  margin-top: 1.5em;
  font-size: 0.9em;
  color: #374151;
  text-align: left;
}

.custom-field hr {
  border: 0;
  border-top: 1px solid #e5e7eb;
  margin: 1.5em 0 1em 0;
}

.custom-field b {
  display: block;
  font-weight: 700;
  color: #111827;
  margin-bottom: 0.35em;
  font-size: 0.95em;
}

.custom-field .md-custom-field {
  margin-top: 0.25em;
}

.custom-field .md-custom-field p {
  margin: 0.3em 0;
}

/* --- Tables --- */
table {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
  font-size: 0.9em;
}

th, td {
  border: 1px solid #e0e0e0;
  padding: 8px 12px;
  text-align: left;
}

th {
  background-color: #f9f9f9;
  font-weight: 600;
}

/* --- Code Blocks --- */
pre code {
  background-color: #f7f7f7;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  display: block;
  padding: 12px;
  overflow-x: auto;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 0.85em;
  color: #333;
}

/* --- Dark / Night Mode Support --- */
.nightMode.card, .night_mode.card {
  background-color: #18181b;
  color: #f4f4f5;
}

.nightMode h1, .nightMode h2, .nightMode h3,
.night_mode h1, .night_mode h2, .night_mode h3 {
  color: #fafafa;
}

.nightMode b, .nightMode strong,
.night_mode b, .night_mode strong {
  color: #ffffff;
}

.nightMode hr#answer, .night_mode hr#answer,
.nightMode .custom-field hr, .night_mode .custom-field hr {
  border-top-color: #3f3f46;
}

.nightMode .custom-field, .night_mode .custom-field {
  color: #9ca3af;
}

.nightMode .custom-field b, .night_mode .custom-field b {
  color: #f3f4f6;
}

.nightMode .katex, .night_mode .katex {
  color: inherit;
}
`,
    qfmt: markdownBasicFront,
    afmt: markdownBasicBack,
  }
};
