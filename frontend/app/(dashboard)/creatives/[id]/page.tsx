"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Check, Trash2, Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api, apiDownload, ApiError } from "@/lib/api/client";
import type { Creative } from "@/types";
import { SEGMENT_LABELS, PLATFORM_LABELS } from "@/lib/constants/platforms";
import { formatDate } from "@/lib/utils";
import { formatCreativeContent } from "@/lib/format-creative";

export default function CreativeDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const [creative, setCreative] = useState<Creative | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get<Creative>(`/creatives/${id}`)
      .then(setCreative)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  function copyAll() {
    if (!creative) return;
    const text = formatCreativeContent(creative.content);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function download() {
    if (!creative) return;
    setDownloading(true);
    try {
      const text = formatCreativeContent(creative.content);
      if (text) {
        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `creative-${id}.txt`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        await apiDownload(`/creatives/${id}/download`, `creative-${id}.json`);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this creative?")) return;
    try {
      await api.delete(`/creatives/${id}`);
      window.location.href = "/creatives";
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Delete failed");
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!creative) {
    return (
      <div className="py-16 text-center text-muted-foreground">
        {error || "Creative not found"}
      </div>
    );
  }

  const proText = formatCreativeContent(creative.content);

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
      <div>
        <Link
          href={`/creatives?bookId=${creative.bookId}`}
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Creatives
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {creative.title || creative.type.replace(/_/g, " ")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Created {formatDate(creative.createdAt)}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="secondary">{creative.type.replace(/_/g, " ")}</Badge>
              <Badge variant="outline">{creative.status}</Badge>
              {creative.segment && (
                <Badge variant="outline">
                  {SEGMENT_LABELS[creative.segment] || creative.segment}
                </Badge>
              )}
              {creative.platform && (
                <Badge variant="outline">
                  {PLATFORM_LABELS[creative.platform] || creative.platform}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={copyAll}>
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5" /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" /> Copy
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={download}
              disabled={downloading}
            >
              {downloading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Download
            </Button>
            <Button variant="ghost" size="icon" onClick={remove}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Content</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-5 text-sm leading-relaxed text-foreground">
            {proText || "No content yet."}
          </div>
        </CardContent>
      </Card>

      {creative.assetUrl && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Asset</CardTitle>
          </CardHeader>
          <CardContent>
            <a
              href={creative.assetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline"
            >
              {creative.assetUrl}
            </a>
          </CardContent>
        </Card>
      )}
    </div>
  );
}