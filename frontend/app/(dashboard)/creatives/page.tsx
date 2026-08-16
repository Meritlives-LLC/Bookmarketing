"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Sparkles,
  Plus,
  Loader2,
  Image,
  Video,
  Mail,
  Hash,
  FileText,
  Mic,
  MessageSquare,
  Youtube,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api, ApiError } from "@/lib/api/client";
import type { Book, Creative, CreativeType, ReaderSegment } from "@/types";
import { SEGMENT_LABELS, PLATFORM_LABELS } from "@/lib/constants/platforms";
import { formatRelative, cn } from "@/lib/utils";
import {
  formatCreativeContent,
  formatCreativePreview,
} from "@/lib/format-creative";

const CREATIVE_TYPES: {
  type: CreativeType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}[] = [
  { type: "TIKTOK_VIDEO", label: "TikTok script", icon: Video, description: "Hooks + captions for BookTok" },
  { type: "IMAGE_AD", label: "Image ad", icon: Image, description: "Facebook / Instagram ad copy" },
  { type: "EMAIL_COPY", label: "Email campaign", icon: Mail, description: "Subject lines + body sequences" },
  { type: "AMAZON_KEYWORDS", label: "Amazon keywords", icon: Hash, description: "Search terms + bid suggestions" },
  { type: "DISCUSSION_GUIDE", label: "Discussion guide", icon: FileText, description: "Book club questions" },
  { type: "PODCAST_PITCH", label: "Podcast pitch", icon: Mic, description: "Pitch email + talking points" },
  { type: "REDDIT_POST", label: "Reddit post", icon: MessageSquare, description: "Community-native posts" },
  { type: "YOUTUBE_SCRIPT", label: "YouTube script", icon: Youtube, description: "BookTube / trailer script" },
];

