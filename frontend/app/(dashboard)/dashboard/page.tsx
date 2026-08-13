"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Search,
  Sparkles,
  TrendingUp,
  ArrowRight,
  Plus,
  Loader2,
  CircleCheck,
  Circle,
  Calendar as CalIcon,
  Sparkles as SparkleIcon,
  ScanSearch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api/client";
import type { Book, Audit, Creative, CalendarEvent, AnalyticsSnapshot } from "@/types";
import { formatRelative, cn } from "@/lib/utils";

const ONBOARDING_DISMISSED_KEY = "bmos-onboarding-dismissed";

const quickActions = [
  {
    title: "Add a book",
    description: "Upload title, cover, and Amazon link",
    href: "/books/new",
    icon: Plus,
  },
  {
    title: "Run audience audit",
    description: "Discover who wants books like yours",
    href: "/audit/new",
    icon: Search,
  },
  {
    title: "Generate creatives",
    description: "TikTok, Amazon ads, emails & more",
    href: "/creatives",
    icon: Sparkles,
  },
];

interface ActivityItem {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
  at: string;
}

export default function DashboardPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [snapshots, setSnapshots] = useState<AnalyticsSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissedOnboarding, setDismissedOnboarding] = useState(true);

  useEffect(() => {
    setDismissedOnboarding(window.localStorage.getItem(ONBOARDING_DISMISSED_KEY) === "1");
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const bookList = await api.get<Book[]>("/books");
        if (cancelled) return;
        setBooks(bookList);

        const [auditLists, creativeLists, eventLists, snapshotLists] = await Promise.all([
          Promise.all(bookList.map((b) => api.get<Audit[]>(`/audit?bookId=${b.id}`).catch(() => []))),
          Promise.all(bookList.map((b) => api.get<Creative[]>(`/creatives?bookId=${b.id}`).catch(() => []))),
          Promise.all(bookList.map((b) => api.get<CalendarEvent[]>(`/calendar?bookId=${b.id}`).catch(() => []))),
          Promise.all(bookList.map((b) => api.get<AnalyticsSnapshot[]>(`/analytics?bookId=${b.id}`).catch(() => []))),
        ]);
        if (cancelled) return;
        setAudits(auditLists.flat());
        setCreatives(creativeLists.flat());
        setEvents(eventLists.flat());
        setSnapshots(snapshotLists.flat());
      } catch {
        // Dashboard degrades to zero-state if the API is unreachable.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const bookById = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);

  const { totalSpend, totalRevenue } = snapshots.reduce(
    (acc, s) => ({
      totalSpend: acc.totalSpend + Number(s.spend),
      totalRevenue: acc.totalRevenue + Number(s.revenue),
    }),
    { totalSpend: 0, totalRevenue: 0 }
  );
  const roas = totalSpend > 0 ? totalRevenue / totalSpend : null;

  const stats = [
    { label: "Books", value: String(books.length), icon: BookOpen, href: "/books" },
    { label: "Audits run", value: String(audits.length), icon: Search, href: "/audit/new" },
    { label: "Creatives", value: String(creatives.length), icon: Sparkles, href: "/creatives" },
    { label: "ROAS", value: roas ? `${roas.toFixed(2)}x` : "—", icon: TrendingUp, href: "/analytics" },
  ];

  const onboardingSteps = [
    { done: books.length > 0, label: "Add your first book", href: "/books/new" },
    { done: audits.length > 0, label: "Run an audience audit", href: "/audit/new" },
    { done: creatives.length > 0, label: "Generate your first creative", href: "/creatives" },
    { done: events.length > 0, label: "Build a 30-day marketing calendar", href: "/calendar" },
  ];
  const allOnboardingDone = onboardingSteps.every((s) => s.done);
  const showOnboarding = !loading && !dismissedOnboarding && !allOnboardingDone;

  function dismissOnboarding() {
    window.localStorage.setItem(ONBOARDING_DISMISSED_KEY, "1");
    setDismissedOnboarding(true);
  }

  const activity: ActivityItem[] = useMemo(() => {
    const items: ActivityItem[] = [
      ...audits.map((a) => ({
        id: `audit-${a.id}`,
        icon: ScanSearch,
        label: `Audience audit ${a.status.toLowerCase()} for "${bookById.get(a.bookId)?.title || "a book"}"`,
        href: `/audit/${a.id}`,
        at: a.completedAt || a.requestedAt,
      })),
      ...creatives.map((c) => ({
        id: `creative-${c.id}`,
        icon: SparkleIcon,
        label: `${c.title || c.type.replace(/_/g, " ").toLowerCase()} created for "${bookById.get(c.bookId)?.title || "a book"}"`,
        href: `/creatives/${c.id}`,
        at: c.createdAt,
      })),
      ...events
        .filter((e) => e.status === "PUBLISHED")
        .map((e) => ({
          id: `event-${e.id}`,
          icon: CalIcon,
          label: `Marked "${bookById.get(e.bookId)?.title || "a post"}" as published`,
          href: "/calendar",
          at: e.completedAt || e.scheduledAt,
        })),
    ];
    return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 6);
  }, [audits, creatives, events, bookById]);

  return (
    <div className="mx-auto max-w-6xl space-y-8 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Your book marketing command center
          </p>
        </div>
        <Link href="/books/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" /> Add book
          </Button>
        </Link>
      </div>

      {showOnboarding && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Get set up</CardTitle>
            <button
              onClick={dismissOnboarding}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Dismiss
            </button>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {onboardingSteps.map((s) => (
              <Link
                key={s.label}
                href={s.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors",
                  s.done ? "text-muted-foreground" : "font-medium hover:bg-background"
                )}
              >
                {s.done ? (
                  <CircleCheck className="h-4 w-4 shrink-0 text-emerald-500" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0" />
                )}
                <span className={cn(s.done && "line-through")}>{s.label}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href}>
            <Card className="transition hover:shadow-md hover:border-primary/30">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <s.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{loading ? "…" : s.value}</p>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold">Quick actions</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {quickActions.map((a) => (
            <Link key={a.title} href={a.href}>
              <Card className="h-full transition hover:shadow-md hover:border-primary/30">
                <CardContent className="p-5">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <a.icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold">{a.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {a.description}
                  </p>
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
                    Get started <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}
          {!loading && activity.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <BookOpen className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="font-medium">No activity yet</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Add your first book and run an audience audit to see insights and
                campaigns appear here.
              </p>
              <Link href="/books/new" className="mt-4">
                <Button variant="outline" size="sm">
                  Add your first book
                </Button>
              </Link>
            </div>
          )}
          {!loading && activity.length > 0 && (
            <div className="divide-y">
              {activity.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="flex items-center gap-3 py-3 text-sm transition-colors hover:text-primary"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <item.icon className="h-4 w-4" />
                  </div>
                  <span className="flex-1">{item.label}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatRelative(item.at)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}