import { useState, useCallback, useEffect, useMemo } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Braces, Save, Sparkles, BookOpen, Upload, Layers, AlertTriangle, AlertCircle } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import JSZip from "jszip";
import {
  DEFAULT_LLM_MARKDOWN_FIELDS,
  evaluateLlmMergeCapability,
  mergeLlmMarkdownIntoDeck,
  type LlmMarkdownFieldSelection,
  type LlmMergeStats,
} from "@/services/llmMarkdown";

const INITIAL_STATS: LlmMergeStats = {
  updated: 0,
  partialUpdated: 0,
  deleted: 0,
  unmodified: 0,
  blocksMissingId: 0,
};

export default function LlmMerge() {
  const location = useLocation();
  const navigate = useNavigate();

  const originalJson = location.state?.originalJson || null;
  const deckName = location.state?.deckName || "deck.apkg";
  const exportedFields: LlmMarkdownFieldSelection =
    location.state?.exportedFields || DEFAULT_LLM_MARKDOWN_FIELDS;
  const mergeCapability = useMemo(
    () => evaluateLlmMergeCapability(exportedFields),
    [exportedFields],
  );

  const [llmMarkdown, setLlmMarkdown] = useState<string>("");
  const [mergedJson, setMergedJson] = useState<any>(null);
  const [stats, setStats] = useState<LlmMergeStats>(INITIAL_STATS);

  const handleFileUpload = async (file: File) => {
    try {
      if (file.type === 'application/zip' || file.name.endsWith('.zip')) {
        // Handle zip file - extract and combine all .md files
        const zip = new JSZip();
        const loaded = await zip.loadAsync(file);
        const mdFiles: string[] = [];

        // Extract all .md files sorted by name for proper ordering
        const sortedEntries = Object.entries(loaded.files)
          .filter(([path, entry]) => path.endsWith('.md') && !entry.dir)
          .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));

        for (const [, zipEntry] of sortedEntries) {
          const content = await zipEntry.async('text');
          mdFiles.push(content);
        }

        if (mdFiles.length === 0) {
          throw new Error("Keine .md Dateien in der ZIP gefunden.");
        }

        // Combine all markdown parts with separator
        const combined = mdFiles.join('\n\n');
        setLlmMarkdown(combined);
      } else if (file.type === 'text/markdown' || file.type === 'text/plain' || file.name.endsWith('.md')) {
        // Handle single markdown file
        const content = await file.text();
        setLlmMarkdown(content);
      } else {
        throw new Error("Bitte upload eine .md oder .zip Datei.");
      }
    } catch (err) {
      console.error("File upload error:", err);
      alert(err instanceof Error ? err.message : "Fehler beim Datei-Upload");
    }
  };

  // Automatically attempt merge when markdown changes
  useEffect(() => {
    if (!originalJson || !llmMarkdown.trim()) {
      setMergedJson(null);
      setStats(INITIAL_STATS);
      return;
    }

    try {
      const result = mergeLlmMarkdownIntoDeck(originalJson, llmMarkdown);
      setMergedJson(result.mergedJson);
      setStats(result.stats);
    } catch (e) {
      console.error("Error during merge", e);
    }
  }, [llmMarkdown, originalJson]);

  const downloadMergedJson = useCallback(() => {
    if (!mergedJson) return;
    const blob = new Blob([JSON.stringify(mergedJson, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${deckName.replace(/\.[^.]+$/, "")}-llm-merged.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [mergedJson, deckName]);

  return (
    <div className="relative h-[100dvh] overflow-hidden bg-background flex flex-col pt-8 pb-6 px-4 md:px-8 max-w-7xl mx-auto w-full">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-grid opacity-50" />

      <header className="mb-4 flex flex-col gap-4 shrink-0">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/">Home</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="font-medium text-primary">LLM Merge Assistant</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <header className="mb-4 flex flex-col gap-2 shrink-0">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="h-8 px-2 text-muted-foreground mr-1 text-xs">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2 text-foreground">
              <Sparkles className="w-6 h-6 text-zinc-700" />
              LLM Merge Assistant
            </h1>
          </div>
          <p className="text-xs text-muted-foreground max-w-4xl">
            Paste the AI-refined Markdown format (using <code>### ID</code>, <code>Q:</code>, <code>A:</code>, and <code>---</code>). Changes are mapped back into original Anki metadata preserving all scheduling and Note IDs. 100% Client-side processing.
          </p>
        </div>
      </header>

      {!originalJson ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-10 text-center text-xs text-destructive shadow-2xs">
          <h3 className="font-semibold text-base mb-2">No Original Dataset Found</h3>
          <p className="mb-4">Please start in the APKG Extractor, decode your Anki package, and click 'Open Merge Assistant'.</p>
          <Button onClick={() => navigate('/configure')} variant="outline" size="sm" className="text-xs">Go to APKG Extractor</Button>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-4 bg-muted/30 border rounded-lg px-4 py-3 shadow-2xs shrink-0">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Braces className="w-4 h-4 text-zinc-700" />
              Merge Format:
            </div>
            <Badge variant="outline" className="text-xs leading-none py-1 border-zinc-300">
              ### ID
            </Badge>
            <Badge variant="outline" className="text-xs leading-none py-1">
              {exportedFields.question && exportedFields.answer
                ? "Q: / A:"
                : exportedFields.question
                  ? "Q: only (Answers preserved)"
                  : exportedFields.answer
                    ? "A: only (Questions preserved)"
                    : "Q: / A:"}
            </Badge>
            <Badge variant="outline" className="text-xs leading-none py-1">
              --- Separator
            </Badge>
            {mergeCapability.status === "partial" && (
              <Badge variant="outline" className="text-xs leading-none py-1 border-amber-300 bg-amber-50 text-amber-800 gap-1">
                <AlertTriangle className="w-3 h-3" /> Partial Merge
              </Badge>
            )}
            <div className="flex-1" />
            <Badge variant="secondary" className="text-xs leading-none py-1">
              {deckName}
            </Badge>
          </div>

          <main className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-6">
            <div className="flex flex-col border rounded-xl overflow-hidden bg-card shadow-2xs relative min-h-0">
              <div className="bg-muted/50 px-4 py-3 border-b flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2">
                  <Braces className="w-4 h-4 text-zinc-700" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-foreground">Input Workspace</span>
                </div>
                <Badge variant="outline" className="text-[10px] bg-background leading-none py-1">
                  Markdown Output
                </Badge>
              </div>

              <div className="px-4 py-2 border-b bg-muted/20 text-xs text-muted-foreground shrink-0">
                Paste LLM response or upload file (.md, .txt, or .zip archive)
              </div>

              <div className="flex-1 min-h-0 relative">
                <Textarea
                  className="h-full w-full rounded-none border-0 font-mono text-[12px] leading-relaxed resize-none bg-transparent p-4 focus-visible:ring-0"
                  placeholder="### 167389218&#10;Q: Your refined question?&#10;A: Your refined answer&#10;---&#10;&#10;### 167389219&#10;[DELETE]&#10;---"
                  value={llmMarkdown}
                  onChange={(e) => setLlmMarkdown(e.target.value)}
                />
              </div>

              <div className="p-3 border-t bg-muted/20 flex items-center justify-between gap-3 shrink-0">
                <p className="text-xs text-muted-foreground px-1">Optional: Load Markdown file directly from disk.</p>
                <label>
                  <input
                    type="file"
                    accept=".md,.zip,.txt"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        handleFileUpload(e.target.files[0]);
                        e.target.value = '';
                      }
                    }}
                    className="hidden"
                    id="file-input-merger"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2 text-xs h-8"
                    onClick={() => document.getElementById('file-input-merger')?.click()}
                  >
                    <Upload className="w-3.5 h-3.5" /> Upload File
                  </Button>
                </label>
              </div>
            </div>

            <div className="flex flex-col border rounded-xl overflow-hidden bg-card shadow-2xs min-h-0">
              <div className="bg-muted/50 px-4 py-3 border-b flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-zinc-700" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-foreground">Merge Result</span>
                </div>
                {mergedJson ? (
                  <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-800 border-emerald-200">Ready to Export</Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] bg-background">Waiting for Input</Badge>
                )}
              </div>

              <div className="px-4 py-2 border-b bg-muted/20 text-xs text-muted-foreground shrink-0 flex gap-3 flex-wrap items-center">
                <span className="text-emerald-700 font-medium">{stats.updated} updated</span>
                {stats.partialUpdated > 0 && (
                  <span className="text-amber-700 font-medium">({stats.partialUpdated} partial)</span>
                )}
                <span className="text-red-700 font-medium">{stats.deleted} deleted</span>
                <span className="text-zinc-600 font-medium">{stats.unmodified} unmodified</span>
                {stats.blocksMissingId > 0 && (
                  <span className="inline-flex items-center gap-1 text-destructive font-medium">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {stats.blocksMissingId} block{stats.blocksMissingId === 1 ? "" : "s"} missing ### ID (skipped)
                  </span>
                )}
              </div>

              <Card className="flex-1 rounded-none border-0 shadow-none bg-background/50 min-h-0 relative">
                <CardContent className="p-0 h-full">
                  {!llmMarkdown.trim() ? (
                    <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground bg-muted/10 min-h-[260px] p-6">
                      <Sparkles className="w-8 h-8 opacity-20" />
                      <p className="text-xs text-center font-medium">Original dataset loaded. Waiting for LLM Markdown input in the workspace.</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-full w-full border-t">
                      <pre className="min-h-full p-4 font-mono text-[12px] leading-relaxed whitespace-pre text-foreground selection:bg-blue-500/30 dark:selection:bg-blue-400/40">
                        {mergedJson ? JSON.stringify(mergedJson, null, 2) : "Syntax error during merge. Verify Markdown card ID structure."}
                      </pre>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>

              <div className="p-4 border-t bg-muted/10 flex justify-end gap-3 shrink-0">
                <Button
                  onClick={downloadMergedJson}
                  disabled={!mergedJson}
                  variant="outline"
                  size="sm"
                  className="gap-2 text-xs h-9 shadow-2xs"
                >
                  <Save className="w-3.5 h-3.5" /> Export JSON
                </Button>
                <Button
                  onClick={() => {
                    if (!mergedJson) return;

                    // Preserve full merged payload for APKG export so scheduling and deck/card metadata survive.
                    localStorage.setItem(
                      "json-apkg-anki-merged",
                      JSON.stringify({
                        source: "llm-merge",
                        timestamp: Date.now(),
                        deckName,
                        data: mergedJson,
                      }),
                    );

                    const flatCards: any[] = [];
                    const extractCards = (notes: any[]) => {
                      notes.forEach(n => flatCards.push({ front: n.front, back: n.back }));
                    };

                    if (Array.isArray(mergedJson.notes)) {
                      extractCards(mergedJson.notes);
                    } else if (mergedJson?.decks?.byId) {
                      Object.values(mergedJson.decks.byId).forEach((d: any) => {
                        if (Array.isArray(d.notes)) extractCards(d.notes);
                      });
                    }

                    const batch = [{
                      id: Date.now().toString(),
                      timestamp: Date.now(),
                      cards: flatCards
                    }];
                    localStorage.setItem("json-apkg-builder-batches", JSON.stringify(batch));
                    navigate('/json-to-apkg');
                  }}
                  disabled={!mergedJson}
                  size="sm"
                  className="gap-2 text-xs h-9 shadow-2xs font-semibold"
                >
                  <BookOpen className="w-3.5 h-3.5" /> Pack into .apkg Package
                </Button>
              </div>
            </div>
          </main>
        </>
      )}
    </div>
  );
}