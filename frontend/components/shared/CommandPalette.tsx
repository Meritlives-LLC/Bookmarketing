"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  BookOpen,
  Sparkles,
  ScanSearch,
  Calendar,
  BarChart3,
  Settings,
  LayoutDashboard,
  Loader2,
  CornerDownLeft,
} from "lucide-react";
import { api } from "@/lib/api/client";
import type { Book, Creative, Audit } from "@/types";
import { cn } from "@/lib/utils";

interface ResultItem {
  id: string;
  group: "Navigate" | "Books" | "Creatives" | "Audits";
  label: string;
  sublabel?: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: ResultItem[] = [
  { id: "nav-dashboard", group: "Navigate", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { id: "nav-books", group: "Navigate", label: "Books", href: "/books", icon: BookOpen },
  { id: "nav-audit", group: "Navigate", label: "Audience Audit", href: "/audit/new", icon: ScanSearch },
  { id: "nav-creatives", group: "Navigate", label: "Creative studio", href: "/creatives", icon: Sparkles },
  { id: "nav-calendar", group: "Navigate", label: "Calendar", href: "/calendar", icon: Calendar },
  { id: "nav-analytics", group: "Navigate", label: "Analytics", href: "/analytics", icon: BarChart3 },
  { id: "nav-settings", group: "Navigate", label: "Settings", href: "/settings", icon: Settings },
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loadingIndex, setLoadingIndex] = useState(false);
  const [books, setBooks] = useState<Book[]>([]);
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [indexed, setIndexed] = useState(false);

  // Cmd/Ctrl+K opens the palette from anywhere in the dashboard.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const buildIndex = useCallback(async () => {
    if (indexed) return;
    setLoadingIndex(true);
    try {
      const bookList = await api.get<Book[]>("/books");
      setBooks(bookList);
      // Search across every book's creatives + audits in parallel. Fine for
      // the realistic number of books an author manages at once.
      const [creativeLists, auditLists] = await Promise.all([
        Promise.all(
          bookList.map((b) =>
            api.get<Creative[]>(`/creatives?bookId=${b.id}`).catch(() => [] as Creative[])
          )
        ),
        Promise.all(
          bookList.map((b) =>
            api.get<Audit[]>(`/audit?bookId=${b.id}`).catch(() => [] as Audit[])
          )
        ),
      ]);
      setCreatives(creativeLists.flat());
      setAudits(auditLists.flat());
      setIndexed(true);
    } catch {
      // Search degrades to nav-only if the API is unreachable.
    } finally {
      setLoadingIndex(false);
    }
  }, [indexed]);

  useEffect(() => {
    if (open) buildIndex();
  }, [open, buildIndex]);

  const bookById = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);

  const results = useMemo<ResultItem[]>(() => {
    const q = query.trim().toLowerCase();
    const nav = q
      ? NAV_ITEMS.filter((n) => n.label.toLowerCase().includes(q))
      : NAV_ITEMS;

    const bookResults: ResultItem[] = books
      .filter((b) => !q || b.title.toLowerCase().includes(q))
      .map((b) => ({
        id: `book-${b.id}`,
        group: "Books",
        label: b.title,
        sublabel: b.genre.replace(/_/g, " ").toLowerCase(),
        href: `/books/${b.id}`,
        icon: BookOpen,
      }));

    const creativeResults: ResultItem[] = creatives
      .filter((c) => !q || (c.title || c.type).toLowerCase().includes(q))
      .map((c) => ({
        id: `creative-${c.id}`,
        group: "Creatives",
        label: c.title || c.type.replace(/_/g, " ").toLowerCase(),
        sublabel: bookById.get(c.bookId)?.title,
        href: `/creatives/${c.id}`,
        icon: Sparkles,
      }));

    const auditResults: ResultItem[] = audits
      .filter((a) => !q || (bookById.get(a.bookId)?.title || "").toLowerCase().includes(q))
      .map((a) => ({
        id: `audit-${a.id}`,
        group: "Audits",
        label: `${bookById.get(a.bookId)?.title || "Book"} audit`,
        sublabel: a.status.toLowerCase(),
        href: `/audit/${a.id}`,
        icon: ScanSearch,
      }));

    return [...nav, ...bookResults, ...creativeResults, ...auditResults].slice(0, 30);
  }, [query, books, creatives, audits, bookById]);

  useEffect(() => setActiveIndex(0), [query, open]);

  function go(item: ResultItem) {
    setOpen(false);
    setQuery("");
    router.push(item.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[activeIndex]) {
      e.preventDefault();
      go(results[activeIndex]);
    }
  }

  let groupCursor = "";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-9 w-full max-w-xs items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm text-muted-foreground transition-colors hover:bg-muted/50"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">Search books, creatives, audits…</span>
        <kbd className="hidden shrink-0 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium sm:inline">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 px-4 pt-[12vh]"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-xl border bg-popover shadow-2xl animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b px-4 py-3">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search books, creatives, audits, or jump to a page…"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              {loadingIndex && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
            </div>
            <div className="max-h-96 overflow-y-auto p-2">
              {results.length === 0 && (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No results for &ldquo;{query}&rdquo;
                </p>
              )}
              {results.map((item, i) => {
                const showGroup = item.group !== groupCursor;
                groupCursor = item.group;
                return (
                  <div key={item.id}>
                    {showGroup && (
                      <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground first:pt-1">
                        {item.group}
                      </p>
                    )}
                    <button
                      onMouseEnter={() => setActiveIndex(i)}
                      onClick={() => go(item)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                        i === activeIndex ? "bg-primary/10 text-primary" : "hover:bg-muted/60"
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.sublabel && (
                        <span className="shrink-0 truncate text-xs text-muted-foreground">
                          {item.sublabel}
                        </span>
                      )}
                      {i === activeIndex && <CornerDownLeft className="h-3.5 w-3.5 shrink-0" />}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}