"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  ExternalLink,
  Search,
  Sparkles,
  Calendar,
  Trash2,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api, ApiError } from "@/lib/api/client";
import type { Book, Audit } from "@/types";
import { GENRE_LABELS } from "@/lib/constants/genres";
import { formatDate } from "@/lib/utils";

export default function BookDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [book, setBook] = useState<Book | null>(null);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api.get<Book>(`/books/${id}`),
      api.get<Audit[]>(`/audit?bookId=${id}`).catch(() => [] as Audit[]),
    ])
      .then(([b, a]) => {
        setBook(b);
        setAudits(Array.isArray(a) ? a : []);
      })
      .catch((e) => setError(e.message || "Failed to load book"))
      .finally(() => setLoading(false));
  }, [id]);

  async function runAudit() {
    setActionLoading(true);
    try {
      const audit = await api.post<Audit>(`/books/${id}/audit`);
      router.push(`/audit/${audit.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to start audit");
    } finally {
      setActionLoading(false);
    }
  }

  async function removeBook() {
    if (!confirm("Delete this book and all related audits/creatives?")) return;
    try {
      await api.delete(`/books/${id}`);
      router.push("/books");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Delete failed");
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl animate-pulse space-y-6">
        <div className="h-8 w-48 rounded bg-muted" />
        <div className="h-64 rounded-xl bg-muted" />
      </div>
    );
  }

  if (error && !book) {
    return (
      <div className="mx-auto max-w-4xl text-center py-16">
        <p className="text-muted-foreground">{error}</p>
        <Link href="/books" className="mt-4 inline-block">
          <Button variant="outline">Back to books</Button>
        </Link>
      </div>
    );
  }

  if (!book) return null;

  const latestAudit = audits[0];

  return (
    <div className="mx-auto max-w-4xl space-y-8 animate-fade-in">
      <div>
        <Link
          href="/books"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Books
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-5">
            <div className="hidden h-36 w-24 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-brand-100 to-brand-200 sm:block dark:from-brand-900 dark:to-brand-800">
              {book.coverImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={book.coverImageUrl}
                  alt={book.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <BookOpen className="h-8 w-8 text-brand-400" />
                </div>
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{book.title}</h1>
              {book.subtitle && (
                <p className="text-muted-foreground">{book.subtitle}</p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge variant="secondary">
                  {GENRE_LABELS[book.genre] || book.genre}
                </Badge>
                {book.price != null && (
                  <Badge variant="outline">${Number(book.price).toFixed(2)}</Badge>
                )}
                {book.publishedAt && (
                  <span className="text-xs text-muted-foreground">
                    Published {formatDate(book.publishedAt)}
                  </span>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-sm">
                {book.amazonUrl && (
                  <a
                    href={book.amazonUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    Amazon <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {book.goodreadsUrl && (
                  <a
                    href={book.goodreadsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    Goodreads <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={runAudit} disabled={actionLoading} className="gap-2">
              <Play className="h-4 w-4" />
              {actionLoading ? "Starting…" : "Run audit"}
            </Button>
            <Link href={`/creatives?bookId=${id}`}>
              <Button variant="outline" className="gap-2">
                <Sparkles className="h-4 w-4" /> Creatives
              </Button>
            </Link>
            <Button variant="ghost" size="icon" onClick={removeBook} title="Delete">
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
          <CardTitle className="text-base">Description</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {book.description}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="transition hover:border-primary/30">
          <CardContent className="p-5">
            <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Search className="h-4 w-4" />
            </div>
            <p className="font-semibold">Audience audit</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {latestAudit
                ? `Last: ${latestAudit.status}`
                : "Find your readers on TikTok, Goodreads, Amazon…"}
            </p>
            {latestAudit ? (
              <Link
                href={`/audit/${latestAudit.id}`}
                className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
              >
                View results →
              </Link>
            ) : (
              <button
                onClick={runAudit}
                className="mt-3 text-sm font-medium text-primary hover:underline"
              >
                Run first audit →
              </button>
            )}
          </CardContent>
        </Card>
        <Link href={`/creatives?bookId=${id}`}>
          <Card className="h-full transition hover:border-primary/30">
            <CardContent className="p-5">
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="h-4 w-4" />
              </div>
              <p className="font-semibold">Creatives</p>
              <p className="mt-1 text-xs text-muted-foreground">
                TikTok, ads, emails, keywords per segment
              </p>
              <span className="mt-3 inline-block text-sm font-medium text-primary">
                Open studio →
              </span>
            </CardContent>
          </Card>
        </Link>
        <Link href={`/calendar?bookId=${id}`}>
          <Card className="h-full transition hover:border-primary/30">
            <CardContent className="p-5">
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Calendar className="h-4 w-4" />
              </div>
              <p className="font-semibold">Calendar</p>
              <p className="mt-1 text-xs text-muted-foreground">
                30-day marketing schedule
              </p>
              <span className="mt-3 inline-block text-sm font-medium text-primary">
                View calendar →
              </span>
            </CardContent>
          </Card>
        </Link>
      </div>

      {audits.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Audit history</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {audits.map((a) => (
              <Link
                key={a.id}
                href={`/audit/${a.id}`}
                className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm transition hover:bg-muted/50"
              >
                <span>
                  {formatDate(a.requestedAt)}
                  {a.completedAt && (
                    <span className="ml-2 text-muted-foreground">
                      · completed {formatDate(a.completedAt)}
                    </span>
                  )}
                </span>
                <Badge
                  variant={
                    a.status === "COMPLETED"
                      ? "success"
                      : a.status === "FAILED"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {a.status}
                </Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
