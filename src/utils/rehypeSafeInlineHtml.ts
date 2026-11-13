const ALLOWED_TAGS = new Set([
  "u",
  "sub",
  "sup",
  "mark",
  "span",
  "b",
  "strong",
  "i",
  "em",
  "s",
  "del",
  "ins",
  "small",
  "kbd",
  "code",
  "abbr",
  "q",
  "cite",
  "br",
  "hr",
  "wbr",
  "a",
  "img",
  "div",
  "p",
  "details",
  "summary",
]);

const VOID_TAGS = new Set(["br", "hr", "wbr", "img"]);
const DROP_CONTENT_TAGS = new Set(["script", "style", "iframe", "object", "embed", "svg", "noscript"]);

const SAFE_STYLE_PROPS: Record<string, string> = {
  color: "color",
  "background-color": "backgroundColor",
  background: "background",
  "font-weight": "fontWeight",
  "font-style": "fontStyle",
  "text-decoration": "textDecoration",
  "text-align": "textAlign",
  "font-size": "fontSize",
};

interface HastText {
  type: "text";
  value: string;
}

interface HastElement {
  type: "element";
  tagName: string;
  properties: Record<string, unknown>;
  children: HastNode[];
}

interface HastRaw {
  type: "raw";
  value: string;
}

interface HastParent {
  type: string;
  children?: HastNode[];
}

type HastNode = HastText | HastElement | HastRaw | HastParent;

function decodeAttrEntities(value: string): string {
  return value
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&");
}

function isSafeUrl(url: string, allowDataImage: boolean): boolean {
  const trimmed = url.trim().toLowerCase();
  if (!trimmed) return false;
  if (trimmed.startsWith("javascript:") || trimmed.startsWith("vbscript:")) return false;
  if (trimmed.startsWith("data:")) {
    return allowDataImage && /^data:image\/(?:png|jpeg|jpg|gif|webp|avif);base64,/i.test(trimmed);
  }
  return true;
}

function parseSafeStyle(rawStyle: string): Record<string, string> | undefined {
  const styleObj: Record<string, string> = {};
  for (const decl of rawStyle.split(";")) {
    const colonIdx = decl.indexOf(":");
    if (colonIdx === -1) continue;
    const rawKey = decl.slice(0, colonIdx).trim().toLowerCase();
    const rawVal = decl.slice(colonIdx + 1).trim();
    const camelKey = SAFE_STYLE_PROPS[rawKey];
    if (!camelKey || !rawVal) continue;
    if (/url\s*\(|expression\s*\(|@import|javascript:/i.test(rawVal)) continue;
    styleObj[camelKey] = rawVal;
  }
  return Object.keys(styleObj).length > 0 ? styleObj : undefined;
}

function parseAttributes(tagName: string, attrString: string): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  const attrRegex = /([a-zA-Z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;

  while ((match = attrRegex.exec(attrString)) !== null) {
    const name = match[1].toLowerCase();
    if (name.startsWith("on")) continue;
    const rawVal = match[2] ?? match[3] ?? match[4] ?? "";
    const val = decodeAttrEntities(rawVal);

    if (name === "class" && val) {
      props.className = val.split(/\s+/).filter(Boolean);
    } else if (name === "title" && val) {
      props.title = val;
    } else if (name === "style" && val) {
      const parsedStyle = parseSafeStyle(val);
      if (parsedStyle) props.style = parsedStyle;
    } else if (tagName === "a" && name === "href" && isSafeUrl(val, false)) {
      props.href = val;
    } else if (tagName === "img") {
      if (name === "src" && isSafeUrl(val, true)) props.src = val;
      else if (name === "alt") props.alt = val;
      else if ((name === "width" || name === "height") && /^\d+(?:px|%)?$/i.test(val)) props[name] = val;
    } else if (tagName === "details" && name === "open") {
      props.open = true;
    }
  }

  return props;
}

function transformChildren(children: HastNode[]): HastNode[] {
  const output: HastNode[] = [];
  const stack: Array<{ tagName: string; element: HastElement }> = [];
  let suppressedTag: string | null = null;
  let suppressedDepth = 0;

  const appendNode = (node: HastNode) => {
    if (suppressedDepth > 0) return;
    if (stack.length > 0) {
      stack[stack.length - 1].element.children.push(node);
    } else {
      output.push(node);
    }
  };

  const processTagToken = (token: string) => {
    const tagMatch = /^<(\/?)([a-zA-Z][\w-]*)([\s\S]*?)(\/?)>$/.exec(token);
    if (!tagMatch) {
      appendNode({ type: "text", value: token });
      return;
    }

    const isClosing = tagMatch[1] === "/";
    const tagName = tagMatch[2].toLowerCase();
    const attrString = tagMatch[3] ?? "";
    const isSelfClosing = tagMatch[4] === "/" || VOID_TAGS.has(tagName);

    if (DROP_CONTENT_TAGS.has(tagName)) {
      if (!isClosing && !isSelfClosing) {
        if (suppressedDepth === 0) suppressedTag = tagName;
        if (suppressedTag === tagName) suppressedDepth++;
      } else if (isClosing && suppressedTag === tagName && suppressedDepth > 0) {
        suppressedDepth--;
        if (suppressedDepth === 0) suppressedTag = null;
      }
      return;
    }

    if (suppressedDepth > 0) return;

    if (!ALLOWED_TAGS.has(tagName)) {
      return;
    }

    if (isClosing) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tagName === tagName) {
          stack.length = i;
          break;
        }
      }
      return;
    }

    const el: HastElement = {
      type: "element",
      tagName,
      properties: parseAttributes(tagName, attrString),
      children: [],
    };
    appendNode(el);

    if (!isSelfClosing) {
      stack.push({ tagName, element: el });
    }
  };

  for (const child of children) {
    if (child.type === "raw" && "value" in child && typeof child.value === "string") {
      const rawVal = child.value;
      const tagRegex = /<\/?[a-zA-Z][\w-]*(?:\s+(?:[^>"']|"[^"]*"|'[^']*')*)?\s*\/?>/g;
      let lastIndex = 0;
      let m: RegExpExecArray | null;

      while ((m = tagRegex.exec(rawVal)) !== null) {
        if (m.index > lastIndex) {
          appendNode({ type: "text", value: rawVal.slice(lastIndex, m.index) });
        }
        processTagToken(m[0]);
        lastIndex = m.index + m[0].length;
      }
      if (lastIndex < rawVal.length) {
        appendNode({ type: "text", value: rawVal.slice(lastIndex) });
      }
    } else {
      if ("children" in child && Array.isArray(child.children)) {
        child.children = transformChildren(child.children);
      }
      appendNode(child);
    }
  }

  return output;
}

/**
 * Rehype plugin that converts allowlisted inline/safe HTML `raw` nodes inside
 * react-markdown's HAST tree into React-safe `element` nodes without needing
 * rehype-raw. Unsafe tags (script/style/iframe) and event attributes are dropped.
 */
export function rehypeSafeInlineHtml() {
  return (tree: HastParent) => {
    if (tree && Array.isArray(tree.children)) {
      tree.children = transformChildren(tree.children);
    }
  };
}
