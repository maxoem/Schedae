import React from "react";
import "katex/dist/katex.min.css";
import { cn, dedentText } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { useWorkspaceMediaResolver, type MediaUrlResolver } from "@/components/workspace/workspaceMediaContextValue";
import { parseLocalMediaFilename } from "@/services/mediaStore/mediaUtils";

import { normalizeMathMarkdown } from "@/utils/mathUtils";
import { preparePreviewContent } from "@/utils/previewContent";
export { normalizeMathMarkdown, preparePreviewContent };

/**
 * Renders markdown text with full formatting support (bold, line breaks, lists)
 * and KaTeX math expressions. Handles both inline ($...$) and display ($$...$$) mode.
 */
export function KaTeXRenderer({
  text,
  className,
  resolveMediaUrl,
}: {
  text: string;
  className?: string;
  resolveMediaUrl?: MediaUrlResolver;
}) {
  const contextResolver = useWorkspaceMediaResolver();
  const resolver = resolveMediaUrl ?? contextResolver;
  const content = React.useMemo(() => preparePreviewContent(text), [text]);

  return (
    <div className={cn("leading-relaxed max-w-none", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          p: ({ children }) => <div className="mb-2 last:mb-0">{children}</div>,
          pre: ({ children }) => <pre className="overflow-x-auto">{children}</pre>,
          code: ({ className, children }) => <code className={className}>{children}</code>,
          ul: ({ children }) => <ul className="list-disc ml-4 mb-2">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal ml-4 mb-2">{children}</ol>,
          li: ({ children }) => <li className="mb-1 last:mb-0">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-muted-foreground/30 pl-3 italic my-2">{children}</blockquote>
          ),
          img: ({ src = "", alt = "", title }) => {
            const resolved = resolver?.(src);
            const localName = parseLocalMediaFilename(src);
            if (localName && !resolved) {
              return (
                <span className="inline-flex items-center gap-1.5 px-2 py-1 my-1 rounded-md border border-amber-300/70 bg-amber-50 text-amber-800 text-[11px] font-mono">
                  Missing media: {localName}
                </span>
              );
            }
            return (
              <img
                src={resolved ?? src}
                alt={alt}
                title={title}
                loading="lazy"
                className="max-w-full h-auto rounded-md my-2 border border-border/50"
              />
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Preview wrapper that renders KaTeX + markdown for the batch preview.
 * This shows the rendered math notation exactly as it will appear in Anki.
 */
export function MathifiedCardContent({ text, variant = "front" }: {
  text: string;
  variant?: "front" | "back";
}) {
  return (
    <div className={cn(
      "leading-relaxed max-w-none",
      variant === "front" ? "text-foreground font-semibold" : "text-foreground/90",
    )}>
      <KaTeXRenderer text={text} />
    </div>
  );
}
