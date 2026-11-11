import { useState, useCallback, useMemo } from "react";
import { useDropzone } from "react-dropzone";
import { Link, useNavigate } from "react-router-dom";
import {
  Wand2,
  Download,
  Upload,
  Check,
  RotateCcw,
  Layers,
  Sparkles,
  ShieldCheck,
  Clock,
  Eye,
  FileArchive,
  ArrowRight,
  BookOpen,
  Search,
  CheckCircle2,
  AlertCircle,
  FileJson,
  Replace,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { decodeApkgRaw } from "@/converters/apkg";
import { createApkgFromAnkiJson } from "@/converters/jsonToApkg";
import { CARD_TEMPLATES, type CardTemplateId } from "@/converters/templates";
import { KaTeXRenderer } from "@/components/flashcard/KaTeXPreview";
import {
  defaultDeckTransformerService,
  type TransformationConfig,
  DEFAULT_TRANSFORMATION_CONFIG as DEFAULT_CONFIG,
} from "@/services/deckTransformer";

interface NoteCardItem {
  id: number;
  deckId: number;
  deckName: string;
  originalFront: string;
  originalBack: string;
  transformedFront: string;
  transformedBack: string;
  flds?: string;
  tags?: string;
  scheduling?: {
    type?: number;
    queue?: number;
    due?: number;
    ivl?: number;
    factor?: number;
    reps?: number;
    lapses?: number;
  };
}

export default function DeckRemaster() {
  const navigate = useNavigate();

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [deckRawData, setDeckRawData] = useState<any | null>(null);
  const [isDecompiling, setIsDecompiling] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [config, setConfig] = useState<TransformationConfig>(DEFAULT_CONFIG);
  const [regenerateIds, setRegenerateIds] = useState(true);
  const [exportAnkiMathJax, setExportAnkiMathJax] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCardIndex, setSelectedCardIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<"diff" | "preview" | "raw">("diff");

  // Decompile uploaded APKG
  const handleDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setError(null);
    setSuccessMessage(null);
    setUploadedFile(file);
    setIsDecompiling(true);

    try {
      const buffer = await file.arrayBuffer();
      const rawResult = await decodeApkgRaw(
        buffer,
        "reduced",
        ["front", "back", "extra", "flds", "id", "guid", "mid", "mod", "usn", "tags"],
        { includeScheduling: true, includeDeckPreset: true }
      );

      setDeckRawData(rawResult);
      setSelectedCardIndex(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to decompile .apkg file.");
      setDeckRawData(null);
    } finally {
      setIsDecompiling(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleDrop,
    accept: { "application/octet-stream": [".apkg"] },
    maxFiles: 1,
  });

  // Extract flattened note entries and apply live transformations
  const noteItems: NoteCardItem[] = useMemo(() => {
    if (!deckRawData?.decks?.byId) return [];

    const items: NoteCardItem[] = [];

    for (const [deckIdStr, rawDeck] of Object.entries(deckRawData.decks.byId as Record<string, any>)) {
      const deckId = Number(deckIdStr);
      const deckName = rawDeck.fullName || rawDeck.name || `Deck ${deckId}`;
      const notes = Array.isArray(rawDeck.notes) ? rawDeck.notes : [];

      for (const note of notes) {
        const origFront = String(note.front || "");
        const origBack = String(note.back || "");

        const transformedFront = defaultDeckTransformerService.transformField(origFront, config, {
          fieldName: "front",
          noteId: Number(note.id),
          deckName,
        });
        const transformedBack = defaultDeckTransformerService.transformField(origBack, config, {
          fieldName: "back",
          noteId: Number(note.id),
          deckName,
        });

        const firstCard = Array.isArray(note.cards) && note.cards.length > 0 ? note.cards[0] : null;

        items.push({
          id: Number(note.id),
          deckId,
          deckName,
          originalFront: origFront,
          originalBack: origBack,
          transformedFront,
          transformedBack,
          flds: note.flds,
          tags: note.tags,
          scheduling: firstCard?.scheduling,
        });
      }
    }

    return items;
  }, [deckRawData, config]);

  // Scheduling Statistics
  const schedulingStats = useMemo(() => {
    let newCards = 0;
    let learningCards = 0;
    let reviewCards = 0;
    let suspendedCards = 0;
    let totalReps = 0;

    for (const item of noteItems) {
      const s = item.scheduling;
      if (!s) {
        newCards++;
        continue;
      }
      totalReps += s.reps || 0;
      const q = typeof s.queue === "number" ? s.queue : 0;
      if (q === 0) newCards++;
      else if (q === 1) learningCards++;
      else if (q === 2) reviewCards++;
      else if (q < 0) suspendedCards++;
      else reviewCards++;
    }

    return { newCards, learningCards, reviewCards, suspendedCards, totalReps };
  }, [noteItems]);

  // Filtered note items
  const filteredNoteItems = useMemo(() => {
    if (!searchQuery.trim()) return noteItems;
    const q = searchQuery.toLowerCase();
    return noteItems.filter(
      (item) =>
        item.originalFront.toLowerCase().includes(q) ||
        item.originalBack.toLowerCase().includes(q) ||
        item.transformedFront.toLowerCase().includes(q) ||
        item.transformedBack.toLowerCase().includes(q) ||
        String(item.id).includes(q)
    );
  }, [noteItems, searchQuery]);

  const currentItem = filteredNoteItems[selectedCardIndex] || filteredNoteItems[0] || null;

  // Repack and export to .apkg with preserved scheduling
  const handleExportRemasteredApkg = useCallback(async () => {
    if (!deckRawData || noteItems.length === 0) return;

    setIsExporting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      // Build updated Anki JSON with transformed front/back
      const transformedJson = JSON.parse(JSON.stringify(deckRawData));

      if (transformedJson.decks?.byId) {
        for (const rawDeck of Object.values(transformedJson.decks.byId as Record<string, any>)) {
          if (Array.isArray(rawDeck.notes)) {
            for (const note of rawDeck.notes) {
              const origFront = String(note.front || "");
              const origBack = String(note.back || "");

              note.front = defaultDeckTransformerService.transformField(origFront, config, {
                fieldName: "front",
                noteId: Number(note.id),
              });
              note.back = defaultDeckTransformerService.transformField(origBack, config, {
                fieldName: "back",
                noteId: Number(note.id),
              });

              // Update flds array if present
              if (note.flds) {
                const parts = String(note.flds).split("\x1f");
                if (parts.length >= 2) {
                  parts[0] = note.front;
                  parts[1] = note.back;
                  for (let i = 2; i < parts.length; i++) {
                    parts[i] = defaultDeckTransformerService.transformField(parts[i], config, {
                      fieldName: `field_${i}`,
                      noteId: Number(note.id),
                    });
                  }
                  note.flds = parts.join("\x1f");
                }
              }
            }
          }
        }
      }

      const baseName = uploadedFile ? uploadedFile.name.replace(/\.[^.]+$/, "") : "deck";
      const deckTitle = `${baseName} (Remastered)`;

      const blob = await createApkgFromAnkiJson(
        transformedJson,
        deckTitle,
        config.targetTemplate,
        {
          regenerateIds,
          mathFormat: exportAnkiMathJax
            ? "anki_mathjax"
            : config.normalizeMath
              ? "katex"
              : "preserve",
        },
      );

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${baseName}_remastered.apkg`;
      a.click();
      URL.revokeObjectURL(url);

      setSuccessMessage(
        regenerateIds
          ? `Deck successfully remastered and exported with fresh IDs! 100% of scheduling, review history, and FSRS states preserved. Imports cleanly into Anki without duplicate skips or conflicts.`
          : `Deck successfully remastered and exported with preserved IDs! Tip: When importing into Anki, ensure "Update existing notes" is enabled.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to repack and export .apkg file.");
    } finally {
      setIsExporting(false);
    }
  }, [deckRawData, noteItems, config, uploadedFile, regenerateIds, exportAnkiMathJax]);

  // Send cards to Schedae Workspace
  const handleSendToWorkspace = useCallback(() => {
    if (noteItems.length === 0) return;

    const cardsForWorkspace = noteItems.map((n) => ({
      front: n.transformedFront,
      back: n.transformedBack,
    }));

    const batch = [
      {
        id: Date.now().toString(),
        timestamp: Date.now(),
        name: uploadedFile ? uploadedFile.name.replace(/\.[^.]+$/, "") : "Remastered Batch",
        cards: cardsForWorkspace,
      },
    ];

    localStorage.setItem("schedae-workspace-builder-batches", JSON.stringify(batch));
    localStorage.setItem("json-apkg-builder-batches", JSON.stringify(batch));
    navigate("/");
  }, [noteItems, uploadedFile, navigate]);

  return (
    <div className="relative h-full flex-1 min-h-0 overflow-hidden bg-background flex flex-col w-full max-w-[1920px] mx-auto px-3 sm:px-6 py-2.5 sm:py-3">
      {/* Top Header when deck is loaded: Sleek, compact, zero wasted whitespace */}
      {deckRawData ? (
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Breadcrumb>
              <BreadcrumbList className="text-xs">
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link to="/">Home</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage className="font-semibold text-foreground flex items-center gap-1.5">
                    <Replace className="w-3.5 h-3.5 text-zinc-800 shrink-0" />
                    <span>Transform and Update</span>
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <span className="hidden md:inline text-zinc-300">|</span>
            <span className="hidden md:inline text-xs text-muted-foreground truncate max-w-xl">
              Sanitize formatting, convert math &amp; HTML to Markdown, and upgrade templates losslessly.
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDeckRawData(null);
                setUploadedFile(null);
                setError(null);
                setSuccessMessage(null);
              }}
              className="h-8 text-xs gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" /> New Deck
            </Button>
            <Button
              onClick={handleExportRemasteredApkg}
              disabled={isExporting}
              size="sm"
              className="h-8 text-xs font-semibold gap-1.5 shadow-2xs cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              {isExporting ? "Repacking..." : "Export Remastered .apkg"}
            </Button>
          </div>
        </div>
      ) : (
        /* Top Header when NO deck is loaded: Welcoming overview */
        <div className="flex flex-col gap-2.5 mb-4 shrink-0 max-w-3xl mx-auto w-full">
          <Breadcrumb>
            <BreadcrumbList className="text-xs">
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/">Home</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="font-medium text-foreground">
                  Deck Transformation
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
              <Replace className="w-6 h-6 text-zinc-800" />
              <span>Transform and Update</span>
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Decompile legacy <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">.apkg</code> decks, sanitize broken formatting, modernize list bullets and math syntax, and upgrade card templates without losing your scheduling history.
            </p>
          </div>
        </div>
      )}

      {/* Notifications */}
      {error && (
        <div className="mt-2.5 mb-1 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive shrink-0">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="mt-2.5 mb-1 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-800 shrink-0">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span className="font-medium">{successMessage}</span>
        </div>
      )}

      {/* Upload Dropzone (When no deck loaded) */}
      {!deckRawData ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 overflow-y-auto">
          <div
            {...getRootProps()}
            className={`w-full max-w-2xl border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
              isDragActive
                ? "border-primary bg-primary/5 scale-[1.01]"
                : "border-zinc-300 hover:border-zinc-400 bg-zinc-50/50 hover:bg-zinc-50"
            }`}
          >
            <input {...getInputProps()} />
            <div className="w-14 h-14 rounded-full bg-zinc-100 flex items-center justify-center mb-4 text-zinc-700 shadow-2xs">
              {isDecompiling ? (
                <Sparkles className="w-7 h-7 animate-spin text-zinc-900" />
              ) : (
                <FileArchive className="w-7 h-7" />
              )}
            </div>
            <h3 className="text-base font-semibold text-foreground mb-1">
              {isDecompiling ? "Decompiling Anki Package..." : "Drop your .apkg file here"}
            </h3>
            <p className="text-xs text-muted-foreground max-w-md mb-4">
              Select or drop an existing Anki deck. The deck will be decompiled 100% locally in your browser. All note metadata, tags, and scheduling history are preserved.
            </p>
            <Button size="sm" variant="outline" className="text-xs pointer-events-none">
              <Upload className="w-3.5 h-3.5 mr-1.5" /> Select .apkg from Computer
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl w-full mt-8">
            <div className="p-4 rounded-xl border border-zinc-200/80 bg-white shadow-2xs">
              <div className="flex items-center gap-2 text-zinc-900 font-semibold text-xs mb-1">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Scheduling Safe</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Intervals, ease factors, repetition counts, and due dates are preserved untouched in the SQLite database.
              </p>
            </div>
            <div className="p-4 rounded-xl border border-zinc-200/80 bg-white shadow-2xs">
              <div className="flex items-center gap-2 text-zinc-900 font-semibold text-xs mb-1">
                <Sparkles className="w-4 h-4 text-zinc-800" />
                <span>Fix Formatting</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Removes stray <code>&lt;br&gt; *</code> artifacts, cleans single-space indentations, and normalizes LaTeX math.
              </p>
            </div>
            <div className="p-4 rounded-xl border border-zinc-200/80 bg-white shadow-2xs">
              <div className="flex items-center gap-2 text-zinc-900 font-semibold text-xs mb-1">
                <Layers className="w-4 h-4 text-zinc-800" />
                <span>Modern Templates</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Upgrades cards to Schedae's responsive KaTeX and Markdown templates with dark mode support.
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* Workspace when deck is loaded */
        <div className="flex-1 min-h-0 pt-2.5 grid grid-cols-1 lg:grid-cols-[360px_1fr] xl:grid-cols-[380px_1fr] gap-3.5 overflow-hidden">
          {/* Left Column: Deck Info & Transformation Settings with smooth scroll */}
          <div className="h-full min-h-0 flex flex-col gap-3 overflow-y-auto pr-0.5">
            {/* Deck Summary Card */}
            <Card className="rounded-xl border shadow-2xs overflow-hidden shrink-0">
              <div className="bg-muted/40 px-3.5 py-2.5 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileArchive className="w-4 h-4 text-zinc-800" />
                  <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                    Source Deck
                  </span>
                </div>
                <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-800 border-emerald-200">
                  <ShieldCheck className="w-3 h-3 mr-1" /> Scheduling Safe
                </Badge>
              </div>

              <CardContent className="p-3.5 space-y-2.5">
                <div>
                  <h4 className="text-xs font-bold text-foreground truncate" title={uploadedFile?.name || "Uploaded Deck"}>
                    {uploadedFile?.name || "Uploaded Deck"}
                  </h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {noteItems.length} Notes &bull; {deckRawData?.summary?.cardCount || noteItems.length} Cards
                  </p>
                </div>

                {/* Scheduling Pill Breakdown */}
                <div className="grid grid-cols-2 gap-1.5 pt-2 border-t text-xs">
                  <div className="bg-muted/40 p-2 rounded-md">
                    <span className="text-[10px] text-muted-foreground block leading-tight">Review Cards</span>
                    <span className="font-semibold text-foreground text-xs">{schedulingStats.reviewCards}</span>
                  </div>
                  <div className="bg-muted/40 p-2 rounded-md">
                    <span className="text-[10px] text-muted-foreground block leading-tight">Learning / New</span>
                    <span className="font-semibold text-foreground text-xs">
                      {schedulingStats.learningCards + schedulingStats.newCards}
                    </span>
                  </div>
                  <div className="bg-muted/40 p-2 rounded-md">
                    <span className="text-[10px] text-muted-foreground block leading-tight">Total Repetitions</span>
                    <span className="font-semibold text-foreground text-xs">{schedulingStats.totalReps}</span>
                  </div>
                  <div className="bg-muted/40 p-2 rounded-md">
                    <span className="text-[10px] text-muted-foreground block leading-tight">Suspended</span>
                    <span className="font-semibold text-foreground text-xs">{schedulingStats.suspendedCards}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Transformation Rules Card */}
            <Card className="rounded-xl border shadow-2xs overflow-hidden shrink-0">
              <div className="bg-muted/40 px-3.5 py-2.5 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wand2 className="w-4 h-4 text-zinc-800" />
                  <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                    Transformations
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfig(DEFAULT_CONFIG)}
                  className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Reset Defaults
                </Button>
              </div>

              <CardContent className="p-3.5 space-y-3">
                {/* Target Template */}
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">
                    Target Card Template
                  </label>
                  <select
                    value={config.targetTemplate}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        targetTemplate: e.target.value as CardTemplateId,
                      }))
                    }
                    className="w-full text-xs bg-background border rounded-md px-2.5 py-1.5 focus:ring-1 focus:ring-ring cursor-pointer"
                  >
                    {(Object.keys(CARD_TEMPLATES) as CardTemplateId[]).map((tId) => (
                      <option key={tId} value={tId}>
                        {CARD_TEMPLATES[tId].label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Toggles */}
                <div className="space-y-2.5 pt-2 border-t">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.cleanListBullets}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, cleanListBullets: e.target.checked }))
                      }
                      className="mt-0.5 rounded border-zinc-300 text-primary focus:ring-primary"
                    />
                    <div className="text-xs leading-normal">
                      <span className="font-medium text-foreground block">
                        Fix List Bullets &amp; Indents
                      </span>
                      <span className="text-[11px] text-muted-foreground leading-snug">
                        Removes stray <code>&lt;br&gt; *</code> tags and trims accidental single-space indents.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.normalizeMath}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, normalizeMath: e.target.checked }))
                      }
                      className="mt-0.5 rounded border-zinc-300 text-primary focus:ring-primary"
                    />
                    <div className="text-xs leading-normal">
                      <span className="font-medium text-foreground block">
                        Normalize Math &amp; LaTeX
                      </span>
                      <span className="text-[11px] text-muted-foreground leading-snug">
                        Converts Anki MathJax tags and raw <code>\(\)</code> / <code>\[\]</code> into <code>$..$</code> and <code>$$..$$</code>.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.htmlToMarkdown}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, htmlToMarkdown: e.target.checked }))
                      }
                      className="mt-0.5 rounded border-zinc-300 text-primary focus:ring-primary"
                    />
                    <div className="text-xs leading-normal">
                      <span className="font-medium text-foreground block">
                        Convert HTML to Markdown
                      </span>
                      <span className="text-[11px] text-muted-foreground leading-snug">
                        Translates legacy HTML formatting tags (<code>&lt;b&gt;</code>, <code>&lt;i&gt;</code>, <code>&lt;ul&gt;</code>) into clean Markdown.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.stripFieldLabels}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, stripFieldLabels: e.target.checked }))
                      }
                      className="mt-0.5 rounded border-zinc-300 text-primary focus:ring-primary"
                    />
                    <div className="text-xs leading-normal">
                      <span className="font-medium text-foreground block">
                        Strip Redundant Field Labels
                      </span>
                      <span className="text-[11px] text-muted-foreground leading-snug">
                        Removes hardcoded prefixes like <code>**Front:**</code> or <code>**Antwort:**</code>.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.normalizeWhitespace}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, normalizeWhitespace: e.target.checked }))
                      }
                      className="mt-0.5 rounded border-zinc-300 text-primary focus:ring-primary"
                    />
                    <div className="text-xs leading-normal">
                      <span className="font-medium text-foreground block">
                        Clean Spacing &amp; Linebreaks
                      </span>
                      <span className="text-[11px] text-muted-foreground leading-snug">
                        Trims trailing whitespace and standardizes paragraph line breaks.
                      </span>
                    </div>
                  </label>
                </div>

                {/* Anki Import Mode */}
                <div className="pt-2.5 border-t space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider">
                      Anki Import Mode
                    </span>
                    {regenerateIds && (
                      <Badge variant="outline" className="text-[9px] py-0 px-1 text-emerald-700 bg-emerald-50 border-emerald-200">
                        Safe Import
                      </Badge>
                    )}
                  </div>
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={regenerateIds}
                      onChange={(e) => setRegenerateIds(e.target.checked)}
                      className="mt-0.5 rounded border-zinc-300 text-primary focus:ring-primary"
                    />
                    <div className="text-xs leading-normal">
                      <span className="font-medium text-foreground block">
                        Generate New IDs (Independent Deck)
                      </span>
                      <span className="text-[11px] text-muted-foreground leading-snug">
                        Assigns fresh GUIDs &amp; card IDs so Anki imports cleanly without duplicate skips or notetype conflicts. 100% of scheduling is preserved.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={exportAnkiMathJax}
                      onChange={(e) => setExportAnkiMathJax(e.target.checked)}
                      className="mt-0.5 rounded border-zinc-300 text-primary focus:ring-primary"
                    />
                    <div className="text-xs leading-normal">
                      <span className="font-medium text-foreground block">
                        Convert Math to Anki MathJax (Opt-in)
                      </span>
                      <span className="text-[11px] text-muted-foreground leading-snug">
                        Exports formulas as clean <code>\(\)</code> / <code>\[\]</code> instead of plain KaTeX <code>$</code> / <code>$$</code>.
                      </span>
                    </div>
                  </label>
                </div>

                {/* Secondary Actions */}
                <div className="pt-2.5 border-t">
                  <Button
                    onClick={handleSendToWorkspace}
                    variant="outline"
                    size="sm"
                    className="w-full text-xs h-8 justify-start gap-2 cursor-pointer"
                  >
                    <BookOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">Send to Schedae Workspace (MD &rarr; APKG)</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Card Inspection & Diff View */}
          <div className="flex flex-col border rounded-xl overflow-hidden bg-card shadow-2xs h-full min-h-0">
            {/* Top Toolbar */}
            <div className="bg-muted/40 px-3.5 py-2 border-b flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                  Card Inspector
                </span>
                <Badge variant="secondary" className="text-[10px] leading-none py-1">
                  Card {selectedCardIndex + 1} of {filteredNoteItems.length}
                </Badge>
              </div>

              {/* View Tabs */}
              <div className="inline-flex rounded-lg bg-zinc-100 p-0.5 border text-xs shrink-0">
                <button
                  onClick={() => setActiveTab("diff")}
                  className={`px-2.5 py-1 rounded-md transition-all font-medium cursor-pointer ${
                    activeTab === "diff"
                      ? "bg-white text-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Diff Compare
                </button>
                <button
                  onClick={() => setActiveTab("preview")}
                  className={`px-2.5 py-1 rounded-md transition-all font-medium cursor-pointer ${
                    activeTab === "preview"
                      ? "bg-white text-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Rendered Preview
                </button>
                <button
                  onClick={() => setActiveTab("raw")}
                  className={`px-2.5 py-1 rounded-md transition-all font-medium cursor-pointer ${
                    activeTab === "raw"
                      ? "bg-white text-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Raw Metadata
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative w-36 sm:w-48 md:w-56 shrink-0">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Filter cards..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setSelectedCardIndex(0);
                  }}
                  className="w-full text-xs bg-background border rounded-lg pl-8 pr-3 py-1 focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>

            {/* Inspector Body */}
            {currentItem ? (
              <div className="flex-1 flex flex-col min-h-0">
                {/* Active Card Header */}
                <div className="px-3.5 py-1.5 border-b bg-muted/15 flex items-center justify-between text-xs text-muted-foreground gap-2 shrink-0">
                  <div className="flex items-center gap-2 truncate">
                    <span className="font-mono text-[11px] font-medium text-foreground shrink-0">
                      Note #{currentItem.id}
                    </span>
                    <span>&bull;</span>
                    <span className="truncate max-w-[280px]">{currentItem.deckName}</span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {currentItem.scheduling ? (
                      <Badge variant="outline" className="text-[10px] leading-none py-0.5 bg-background">
                        <Clock className="w-3 h-3 mr-1 text-zinc-500" />
                        Queue: {currentItem.scheduling.queue ?? 0} &bull; Reps: {currentItem.scheduling.reps ?? 0}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] leading-none py-0.5 bg-background">
                        New Card
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Content View Modes */}
                <div className="flex-1 min-h-0 p-3 overflow-hidden">
                  {activeTab === "diff" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 h-full min-h-0">
                      {/* Original */}
                      <div className="flex flex-col border rounded-lg bg-zinc-50/50 overflow-hidden h-full min-h-0">
                        <div className="px-3 py-1.5 border-b bg-zinc-100 text-[11px] font-semibold text-zinc-600 uppercase tracking-wider flex justify-between shrink-0">
                          <span>Original (Legacy HTML / Raw)</span>
                          <span className="text-[10px] lowercase text-zinc-400">before</span>
                        </div>
                        <ScrollArea className="flex-1 min-h-0 p-3">
                          <div className="space-y-3 font-mono text-xs">
                            <div>
                              <span className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">
                                Front
                              </span>
                              <pre className="whitespace-pre-wrap text-zinc-800 break-words bg-white p-2 rounded border border-zinc-200/80">
                                {currentItem.originalFront || "(Empty)"}
                              </pre>
                            </div>
                            <div>
                              <span className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">
                                Back
                              </span>
                              <pre className="whitespace-pre-wrap text-zinc-800 break-words bg-white p-2 rounded border border-zinc-200/80">
                                {currentItem.originalBack || "(Empty)"}
                              </pre>
                            </div>
                          </div>
                        </ScrollArea>
                      </div>

                      {/* Remastered */}
                      <div className="flex flex-col border rounded-lg bg-emerald-50/20 border-emerald-200 overflow-hidden h-full min-h-0">
                        <div className="px-3 py-1.5 border-b bg-emerald-50 text-[11px] font-semibold text-emerald-800 uppercase tracking-wider flex justify-between shrink-0">
                          <span>Remastered (Clean Markdown)</span>
                          <span className="text-[10px] lowercase text-emerald-600 font-bold">after</span>
                        </div>
                        <ScrollArea className="flex-1 min-h-0 p-3">
                          <div className="space-y-3 font-mono text-xs">
                            <div>
                              <span className="text-[10px] font-bold text-emerald-900 uppercase block mb-1">
                                Front
                              </span>
                              <pre className="whitespace-pre-wrap text-foreground break-words bg-white p-2 rounded border border-emerald-200">
                                {currentItem.transformedFront || "(Empty)"}
                              </pre>
                            </div>
                            <div>
                              <span className="text-[10px] font-bold text-emerald-900 uppercase block mb-1">
                                Back
                              </span>
                              <pre className="whitespace-pre-wrap text-foreground break-words bg-white p-2 rounded border border-emerald-200">
                                {currentItem.transformedBack || "(Empty)"}
                              </pre>
                            </div>
                          </div>
                        </ScrollArea>
                      </div>
                    </div>
                  )}

                  {activeTab === "preview" && (
                    <div className="h-full flex flex-col border rounded-xl p-5 bg-white shadow-2xs overflow-y-auto">
                      <div className="max-w-2xl mx-auto w-full space-y-5">
                        <div>
                          <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
                            Front (Question)
                          </span>
                          <div className="p-3.5 rounded-xl bg-zinc-50 border text-foreground font-medium text-base">
                            <KaTeXRenderer text={currentItem.transformedFront} />
                          </div>
                        </div>

                        <hr className="border-border/60" />

                        <div>
                          <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
                            Back (Answer &bull; Markdown &amp; Math)
                          </span>
                          <div className="p-3.5 rounded-xl bg-zinc-50 border text-foreground text-sm">
                            <KaTeXRenderer text={currentItem.transformedBack} />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === "raw" && (
                    <div className="h-full border rounded-lg bg-zinc-900 text-zinc-100 p-4 font-mono text-xs overflow-auto">
                      <pre>{JSON.stringify(currentItem, null, 2)}</pre>
                    </div>
                  )}
                </div>

                {/* Card Navigation Pagination Footer */}
                <div className="px-3.5 py-2 border-t bg-muted/20 flex items-center justify-between shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={selectedCardIndex <= 0}
                    onClick={() => setSelectedCardIndex((prev) => Math.max(0, prev - 1))}
                    className="h-8 text-xs cursor-pointer"
                  >
                    Previous Card
                  </Button>

                  <span className="text-xs text-muted-foreground">
                    Card {selectedCardIndex + 1} of {filteredNoteItems.length}
                  </span>

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={selectedCardIndex >= filteredNoteItems.length - 1}
                    onClick={() =>
                      setSelectedCardIndex((prev) => Math.min(filteredNoteItems.length - 1, prev + 1))
                    }
                    className="h-8 text-xs cursor-pointer"
                  >
                    Next Card
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-muted-foreground">
                <Search className="w-8 h-8 opacity-20 mb-2" />
                <p className="text-xs">No cards matching "{searchQuery}"</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
