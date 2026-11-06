import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { RotateCw } from 'lucide-react';
import type { Flashcard } from '@/data/decks';
import { KaTeXRenderer } from '@/components/flashcard/KaTeXPreview';

interface FlashcardItemProps {
  card: Flashcard;
  index: number;
  total: number;
  preRenderedFrontHtml?: string;
  preRenderedBackHtml?: string;
}

const cardFront: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid rgba(228,228,231,0.9)",
  boxShadow: "0 4px 24px rgba(0,0,0,0.07), 0 1px 4px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,1)",
};

const cardBack: React.CSSProperties = {
  background: "rgba(250,250,251,0.99)",
  border: "1px solid rgba(228,228,231,0.9)",
  boxShadow: "0 4px 24px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,1)",
};

const pillStyle: React.CSSProperties = {
  background: "rgba(244,244,245,0.97)",
  border: "1px solid rgba(228,228,231,0.8)",
};

function FlashcardItem({ card, preRenderedFrontHtml, preRenderedBackHtml }: FlashcardItemProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const onFlip = () => setIsFlipped(prev => !prev);
  const currentLabel = isFlipped ? 'Back' : 'Front';
  const currentContent = isFlipped ? card.back : card.front;
  const surfaceStyle = isFlipped ? cardBack : cardFront;

  return (
    <div>
      <div
        className="relative w-full h-[400px] sm:h-[480px] cursor-pointer group"
        onClick={onFlip}
      >
        <div className="absolute inset-0 rounded-2xl overflow-hidden" style={surfaceStyle}>
          <div className="flex flex-col items-start justify-start h-full p-6 text-left relative">
            <div className="absolute top-4 left-4 z-10">
              <Badge
                variant={isFlipped ? 'default' : 'outline'}
                className={isFlipped
                  ? 'text-[10px] uppercase tracking-wider font-semibold bg-zinc-800 hover:bg-zinc-800 border-0 text-zinc-100'
                  : 'text-[10px] uppercase tracking-wider font-semibold text-zinc-500 border-zinc-200 bg-zinc-50'}
              >
                {currentLabel}
              </Badge>
            </div>

            <div className="w-full h-full overflow-y-auto flex flex-col items-start justify-start pt-10 pb-12 px-2 scrollbar-thin scrollbar-thumb-rounded scrollbar-thumb-zinc-200">
              <div className="
                flashcard-prose w-full break-words
                prose
                prose-zinc
                max-w-none
                prose-headings:font-bold
                prose-headings:text-zinc-900
                prose-h2:text-2xl
                prose-h2:mt-8
                prose-h2:mb-4
                prose-h2:border-t
                prose-h2:pt-6
                prose-h3:text-lg
                prose-h3:mt-6
                prose-h3:mb-3
                prose-p:text-zinc-800
                prose-p:leading-relaxed
                prose-ul:list-disc
                prose-ul:pl-6
                prose-li:my-1
                marker:prose-li:text-zinc-600
                [&_.katex-display]:my-6
              ">
                {!isFlipped && card.customFields?.Topic && (
                  <div className="mb-3">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20 tracking-wide uppercase">
                      {card.customFields.Topic}
                    </span>
                  </div>
                )}

                {isFlipped ? (
                  preRenderedBackHtml ? (
                    <div dangerouslySetInnerHTML={{ __html: preRenderedBackHtml }} />
                  ) : (
                    <KaTeXRenderer text={currentContent} />
                  )
                ) : (
                  preRenderedFrontHtml ? (
                    <div dangerouslySetInnerHTML={{ __html: preRenderedFrontHtml }} />
                  ) : (
                    <KaTeXRenderer text={currentContent} />
                  )
                )}

                {isFlipped && card.customFields && Object.keys(card.customFields).length > 0 && (
                  <div className="w-full mt-6 pt-4 border-t border-zinc-200 dark:border-zinc-700/60 space-y-3">
                    {Object.entries(card.customFields)
                      .filter(([fieldName]) => fieldName.toLowerCase() !== "topic")
                      .map(([fieldName, content]) => (
                      <div
                        key={fieldName}
                        className="p-3 rounded-lg bg-zinc-100/80 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-700/40 space-y-1 text-left"
                      >
                        <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                          {fieldName}
                        </div>
                        <div className="text-xs leading-relaxed text-zinc-800 dark:text-zinc-200">
                          <KaTeXRenderer text={content} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 text-xs text-foreground/50 z-10 px-4 py-2 rounded-full whitespace-nowrap" style={pillStyle}>
              <RotateCw className="w-3.5 h-3.5 shrink-0" />
              <span>{isFlipped ? 'Click to show front' : 'Click to show back'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default React.memo(FlashcardItem);