function CreativesContent() {
  const searchParams = useSearchParams();
  const bookIdParam = searchParams.get("bookId") || "";

  const [books, setBooks] = useState<Book[]>([]);
  const [bookId, setBookId] = useState(bookIdParam);
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<CreativeType[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<ReaderSegment | "">("");
  const [showGenerator, setShowGenerator] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [genProgress, setGenProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    api
      .get<Book[]>("/books")
      .then((b) => {
        setBooks(b);
        if (!bookId && b.length > 0) setBookId(b[0].id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!bookId) {
      setCreatives([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .get<Creative[]>(`/creatives?bookId=${bookId}`)
      .then(setCreatives)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [bookId]);

  function toggleType(type: CreativeType) {
    setSelectedTypes((prev) => {
      if (prev.includes(type)) return prev.filter((t) => t !== type);
      return [...prev, type];
    });
  }

  async function generate() {
    if (!bookId || selectedTypes.length === 0) return;

    // Snapshot so clearing UI mid-run doesn't change the queue
    const typesToGenerate = [...selectedTypes];

    setGenerating(true);
    setError("");
    setGenProgress({ done: 0, total: typesToGenerate.length });

    const created: Creative[] = [];
    const failures: string[] = [];

    for (let i = 0; i < typesToGenerate.length; i++) {
      const type = typesToGenerate[i];
      try {
        const creative = await api.post<Creative>("/creatives/generate", {
          bookId,
          type,
          segment: selectedSegment || undefined,
        });
        created.push(creative);
        // Live list update so each success appears even if later types fail
        setCreatives((prev) => [creative, ...prev]);
      } catch (e) {
        const label =
          CREATIVE_TYPES.find((t) => t.type === type)?.label || type;
        failures.push(
          `${label}: ${e instanceof ApiError ? e.message : "failed"}`
        );
      }
      setGenProgress({ done: i + 1, total: typesToGenerate.length });
    }

    if (created.length > 0) {
      setShowGenerator(false);
      setSelectedTypes([]);
      setSelectedSegment("");
    }
    if (failures.length > 0) {
      setError(
        created.length === 0
          ? failures.join(" · ")
          : `Generated ${created.length}; some failed — ${failures.join(" · ")}`
      );
    }
    setGenerating(false);
    setGenProgress(null);
  }

  function copyContent(c: Creative) {
    const text = formatCreativeContent(c.content);
    navigator.clipboard.writeText(text);
    setCopiedId(c.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const segments = Object.entries(SEGMENT_LABELS) as [ReaderSegment, string][];

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Creative studio</h1>
          <p className="text-muted-foreground">
            AI-generated ads, scripts, and copy for every reader segment
          </p>
        </div>
        <Button
          className="gap-2"
          onClick={() => setShowGenerator(true)}
          disabled={!bookId}
        >
          <Plus className="h-4 w-4" /> Generate creative
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium">Book</label>
        <select
          className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
          value={bookId}
          onChange={(e) => setBookId(e.target.value)}
        >
          <option value="">Select book…</option>
          {books.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </select>
        {books.length === 0 && (
          <Link href="/books/new" className="text-sm text-primary hover:underline">
            Add a book first
          </Link>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {showGenerator && (
        <Card className="border-primary/30 shadow-glow">
          <CardHeader>
            <CardTitle className="text-base">Generate new creative</CardTitle>
            <p className="text-sm text-muted-foreground">
              Select one or more types. Each type is generated as its own creative.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Types</p>
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() =>
                      setSelectedTypes(CREATIVE_TYPES.map((t) => t.type))
                    }
                  >
                    Select all
                  </button>
                  <span className="text-muted-foreground">·</span>
                  <button
                    type="button"
                    className="text-muted-foreground hover:underline"
                    onClick={() => setSelectedTypes([])}
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {CREATIVE_TYPES.map((t) => {
                  const selected = selectedTypes.includes(t.type);
                  return (
                    <button
                      key={t.type}
                      type="button"
                      role="checkbox"
                      aria-checked={selected}
                      disabled={generating}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!generating) toggleType(t.type);
                      }}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border p-3 text-left transition",
                        selected
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "hover:bg-muted/50",
                        generating && "pointer-events-none opacity-60"
                      )}
                    >
                      <t.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{t.label}</span>
                        <span className="block text-xs text-muted-foreground">{t.description}</span>
                      </span>
                      <span
                        className={cn(
                          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs",
                          selected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-input"
                        )}
                      >
                        {selected ? "✓" : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
              {selectedTypes.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {selectedTypes.length} type{selectedTypes.length === 1 ? "" : "s"} selected
                </p>
              )}
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">
                Reader segment{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </p>
              <select
                className="h-10 w-full max-w-md rounded-lg border border-input bg-background px-3 text-sm"
                value={selectedSegment}
                onChange={(e) =>
                  setSelectedSegment(e.target.value as ReaderSegment | "")
                }
              >
                <option value="">All / auto</option>
                {segments.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={generate}
                disabled={selectedTypes.length === 0 || generating}
                className="gap-2"
              >
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {genProgress
                      ? `Generating ${genProgress.done}/${genProgress.total}…`
                      : "Generating…"}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Generate
                    {selectedTypes.length > 1
                      ? ` (${selectedTypes.length})`
                      : selectedTypes.length === 1
                        ? ""
                        : ""}
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowGenerator(false)}
                disabled={generating}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {!loading && bookId && creatives.length === 0 && !showGenerator && (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="h-7 w-7" />
            </div>
            <h2 className="text-lg font-semibold">No creatives yet</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Generate TikTok scripts, Amazon keywords, email campaigns, and more
              tailored to your book&apos;s audience.
            </p>
            <Button className="mt-6 gap-2" onClick={() => setShowGenerator(true)}>
              <Plus className="h-4 w-4" /> Generate first creative
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && creatives.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {creatives.map((c) => {
            const meta = CREATIVE_TYPES.find((t) => t.type === c.type);
            const Icon = meta?.icon || Sparkles;
            const preview = formatCreativePreview(c.content, 320);
            return (
              <Card key={c.id} className="flex flex-col overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <CardTitle className="text-sm">
                          {c.title || meta?.label || c.type}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {formatRelative(c.createdAt)}
                        </p>
                      </div>
                    </div>
                    <StatusBadge status={c.status} />
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col">
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {c.segment && (
                      <Badge variant="secondary" className="text-xs">
                        {SEGMENT_LABELS[c.segment] || c.segment}
                      </Badge>
                    )}
                    {c.platform && (
                      <Badge variant="outline" className="text-xs">
                        {PLATFORM_LABELS[c.platform] || c.platform}
                      </Badge>
                    )}
                  </div>
                  <div className="mb-4 max-h-36 flex-1 overflow-auto rounded-md bg-muted/50 p-3 text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
                    {preview || "No content yet"}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => copyContent(c)}
                    >
                      {copiedId === c.id ? (
                        <>
                          <Check className="h-3.5 w-3.5" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" /> Copy
                        </>
                      )}
                    </Button>
                    <Link href={`/creatives/${c.id}`}>
                      <Button variant="ghost" size="sm">
                        Open
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, "success" | "destructive" | "secondary" | "warning"> = {
    READY: "success",
    PUBLISHED: "success",
    GENERATING: "warning",
    DRAFT: "secondary",
    FAILED: "destructive",
    ARCHIVED: "secondary",
  };
  return <Badge variant={map[status] || "secondary"}>{status}</Badge>;
}

export default function CreativesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <CreativesContent />
    </Suspense>
  );
}