import { useState, useCallback, useMemo, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { Link, useNavigate } from "react-router-dom";
import { Download, Upload, Copy, Check, LayoutGrid, Database, Settings2, FileJson, RefreshCw, Braces, Sparkles, ChevronDown, AlertCircle, AlertTriangle, FileArchive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LlmMarkdownFieldSelector } from "@/components/converter/LlmMarkdownFieldSelector";
import {
  DEFAULT_LLM_MARKDOWN_FIELDS,
  chunkLlmMarkdownByTokens,
  evaluateLlmMergeCapability,
  exportDeckToLlmMarkdown,
  hasAnyLlmFieldSelected,
  type LlmMarkdownField,
  type LlmMarkdownFieldSelection,
} from "@/services/llmMarkdown";
import { decodeApkgRaw } from "@/converters/apkg";
import TurndownService from "turndown";
import JSZip from "jszip";

// ---------------------------------------------------------------------------
// HTML → Markdown
// ---------------------------------------------------------------------------

// Constants
const TOKEN_THRESHOLD_PER_CHUNK = 10000; // ~40KB per chunk for safety

const _turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});

function htmlToMarkdown(text: string): string {
  if (!text || typeof text !== 'string') return text;
  if (!/<[a-z][\s\S]*?>/i.test(text)) return text;
  return _turndown.turndown(text);
}

function sanitizeMarkdownText(text: string): string {
  if (!text || typeof text !== 'string') return text;
  return text
    .replace(/\\#/g, '#')
    .replace(/\\\*/g, '*')
    .replace(/\\_/g, '_')
    .replace(/\\-/g, '-')
    .replace(/\\\+/g, '+')
    .replace(/\\>/g, '>')
    .replace(/\\\[/g, '[')
    .replace(/\\\]/g, ']')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')');
}

function processContent(text: string, convertMd: boolean, sanitize: boolean): string {
  let result = text;
  if (convertMd) result = htmlToMarkdown(result);
  if (sanitize && convertMd) result = sanitizeMarkdownText(result);
  return result;
}

// ---------------------------------------------------------------------------
// Toggle component
// ---------------------------------------------------------------------------

interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  id: string;
}

