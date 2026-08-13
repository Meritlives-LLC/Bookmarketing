"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Calendar as CalIcon,
  Plus,
  Loader2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  List,
  LayoutGrid,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api, ApiError } from "@/lib/api/client";
import type { Book, CalendarEvent } from "@/types";
import { PLATFORM_LABELS } from "@/lib/constants/platforms";
import { formatDate, cn } from "@/lib/utils";

type View = "month" | "list";

function CalendarContent() {
  const searchParams = useSearchParams();
  const bookIdParam = searchParams.get("bookId") || "";
  const [books, setBooks] = useState<Book[]>([]);
  const [bookId, setBookId] = useState(bookIdParam);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [genLoading, setGenLoading] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);

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

  async function reschedule(id: string, newDate: Date) {
    const target = events.find((e) => e.id === id);
    if (!target) return;
    const original = new Date(target.scheduledAt);
    // Keep the original time-of-day, just move the calendar day.
    const updated = new Date(newDate);
    updated.setHours(original.getHours(), original.getMinutes(), 0, 0);

    const prevEvents = events;
    setEvents((prev) =>
      prev.map((e) => (e.id === id ? { ...e, scheduledAt: updated.toISOString() } : e))
    );
    try {
      await api.put(`/calendar/${id}`, { scheduledAt: updated.toISOString() });
    } catch (e) {
      setEvents(prevEvents); // revert on failure
      setError(e instanceof ApiError ? e.message : "Reschedule failed");
    }
  }

  const sorted = [...events].sort(
    (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
  );

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const key = new Date(e.scheduledAt).toDateString();
      const arr = map.get(key) || [];
      arr.push(e);
      map.set(key, arr);
    }
    Array.from(map.values()).forEach((arr) => {
      arr.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    });
    return map;
  }, [events]);

  const monthCells = useMemo(() => {
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const firstWeekday = start.getDay();
    const gridStart = new Date(start);
    gridStart.setDate(start.getDate() - firstWeekday);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      return d;
    });
  }, [cursor]);

  const monthLabel = cursor.toLocaleDateString("en", { month: "long", year: "numeric" });

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-in">
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

      <div className="flex flex-wrap items-center justify-between gap-3">
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
        <div className="flex items-center gap-1 rounded-lg border p-1">
          <button
            onClick={() => setView("month")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              view === "month" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Month
          </button>
          <button
            onClick={() => setView("list")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              view === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <List className="h-3.5 w-3.5" /> List
          </button>
        </div>
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

      {!loading && sorted.length > 0 && view === "month" && (
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold">{monthLabel}</p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
                  className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted"
                  aria-label="Previous month"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setCursor(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })}
                  className="rounded-md px-2 py-1 text-xs font-medium hover:bg-muted"
                >
                  Today
                </button>
                <button
                  onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
                  className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted"
                  aria-label="Next month"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
            <p className="mb-2 text-xs text-muted-foreground">
              Drag a scheduled post onto another day to reschedule it.
            </p>
            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border text-xs">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="bg-muted/60 px-2 py-1.5 text-center font-medium text-muted-foreground">
                  {d}
                </div>
              ))}
              {monthCells.map((day) => {
                const key = day.toDateString();
                const dayEvents = eventsByDay.get(key) || [];
                const inMonth = day.getMonth() === cursor.getMonth();
                const isToday = key === new Date().toDateString();
                const isDragOver = dragOverDay === key;
                return (
                  <div
                    key={key}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverDay(key);
                    }}
                    onDragLeave={() => setDragOverDay((d) => (d === key ? null : d))}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverDay(null);
                      if (draggingId) reschedule(draggingId, day);
                      setDraggingId(null);
                    }}
                    className={cn(
                      "min-h-24 bg-background p-1.5 transition-colors",
                      !inMonth && "bg-muted/30 text-muted-foreground",
                      isDragOver && "bg-primary/10 ring-1 ring-inset ring-primary"
                    )}
                  >
                    <span className={cn("mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px]", isToday && "bg-primary text-primary-foreground font-semibold")}>
                      {day.getDate()}
                    </span>
                    <div className="space-y-1">
                      {dayEvents.slice(0, 3).map((ev) => (
                        <div
                          key={ev.id}
                          draggable
                          onDragStart={() => setDraggingId(ev.id)}
                          onDragEnd={() => setDraggingId(null)}
                          className={cn(
                            "cursor-grab truncate rounded px-1.5 py-0.5 text-[10px] font-medium leading-tight active:cursor-grabbing",
                            ev.status === "PUBLISHED"
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                              : ev.status === "FAILED"
                                ? "bg-destructive/15 text-destructive"
                                : "bg-primary/15 text-primary"
                          )}
                          title={`${PLATFORM_LABELS[ev.platform] || ev.platform}${ev.notes ? " · " + ev.notes : ""}`}
                        >
                          {PLATFORM_LABELS[ev.platform] || ev.platform}
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <p className="text-[10px] text-muted-foreground">+{dayEvents.length - 3} more</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && sorted.length > 0 && view === "list" && (
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