"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  RefreshCw,
  Users,
  Key,
  Swords,
  Download,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api, ApiError } from "@/lib/api/client";
import type { Audit, AudienceInsight, KeywordSuggestion, CompetitorAnalysis } from "@/types";
import { SEGMENT_LABELS, PLATFORM_LABELS } from "@/lib/constants/platforms";
import { formatDate, exportToCsv } from "@/lib/utils";
import { cn } from "@/lib/utils";

export default function AuditDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [audit, setAudit] = useState<Audit | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenLoading, setRegenLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"audience" | "keywords" | "competitors">("audience");

  function load() {
    return api
      .get<Audit>(`/audit/${id}`)
      .then(setAudit)
      .catch((e) => {
        setError(e.message || "Failed to load audit");
        throw e;
      });
  }

  useEffect(() => {
    load()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  // Poll while processing — slower interval + backoff so we don't trip rate limits (429)
  useEffect(() => {
    if (!audit) return;
    if (!["PENDING", "SCRAPING", "ANALYZING"].includes(audit.status)) return;

    let cancelled = false;
    let delayMs = 8000;
    let timeoutId: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (cancelled) return;
      try {
        await load();
        delayMs = 8000;
      } catch (e) {
        const status =
          e && typeof e === "object" && "status" in e
            ? (e as { status: number }).status
            : 0;
        if (status === 429) {
          delayMs = Math.min(delayMs * 2, 60000);
        }
      }
      if (!cancelled) {
        timeoutId = setTimeout(tick, delayMs);
      }
    };

    timeoutId = setTimeout(tick, delayMs);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [audit?.status, id]);

  async function regenerate() {
    setRegenLoading(true);
    try {
      await api.post(`/audit/${id}/regenerate`);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Regenerate failed");
    } finally {
      setRegenLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Loading audit…</p>
      </div>
    );
  }

  if (!audit) {
    return (
      <div className="mx-auto max-w-5xl py-16 text-center">
        <p className="text-muted-foreground">{error || "Audit not found"}</p>
        <Link href="/dashboard" className="mt-4 inline-block">
          <Button variant="outline">Back</Button>
        </Link>
      </div>
    );
  }

  const isProcessing = ["PENDING", "SCRAPING", "ANALYZING"].includes(audit.status);
  const insights = audit.audienceInsights || [];
  const keywords = audit.keywordSuggestions || [];
  const competitors = audit.competitorAnalyses || [];

  return (
    <div className="mx-auto max-w-5xl space-y-8 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href={audit.bookId ? `/books/${audit.bookId}` : "/books"}
            className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to book
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Audience audit</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Requested {formatDate(audit.requestedAt)}
            {audit.completedAt && ` · Completed ${formatDate(audit.completedAt)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={audit.status} />
          {!isProcessing && (
            <Button
              variant="outline"
              size="sm"
              onClick={regenerate}
              disabled={regenLoading}
              className="gap-2"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", regenLoading && "animate-spin")} />
              Regenerate
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {isProcessing && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex items-center gap-4 p-6">
            <Loader2 className="h-8 w-8 shrink-0 animate-spin text-primary" />
            <div>
              <p className="font-semibold">
                {audit.status === "PENDING" && "Queued…"}
                {audit.status === "SCRAPING" && "Scraping platforms…"}
                {audit.status === "ANALYZING" && "Analyzing audiences with AI…"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                We&apos;re scanning BookTok, Goodreads, Amazon, Reddit, BookTube and more.
                This usually takes 1–3 minutes.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {audit.status === "FAILED" && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex items-center gap-4 p-6">
            <AlertCircle className="h-8 w-8 shrink-0 text-destructive" />
            <div>
              <p className="font-semibold">Audit failed</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {audit.errorMessage || "Something went wrong. Try regenerating."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {audit.status === "COMPLETED" && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              icon={Users}
              label="Reader segments"
              value={String(insights.length)}
            />
            <StatCard
              icon={Key}
              label="Keyword suggestions"
              value={String(keywords.length)}
            />
            <StatCard
              icon={Swords}
              label="Competitors analyzed"
              value={String(competitors.length)}
            />
          </div>

          <div className="flex gap-2 border-b">
            {(
              [
                ["audience", "Audience insights", Users],
                ["keywords", "Keywords", Key],
                ["competitors", "Competitors", Swords],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  "flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                  tab === key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          {tab === "audience" && (
            <div className="grid gap-4 sm:grid-cols-2">
              {insights.length === 0 && (
                <p className="col-span-2 text-sm text-muted-foreground">
                  No audience insights yet.
                </p>
              )}
              {insights.map((ins) => (
                <AudienceCard key={ins.id} insight={ins} />
              ))}
            </div>
          )}

          {tab === "keywords" && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Amazon & platform keywords</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  disabled={keywords.length === 0}
                  onClick={() =>
                    exportToCsv(
                      `keywords-audit-${id}`,
                      keywords.map((k) => ({
                        keyword: k.keyword,
                        platform: PLATFORM_LABELS[k.platform] || k.platform,
                        searchVolume: k.searchVolume ?? "",
                        suggestedBid: k.suggestedBid != null ? Number(k.suggestedBid).toFixed(2) : "",
                        competition: k.competition ?? "",
                      }))
                    )
                  }
                >
                  <Download className="h-3.5 w-3.5" /> Export
                </Button>
              </CardHeader>
              <CardContent>
                {keywords.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No keywords yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="pb-3 pr-4 font-medium">Keyword</th>
                          <th className="pb-3 pr-4 font-medium">Platform</th>
                          <th className="pb-3 pr-4 font-medium">Volume</th>
                          <th className="pb-3 pr-4 font-medium">Suggested bid</th>
                          <th className="pb-3 font-medium">Competition</th>
                        </tr>
                      </thead>
                      <tbody>
                        {keywords.map((k) => (
                          <tr key={k.id} className="border-b last:border-0">
                            <td className="py-3 pr-4 font-medium">{k.keyword}</td>
                            <td className="py-3 pr-4">
                              {PLATFORM_LABELS[k.platform] || k.platform}
                            </td>
                            <td className="py-3 pr-4">
                              {k.searchVolume != null
                                ? k.searchVolume.toLocaleString()
                                : "—"}
                            </td>
                            <td className="py-3 pr-4">
                              {k.suggestedBid != null
                                ? `$${Number(k.suggestedBid).toFixed(2)}`
                                : "—"}
                            </td>
                            <td className="py-3">
                              {k.competition ? (
                                <Badge
                                  variant={
                                    k.competition.toLowerCase() === "high"
                                      ? "destructive"
                                      : k.competition.toLowerCase() === "low"
                                        ? "success"
                                        : "secondary"
                                  }
                                >
                                  {k.competition}
                                </Badge>
                              ) : (
                                "—"
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {tab === "competitors" && (
            <div className="grid gap-4 sm:grid-cols-2">
              {competitors.length === 0 && (
                <p className="col-span-2 text-sm text-muted-foreground">
                  No competitor analysis yet.
                </p>
              )}
              {competitors.map((c) => (
                <CompetitorCard key={c.id} competitor={c} />
              ))}
            </div>
          )}

          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
            <CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">Ready to generate creatives?</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Use these insights to create TikTok scripts, ads, emails, and more.
                </p>
              </div>
              <Link href={`/creatives?bookId=${audit.bookId}`}>
                <Button className="gap-2">Generate creatives</Button>
              </Link>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: "success" | "destructive" | "secondary" | "warning"; label: string }> = {
    COMPLETED: { variant: "success", label: "Completed" },
    FAILED: { variant: "destructive", label: "Failed" },
    PENDING: { variant: "secondary", label: "Pending" },
    SCRAPING: { variant: "warning", label: "Scraping" },
    ANALYZING: { variant: "warning", label: "Analyzing" },
  };
  const m = map[status] || { variant: "secondary" as const, label: status };
  return <Badge variant={m.variant}>{m.label}</Badge>;
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function AudienceCard({ insight }: { insight: AudienceInsight }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">
              {SEGMENT_LABELS[insight.segment] || insight.segment}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {PLATFORM_LABELS[insight.platform] || insight.platform}
            </p>
          </div>
          <Badge variant="outline">
            {Math.round(insight.confidence * 100)}% conf.
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {insight.summary}
        </p>
      </CardContent>
    </Card>
  );
}

function CompetitorCard({ competitor }: { competitor: CompetitorAnalysis }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{competitor.competitorName}</CardTitle>
        {competitor.competitorAsin && (
          <p className="text-xs text-muted-foreground">ASIN: {competitor.competitorAsin}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {competitor.strengths?.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-600">
              Strengths
            </p>
            <ul className="space-y-1">
              {competitor.strengths.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}
        {competitor.weaknesses?.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-amber-600">
              Weaknesses
            </p>
            <ul className="space-y-1">
              {competitor.weaknesses.map((w, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                  {w}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}