function Toggle({ checked, onChange, id }: ToggleProps) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${checked ? "bg-primary" : "bg-zinc-200"}`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ${checked ? "translate-x-4" : "translate-x-0"}`}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DeckConverter() {
  const navigate = useNavigate();
  const [state, setState] = useState<any | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [copied, setCopied] = useState(false);

  const [exportMode, setExportMode] = useState<'full' | 'reduced'>('reduced');
  const [selectedFields, setSelectedFields] = useState<string[]>(['front', 'back', 'tags']);
  const [includeScheduling, setIncludeScheduling] = useState(false);
  const [includeDeckPreset, setIncludeDeckPreset] = useState(false);
  
  // Content Options
  const [convertMarkdown, setConvertMarkdown] = useState(true);
  const [sanitizeMarkdown, setSanitizeMarkdown] = useState(true);
  const [outputFormat, setOutputFormat] = useState<'json' | 'llm-md'>('json');
  const [llmMdFields, setLlmMdFields] = useState<LlmMarkdownFieldSelection>(DEFAULT_LLM_MARKDOWN_FIELDS);
  const [showFormatGuide, setShowFormatGuide] = useState(false);

  const llmMergeCapability = useMemo(
    () => evaluateLlmMergeCapability(llmMdFields),
    [llmMdFields],
  );
  const hasAnyLlmField = hasAnyLlmFieldSelected(llmMdFields);

  const toggleLlmMdField = (field: LlmMarkdownField) => {
    setLlmMdFields((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  // Field Categories for UI
  const contentFields = ['front', 'back', 'extra', 'flds'];
  const metaFields = ['id', 'guid', 'mid', 'mod', 'usn', 'tags'];
  const fieldDescriptions: Record<string, string> = {
    front: 'Front side of the flashcard (Question or Prompt).',
    back: 'Back side of the flashcard (Answer or Solution).',
    extra: 'Optional extra content for explanations or references.',
    flds: 'Raw Anki field array as joined string.',
    id: 'Internal numerical note ID in Anki database.',
    guid: 'Globally unique identifier for synchronization.',
    mid: 'Model ID (Note Type) defining card structure.',
    mod: 'Last modification Unix timestamp.',
    usn: 'Update Sequence Number for sync status.',
    tags: 'Tags for thematic categorization.',
  };

  const selectedLlmFieldLabels = [
    llmMdFields.id ? 'ID' : null,
    llmMdFields.question ? 'Q' : null,
    llmMdFields.answer ? 'A' : null,
  ].filter(Boolean);

  const exportSummary =
    outputFormat === 'llm-md'
      ? `LLM-MD · ${selectedLlmFieldLabels.length}/3 Fields${selectedLlmFieldLabels.length ? ` (${selectedLlmFieldLabels.join(', ')})` : ''}`
      : exportMode === 'reduced'
        ? `${selectedFields.length} Fields${includeScheduling ? ' + Scheduling' : ''}${includeDeckPreset ? ' + Preset' : ''}`
        : 'Full Database Export';

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const nextFile = acceptedFiles[0];
    if (!nextFile) return;
    setError(null);
    setState(null);
    setUploadedFile(nextFile);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { "application/octet-stream": [".apkg"] }, maxFiles: 1
  });

  useEffect(() => {
    if (!uploadedFile) return;

    let isCancelled = false;

    const runExtraction = async () => {
      setError(null);
      setIsProcessing(true);

      try {
        const isApkg = uploadedFile.name.toLowerCase().endsWith(".apkg");
        if (!isApkg) throw new Error("Currently only .apkg archives are supported for local client-side extraction.");

        const buffer = await uploadedFile.arrayBuffer();
        
        // Force include id, front, back when formatting for llm
        let fieldsToExtract = [...selectedFields];
        if (outputFormat === 'llm-md') {
           fieldsToExtract = Array.from(new Set([...fieldsToExtract, 'id', 'front', 'back']));
        }
        
        const rawResult = await decodeApkgRaw(buffer, exportMode, fieldsToExtract, {
          includeScheduling,
          includeDeckPreset,
        });

        if (!isCancelled) {
          setState({ rawResult, sourceFile: uploadedFile });
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!isCancelled) {
          setIsProcessing(false);
        }
      }
    };

    runExtraction();

    return () => {
      isCancelled = true;
    };
  }, [uploadedFile, exportMode, selectedFields, includeScheduling, includeDeckPreset, outputFormat]);

  const estimateTokens = (text: string): number => {
    return Math.ceil(text.length / 4);
  };

  // Apply Markdown transformation if requested
  const processedResult = useMemo(() => {
    if (!state) return null;
    
    // For full export, we don't deeply parse everything, just return as is
    if (exportMode === 'full') return state.rawResult;

    const processNoteFields = (note: any) => {
      const newNote = { ...note };
      ['front', 'back', 'extra'].forEach(field => {
        if (newNote[field] && typeof newNote[field] === 'string') {
          newNote[field] = processContent(newNote[field], convertMarkdown, sanitizeMarkdown);
        }
      });
      return newNote;
    };

    // Backward-compatible reduced export (flat notes array)
    if (exportMode === 'reduced' && Array.isArray(state.rawResult.notes)) {
      const processedNotes = state.rawResult.notes.map((note: any) => processNoteFields(note));
      return { ...state.rawResult, notes: processedNotes };
    }

    // Hierarchical reduced export (deck tree)
    if (
      exportMode === 'reduced' &&
      state.rawResult?.decks?.byId &&
      typeof state.rawResult.decks.byId === 'object'
    ) {
      const processedById = Object.fromEntries(
        Object.entries(state.rawResult.decks.byId).map(([deckId, deck]: [string, any]) => [
          deckId,
          {
            ...deck,
            notes: Array.isArray(deck.notes) ? deck.notes.map((note: any) => processNoteFields(note)) : [],
          },
        ]),
      );

      return {
        ...state.rawResult,
        decks: {
          ...state.rawResult.decks,
          byId: processedById,
        },
      };
    }

    return state.rawResult;
  }, [state, exportMode, convertMarkdown, sanitizeMarkdown]);

  const previewContent = useMemo(() => {
    if (!processedResult) return "";

    if (outputFormat === 'llm-md' && exportMode === 'reduced') {
      return exportDeckToLlmMarkdown(processedResult, llmMdFields);
    }

    return JSON.stringify(processedResult, null, 2);
  }, [processedResult, outputFormat, exportMode, llmMdFields]);
  const cardCount = useMemo(() => {
    if (exportMode !== 'reduced' || !processedResult) return null;

    if (typeof processedResult?.summary?.noteEntryCount === 'number') {
      return processedResult.summary.noteEntryCount;
    }

    if (Array.isArray(processedResult.notes)) {
      return processedResult.notes.length;
    }

    if (processedResult?.decks?.byId && typeof processedResult.decks.byId === 'object') {
      return Object.values(processedResult.decks.byId).reduce((sum: number, deck: any) => {
        const notesLength = Array.isArray(deck?.notes) ? deck.notes.length : 0;
        return sum + notesLength;
      }, 0);
    }

    return null;
  }, [processedResult, exportMode]);

  const schedulingIncluded = useMemo(() => {
    if (exportMode !== 'reduced') return false;
    if (typeof processedResult?.summary?.includesScheduling === 'boolean') {
      return processedResult.summary.includesScheduling;
    }
    return includeScheduling;
  }, [processedResult, exportMode, includeScheduling]);

  const payloadSizeBytes = useMemo(() => {
    if (!previewContent) return 0;
    return new Blob([previewContent], { type: 'application/json' }).size;
  }, [previewContent]);

  const payloadSizeLabel = useMemo(() => {
    if (payloadSizeBytes >= 1024 * 1024) {
      return `${(payloadSizeBytes / (1024 * 1024)).toFixed(2)} MB`;
    }
    return `${(payloadSizeBytes / 1024).toFixed(1)} KB`;
  }, [payloadSizeBytes]);

  const showSchedulingPayloadWarning = exportMode === 'reduced' && schedulingIncluded;

  const copyToClipboard = useCallback(async () => {
    await navigator.clipboard.writeText(previewContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [previewContent]);

  const downloadAsJson = useCallback(() => {
    if (!processedResult) return;
    const isMd = outputFormat === 'llm-md' && exportMode === 'reduced';
    const blob = new Blob([previewContent], { type: isMd ? "text/markdown" : "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    const ext = isMd ? ".md" : ".json";
    anchor.download = `${state.sourceFile.name.replace(/\.[^.]+$/, "")}-${exportMode}${ext}`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [processedResult, previewContent, exportMode, outputFormat, state]);

  const toggleField = (f: string) => {
    setSelectedFields(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);
  };

  // Download as single markdown file
  const downloadSingleMarkdown = useCallback(() => {
    if (!previewContent) return;
    const blob = new Blob([previewContent], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${state.sourceFile.name.replace(/\.[^.]+$/, "")}-llm.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [previewContent, state]);

  // Download as chunked zip for large files
  const downloadChunkedZip = useCallback(async () => {
    if (!previewContent) return;

    const chunks = chunkLlmMarkdownByTokens(previewContent, TOKEN_THRESHOLD_PER_CHUNK);
    const zip = new JSZip();
    
    chunks.forEach((chunk, idx) => {
      const chunkNum = idx + 1;
      const fileName = `part-${chunkNum}-of-${chunks.length}.md`;
      zip.file(fileName, chunk);
    });

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${state.sourceFile.name.replace(/\.[^.]+$/, "")}-llm-chunks.zip`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [previewContent, state]);

  const tokenCount = outputFormat === 'llm-md' && previewContent ? estimateTokens(previewContent) : null;
  const shouldRecommendChunking = tokenCount !== null && tokenCount > TOKEN_THRESHOLD_PER_CHUNK;
  const numChunks = shouldRecommendChunking ? Math.ceil(tokenCount / TOKEN_THRESHOLD_PER_CHUNK) : 0;

  const importedCardsForCreate = useMemo(() => {
    if (!processedResult || exportMode !== 'reduced') return [] as any[];

    const toCard = (note: any, deckName?: string) => {
      const fldsParts = typeof note?.flds === 'string' ? note.flds.split('\x1f') : [];
      const front = String(note?.front ?? fldsParts[0] ?? '');
      const back = String(note?.back ?? fldsParts[1] ?? '');
      if (!front && !back) return null;

      return {
        id: note?.id,
        front,
        back,
        tags: typeof note?.tags === 'string' ? note.tags : undefined,
        guid: typeof note?.guid === 'string' ? note.guid : undefined,
        mid: typeof note?.mid === 'number' ? note.mid : undefined,
        mod: typeof note?.mod === 'number' ? note.mod : undefined,
        usn: typeof note?.usn === 'number' ? note.usn : undefined,
        deckName,
        cards: Array.isArray(note?.cards) ? note.cards : undefined,
      };
    };

    if (Array.isArray((processedResult as any).notes)) {
      return (processedResult as any).notes
        .map((note: any) => toCard(note))
        .filter(Boolean);
    }

    if ((processedResult as any)?.decks?.byId) {
      const flattened: any[] = [];
      Object.values((processedResult as any).decks.byId).forEach((deck: any) => {
        if (!Array.isArray(deck?.notes)) return;
        const deckName = typeof deck?.fullName === 'string' ? deck.fullName : deck?.name;
        deck.notes.forEach((note: any) => {
          const card = toCard(note, deckName);
          if (card) flattened.push(card);
        });
      });
      return flattened;
    }

    return [] as any[];
  }, [processedResult, exportMode]);

  return (
    <TooltipProvider>
      <div className="relative h-[100dvh] overflow-hidden bg-background flex flex-col pt-8 pb-6 px-4 md:px-8 max-w-7xl mx-auto w-full">
        <div className="pointer-events-none fixed inset-0 -z-10 bg-grid opacity-50" />

        <header className="mb-4 flex flex-col gap-1 shrink-0">
          <Breadcrumb className="mb-1">
            <BreadcrumbList>
              <BreadcrumbItem><BreadcrumbLink asChild><Link to="/">Home</Link></BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbPage className="font-medium text-primary">APKG to MD/JSON</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <h1 className="text-3xl font-bold tracking-tight">APKG Extractor & Refiner (APKG to MD/JSON)</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Decompile Anki .apkg archives into structured JSON or LLM-Markdown for AI deck optimization and lossless re-import preserving all Anki Note IDs. 100% Client-side browser execution.
          </p>
        </header>

        <div className="mb-4 flex flex-wrap items-center gap-4 bg-muted/30 border rounded-lg px-4 py-3 shadow-2xs shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Target Format</span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={outputFormat === 'json' ? 'default' : 'outline'}
                onClick={() => setOutputFormat('json')}
                className="h-8 gap-1.5 text-xs"
              >
                <FileJson className="w-3.5 h-3.5" /> JSON
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant={outputFormat === 'llm-md' ? 'default' : 'outline'}
                    onClick={() => {
                      setOutputFormat('llm-md');
                      setExportMode('reduced');
                    }}
                    className="h-8 gap-1.5 text-xs"
                  >
                    <Braces className="w-3.5 h-3.5" /> LLM-MD
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Optimized for LLM prompts. Clean Markdown with Q&A structure and Card IDs.
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          <div className="w-px h-6 bg-border hidden sm:block" />

          <div className={`flex items-center gap-2 ${outputFormat === 'llm-md' ? 'opacity-40 pointer-events-none' : ''}`}>
            <span className="text-xs font-medium text-muted-foreground">Topology</span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={exportMode === 'reduced' ? 'default' : 'outline'}
                onClick={() => setExportMode('reduced')}
                className="h-8 gap-1.5 text-xs"
              >
                <LayoutGrid className="w-3.5 h-3.5" /> Focused
              </Button>
              <Button
                size="sm"
                variant={exportMode === 'full' ? 'default' : 'outline'}
                onClick={() => setExportMode('full')}
                className="h-8 gap-1.5 text-xs"
              >
                <Database className="w-3.5 h-3.5" /> Full Database
              </Button>
            </div>
          </div>

          <div className="w-px h-6 bg-border hidden md:block" />

          <div className={`flex items-center gap-2 ${exportMode === 'full' ? 'opacity-40 pointer-events-none' : ''}`}>
            <span className="text-xs font-medium text-muted-foreground">HTML → Markdown</span>
            <Toggle id="t-md" checked={convertMarkdown} onChange={setConvertMarkdown} />
          </div>

          <div className={`flex items-center gap-2 ${!convertMarkdown || exportMode === 'full' ? 'opacity-40 pointer-events-none' : ''}`}>
            <span className="text-xs font-medium text-muted-foreground">Sanitizer</span>
            <Toggle id="t-san" checked={sanitizeMarkdown} onChange={setSanitizeMarkdown} />
          </div>

          <div className={`flex items-center gap-2 ${exportMode === 'full' ? 'opacity-40 pointer-events-none' : ''}`}>
            <span className="text-xs font-medium text-muted-foreground">Scheduling</span>
            <Toggle id="t-scheduling" checked={includeScheduling} onChange={setIncludeScheduling} />
          </div>

          <div className={`flex items-center gap-2 ${exportMode === 'full' ? 'opacity-40 pointer-events-none' : ''}`}>
            <span className="text-xs font-medium text-muted-foreground">Deck Preset</span>
            <Toggle id="t-deck-preset" checked={includeDeckPreset} onChange={setIncludeDeckPreset} />
          </div>

          <div className="flex-1" />

          <Badge variant="outline" className="text-xs bg-background/60 border-zinc-300 text-foreground">
            {exportSummary}
          </Badge>
        </div>

        <main className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6">
          <div className="flex flex-col border rounded-xl overflow-hidden bg-card shadow-2xs min-h-0">
            <div className="bg-muted/50 px-4 py-3 border-b flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-zinc-700" />
                <span className="text-xs font-semibold uppercase tracking-wider text-foreground">Configuration</span>
              </div>
              <Badge variant="outline" className="text-[10px] bg-background leading-none py-1">
                Field Selection
              </Badge>
            </div>

            <div className="flex-1 min-h-0 bg-background/50 relative">
              <ScrollArea className="absolute inset-0 h-full w-full">
                <div className="p-4 flex flex-col gap-4">
                  {outputFormat === 'llm-md' ? (
                    <LlmMarkdownFieldSelector
                      selection={llmMdFields}
                      capability={llmMergeCapability}
                      onToggleField={toggleLlmMdField}
                      onSelectAll={() => setLlmMdFields(DEFAULT_LLM_MARKDOWN_FIELDS)}
                    />
                  ) : (
                    <>
                      <div className={`rounded-lg border bg-card p-4 space-y-3 transition-all ${exportMode === 'full' ? 'opacity-40 pointer-events-none grayscale' : ''}`}>
                        <div className="flex items-center justify-between border-b pb-2">
                          <label className="text-xs font-semibold text-foreground uppercase tracking-wider">Metadata</label>
                        </div>
                        <div className="flex flex-wrap gap-2 pt-1">
                          {metaFields.map(f => (
                            <Tooltip key={f}>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => toggleField(f)}
                                  className={`text-[11px] font-medium px-3 py-1.5 rounded-full border transition-colors ${selectedFields.includes(f) ? 'bg-zinc-900 text-zinc-50 border-zinc-900 shadow-xs' : 'bg-background hover:bg-muted text-muted-foreground'}`}
                                >
                                  {f}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                {fieldDescriptions[f]}
                              </TooltipContent>
                            </Tooltip>
                          ))}
                        </div>
                      </div>

                      <div className={`rounded-lg border bg-card p-4 space-y-3 transition-all ${exportMode === 'full' ? 'opacity-40 pointer-events-none grayscale' : ''}`}>
                        <div className="flex items-center justify-between border-b pb-2">
                          <label className="text-xs font-semibold text-foreground uppercase tracking-wider">Content</label>
                        </div>
                        <div className="flex flex-wrap gap-2 pt-1">
                          {contentFields.map(f => (
                            <Tooltip key={f}>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => toggleField(f)}
                                  className={`text-[11px] font-medium px-3 py-1.5 rounded-full border transition-colors ${selectedFields.includes(f) ? 'bg-zinc-900 text-zinc-50 border-zinc-900 shadow-xs' : 'bg-background hover:bg-muted text-muted-foreground'}`}
                                >
                                  {f}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                {fieldDescriptions[f]}
                              </TooltipContent>
                            </Tooltip>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  <div className={`rounded-lg border bg-card p-4 space-y-3 transition-all ${outputFormat === 'llm-md' ? '' : 'opacity-40 pointer-events-none grayscale'}`}>
                    <button
                      onClick={() => setShowFormatGuide(!showFormatGuide)}
                      className="w-full flex items-center justify-between text-xs font-semibold text-foreground uppercase tracking-wider hover:text-muted-foreground transition-colors"
                    >
                      <span>LLM-MD Format Guide</span>
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showFormatGuide ? 'rotate-180' : ''}`} />
                    </button>
                    {showFormatGuide && (
                      <div className="mt-3 pt-3 border-t space-y-2 text-xs text-muted-foreground leading-relaxed">
                        <div className="space-y-2">
                          <p className="font-semibold text-foreground">Current Export Structure:</p>
                          <div className="bg-background p-2 rounded border border-border/50 font-mono text-[10px] flex flex-col gap-0.5">
                            {hasAnyLlmField ? (
                              <>
                                {llmMdFields.id && <code>### CardId</code>}
                                {llmMdFields.question && <code>Q: Your Question?</code>}
                                {llmMdFields.answer && <code>A: Your Answer</code>}
                                <code>---</code>
                              </>
                            ) : (
                              <span className="text-muted-foreground italic">No fields selected</span>
                            )}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <p className="font-semibold text-foreground">To Delete Cards:</p>
                          <div className="bg-background p-2 rounded border border-border/50 font-mono text-[10px] flex flex-col gap-0.5">
                            <code>### CardId</code>
                            <code>[DELETE]</code>
                            <code>---</code>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <p className="font-semibold text-foreground">Key Rules:</p>
                          <ul className="list-disc list-inside space-y-1 opacity-90">
                            <li>Card IDs must remain untouched for merging</li>
                            <li>Ignore system comment header</li>
                            <li>Omitted & unchanged fields stay preserved during partial merge</li>
                            <li>Copy & paste response into LLM Merge Assistant</li>
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between border-b pb-2">
                      <label className="text-xs font-semibold text-foreground uppercase tracking-wider">Payload Notice</label>
                    </div>
                    {showSchedulingPayloadWarning ? (
                      <div className={`rounded-md border px-3 py-2 text-xs leading-relaxed ${payloadSizeBytes >= 1024 * 1024 ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-amber-200 bg-amber-50/70 text-amber-700'}`}>
                        <strong className="font-semibold block mb-0.5">Payload Notice</strong>
                        Enabling scheduling payload increases JSON payload size significantly.{state && !isProcessing && ` (${payloadSizeLabel})`}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Select fields for focused extraction. In full database export, all raw SQLite parameters are preserved unchanged.
                      </p>
                    )}
                  </div>

                  {error && (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive shadow-2xs">
                      <span className="font-semibold">Error:</span> {error}
                    </div>
                  )}

                  {state && (
                    <Button
                      variant="outline"
                      className="w-full border-dashed shadow-2xs h-10 text-xs"
                      onClick={() => document.getElementById('file-upload-hidden')?.click()}
                    >
                      <Upload className="w-4 h-4 mr-2" /> Load Different APKG File
                      <input
                        id="file-upload-hidden"
                        type="file"
                        className="hidden"
                        accept=".apkg"
                        onChange={(e) => {
                          if (e.target.files?.[0]) onDrop([e.target.files[0] as unknown as File]);
                          e.target.value = '';
                        }}
                      />
                    </Button>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>

          <div className="flex flex-col border rounded-xl overflow-hidden bg-card shadow-2xs min-h-0">
            <div className="bg-muted/50 px-4 py-3 border-b flex justify-between items-center shrink-0 gap-3">
              <div className="flex items-center gap-2">
                <FileJson className="w-4 h-4 text-zinc-700" />
                <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                  {outputFormat === 'llm-md' && exportMode === 'reduced' ? 'LLM Markdown Preview' : 'JSON Preview'}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {state && (
                  <Badge variant="outline" className="text-[10px] bg-background">
                    {(state.sourceFile.size / 1024).toFixed(1)} KB
                  </Badge>
                )}
                {cardCount !== null && (
                  <Badge variant="outline" className="text-[10px] bg-background inline-flex items-center gap-1">
                    <Braces className="w-3 h-3" /> {cardCount} Cards
                  </Badge>
                )}
                {tokenCount !== null && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="text-[10px] bg-background cursor-help">
                        ~{tokenCount.toLocaleString()} tokens
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      Estimated tokens for LLM context window (1 token ≈ 4 chars)
                    </TooltipContent>
                  </Tooltip>
                )}
                {exportMode === 'reduced' && state && (
                  <Badge variant="outline" className={`text-[10px] ${schedulingIncluded ? 'text-emerald-800 bg-emerald-50 border-emerald-200' : 'text-muted-foreground bg-background'}`}>
                    {schedulingIncluded ? 'Scheduling: On' : 'Scheduling: Off'}
                  </Badge>
                )}
                {isProcessing && state && (
                  <Badge variant="outline" className="text-[10px] text-zinc-800 bg-zinc-100">
                    Updating...
                  </Badge>
                )}
              </div>
            </div>

            <div className={`relative flex-1 min-h-0 overflow-hidden bg-background/50 ${!state && isDragActive ? 'bg-zinc-100/50' : ''}`}>
              {!state ? (
                <div
                  {...getRootProps()}
                  className={`absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 cursor-pointer outline-none transition-colors duration-200 ${isDragActive ? 'bg-zinc-100/50' : ''}`}
                >
                  <input {...getInputProps()} />
                  <div className={`flex h-24 w-24 items-center justify-center rounded-full border-2 border-dashed transition-colors shadow-2xs ${isDragActive ? 'border-zinc-900 bg-zinc-100 text-zinc-900 scale-110' : 'bg-background border-zinc-300 text-muted-foreground'} duration-300`}>
                    {isProcessing ? <RefreshCw className="w-10 h-10 animate-spin" /> : <Upload className="w-10 h-10" />}
                  </div>
                  <div className="flex flex-col items-center gap-2 px-6">
                    <h3 className="text-xl font-semibold text-foreground text-center">
                      {isProcessing ? 'Extracting...' : 'Drop APKG file here'}
                    </h3>
                    <p className="text-xs text-muted-foreground text-center max-w-sm leading-relaxed">
                      Drag and drop your Anki .apkg export package here or click to select a file.
                    </p>
                  </div>
                  <div className="mt-2 inline-flex items-center gap-2 text-xs font-medium text-muted-foreground border rounded-full px-3 py-1.5 bg-background shadow-2xs">
                    <Upload className="w-3.5 h-3.5" /> Supports .apkg (100% Client-Side)
                  </div>
                </div>
              ) : (
                <div className="flex flex-col h-full">
                  <div className="p-3 border-b bg-muted/20 flex flex-col gap-2 shrink-0">
                    <div className="flex gap-2 flex-wrap items-center">
                      {outputFormat === 'llm-md' && exportMode === 'reduced' && (
                        <>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex">
                                <Button
                                  onClick={() =>
                                    navigate('/llm-merge', {
                                      state: {
                                        originalJson: state.rawResult,
                                        deckName: state.sourceFile.name,
                                        exportedFields: llmMdFields,
                                      },
                                    })
                                  }
                                  disabled={!llmMergeCapability.canOpenMergeAssistant}
                                  size="sm"
                                  variant="default"
                                  className="h-8 gap-1.5 text-xs shadow-2xs"
                                >
                                  <Sparkles className="w-3.5 h-3.5" />
                                  {llmMergeCapability.status === 'partial'
                                    ? 'Open Merge Assistant (Partial)'
                                    : 'Open Merge Assistant'}
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-xs max-w-xs">
                              {llmMergeCapability.message}
                            </TooltipContent>
                          </Tooltip>

                          {llmMergeCapability.status !== 'full' && (
                            <div
                              className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
                                llmMergeCapability.status === 'partial'
                                  ? 'text-amber-800 bg-amber-50 border-amber-200'
                                  : 'text-destructive bg-destructive/10 border-destructive/30'
                              }`}
                            >
                              {llmMergeCapability.status === 'partial' ? (
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              ) : (
                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              )}
                              <span>{llmMergeCapability.title}</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    {outputFormat === 'llm-md' && state && shouldRecommendChunking && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-full w-fit">
                            <AlertCircle className="w-3.5 h-3.5" />
                            Large File ({numChunks} chunks)
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">
                          Split into {numChunks} parts to prevent LLM context degradation.
                        </TooltipContent>
                      </Tooltip>
                    )}
                    <div className="flex gap-2 flex-wrap">
                      {exportMode === 'reduced' && importedCardsForCreate.length > 0 && (
                        <Button
                          onClick={() =>
                            navigate('/deck/create', {
                              state: {
                                cards: importedCardsForCreate,
                                suggestedTitle: state.sourceFile.name.replace(/\.[^.]+$/, ''),
                              },
                            })
                          }
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1.5 text-xs bg-background"
                        >
                          <FileJson className="w-3.5 h-3.5" /> Configure Deck & Download JSON
                        </Button>
                      )}
                      {outputFormat === 'llm-md' && state && (
                        <>
                          {shouldRecommendChunking ? (
                            <>
                              <Button
                                onClick={downloadChunkedZip}
                                disabled={!hasAnyLlmField}
                                size="sm"
                                className="h-8 gap-1.5 text-xs shadow-2xs font-semibold"
                              >
                                <FileArchive className="w-3.5 h-3.5" /> ZIP ({numChunks} Chunks)
                              </Button>
                              <Button
                                onClick={downloadSingleMarkdown}
                                disabled={!hasAnyLlmField}
                                variant="outline"
                                size="sm"
                                className="h-8 gap-1.5 text-xs bg-background"
                              >
                                <Download className="w-3.5 h-3.5" /> Single File
                              </Button>
                            </>
                          ) : (
                            <Button
                              onClick={downloadSingleMarkdown}
                              disabled={!hasAnyLlmField}
                              size="sm"
                              className="h-8 gap-1.5 text-xs shadow-2xs"
                            >
                              <Download className="w-3.5 h-3.5" /> Download LLM-MD
                            </Button>
                          )}
                        </>
                      )}
                      <Button
                        onClick={copyToClipboard}
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-xs bg-background"
                        disabled={!state || (outputFormat === 'llm-md' && !hasAnyLlmField)}
                      >
                        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copied ? 'Copied' : 'Copy'}
                      </Button>
                      {outputFormat !== 'llm-md' && (
                        <Button
                          onClick={downloadAsJson}
                          size="sm"
                          className="h-8 gap-1.5 text-xs shadow-2xs"
                          disabled={!state}
                        >
                          <Download className="w-3.5 h-3.5" /> Export JSON
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="relative flex-1 min-h-0">
                    {outputFormat === 'llm-md' && !hasAnyLlmField ? (
                      <div className="h-full flex flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
                        <AlertCircle className="w-8 h-8 opacity-40" />
                        <p className="text-xs font-medium text-foreground">No LLM-MD fields selected</p>
                        <p className="text-xs max-w-xs">
                          Enable at least one field (ID, Question, or Answer) in the configuration panel to generate Markdown output.
                        </p>
                      </div>
                    ) : (
                      <ScrollArea className="absolute inset-0 h-full w-full">
                        <pre
                          aria-label={outputFormat === 'llm-md' && exportMode === 'reduced' ? 'LLM Markdown Output' : 'JSON Output'}
                          className="inline-block min-w-full bg-transparent p-5 font-mono text-[13px] leading-relaxed whitespace-pre text-foreground selection:bg-blue-500/30 dark:selection:bg-blue-400/40"
                        >
                          {previewContent}
                        </pre>
                      </ScrollArea>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}
