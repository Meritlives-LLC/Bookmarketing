"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Calendar as CalIcon, Plus, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api, ApiError } from "@/lib/api/client";
import type { Book, CalendarEvent } from "@/types";
import { PLATFORM_LABELS } from "@/lib/constants/platforms";
import { formatDate, cn } from "@/lib/utils";

function CalendarContent() {
  const searchParams = useSearchParams();
  const bookIdParam = searchParams.get("bookId") || "";
  const [books, setBooks] = useState<Book[]>([]);
  const [bookId, setBookId] = useState(bookIdParam);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [genLoading, setGenLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<Book[]>("/books").then((b) => {
      setBooks(b);
      if (!bookId && b.length) setBookId(b[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!bookId) {
      setEvents([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .get<CalendarEvent[]>(`/calendar?bookId=${bookId}`)
      .then(setEvents)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [bookId]);

  async function generate() {
    if (!bookId) return;
    setGenLoading(true);
    setError("");
    try {
      const result = await api.post<CalendarEvent[]>("/calendar/generate", { bookId });
      setEvents(Array.isArray(result) ? result : []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to generate calendar");
    } finally {
      setGenLoading(false);
    }
  }

  async function markComplete(id: string) {
    try {
      await api.post(`/calendar/${id}/complete`);
      setEvents((prev) =>
        prev.map((e) =>
          e.id === id ? { ...e, status: "PUBLISHED" as const, completedAt: new Date().toISOString() } : e
        )
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Update failed");
    }
  }

  const sorted = [...events].sort(
    (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Marketing calendar</h1>
          <p className="text-muted-foreground">
            AI-generated 30-day posting & campaign schedule
          </p>
        </div>
        <Button
          className="gap-2"
          onClick={generate}
          disabled={!bookId || genLoading}
        >
          {genLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Generating…
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" /> Generate 30-day plan
            </>
          )}
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm font-medium">Book</label>
        <select
          className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
          value={bookId}
          onChange={(e) => setBookId(e.target.value)}
        >
          <option value="">Select…</option>
          {books.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {!loading && sorted.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CalIcon className="h-7 w-7" />
            </div>
            <h2 className="text-lg font-semibold">No schedule yet</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Generate a 30-day marketing calendar with optimal times for TikTok,
              Amazon ads, email, Reddit, and more.
            </p>
            <Button className="mt-6 gap-2" onClick={generate} disabled={!bookId || genLoading}>
              <Plus className="h-4 w-4" /> Generate calendar
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && sorted.length > 0 && (
        <div className="space-y-3">
          {sorted.map((ev) => (
            <Card
              key={ev.id}
              className={cn(
                "transition",
                ev.status === "PUBLISHED" && "opacity-70"
              )}
            >
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-muted text-center">
                  <span className="text-[10px] font-medium uppercase text-muted-foreground">
                    {new Date(ev.scheduledAt).toLocaleString("en", { month: "short" })}
                  </span>
                  <span className="text-lg font-bold leading-none">
                    {new Date(ev.scheduledAt).getDate()}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">
                      {PLATFORM_LABELS[ev.platform] || ev.platform}
                    </Badge>
                    <Badge
                      variant={
                        ev.status === "PUBLISHED"
                          ? "success"
                          : ev.status === "FAILED"
                            ? "destructive"
                            : "outline"
                      }
                    >
                      {ev.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatDate(ev.scheduledAt)}
                    {ev.notes && ` · ${ev.notes}`}
                  </p>
                </div>
                {ev.status === "SCHEDULED" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 shrink-0"
                    onClick={() => markComplete(ev.id)}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Done
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CalendarPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <CalendarContent />
    </Suspense>
  );
}
