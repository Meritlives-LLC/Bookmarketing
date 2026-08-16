"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Plus, BookOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { BookList } from "./components/BookList";
import { BookFilters } from "./components/BookFilters";
import { api, apiGetWithMeta, ApiError } from "@/lib/api/client";
import type { Book } from "@/types";

const PAGE_SIZE = 20;

export default function BooksPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [genre, setGenre] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const requestIdRef = useRef(0);
  

  // Reset to page 1 whenever the filters change, and debounce the search
  // input so we're not hitting the API on every keystroke.
  useEffect(() => {
    const requestId = ++requestIdRef.current;
    const timer = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({ page: "1", limit: String(PAGE_SIZE) });
      if (search) params.set("search", search);
      if (genre) params.set("genre", genre);
      apiGetWithMeta<Book[], { total?: number; page?: number }>(`/books?${params.toString()}`)
        .then(({ data, meta }) => {
          if (requestId !== requestIdRef.current) return; // stale response
          setBooks(data);
          setPage(1);
          setTotal(meta.total ?? data.length);
        })
        .catch((e) => {
          if (requestId === requestIdRef.current) setError(e.message || "Failed to load books");
        })
        .finally(() => {
          if (requestId === requestIdRef.current) setLoading(false);
        });
    }, search ? 300 : 0);

    return () => clearTimeout(timer);
  }, [search, genre]);

  async function loadMore() {
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ page: String(nextPage), limit: String(PAGE_SIZE) });
      if (search) params.set("search", search);
      if (genre) params.set("genre", genre);
      const { data, meta } = await apiGetWithMeta<Book[], { total?: number }>(`/books?${params.toString()}`);
      setBooks((prev) => [...prev, ...data]);
      setPage(nextPage);
      if (meta.total != null) setTotal(meta.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load more books");
    } finally {
      setLoadingMore(false);
    }
  }


  async function handleDelete(book: Book) {
    if (
      !confirm(
        `Delete "${book.title}" and all related audits/creatives? This cannot be undone.`
      )
    ) {
      return;
    }
    setDeletingId(book.id);
    setError("");
    try {
      await api.delete(`/books/${book.id}`);
      setBooks((prev) => prev.filter((b) => b.id !== book.id));
      setTotal((t) => Math.max(0, t - 1));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  const hasMore = books.length < total;

  const [deletingId, setDeletingId] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Books</h1>
          <p className="text-muted-foreground">
            Manage titles and launch marketing for each
          </p>
        </div>
        <Link href="/books/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" /> Add book
          </Button>
        </Link>
      </div>

      {!loading && (books.length > 0 || search || genre) && (
        <BookFilters
          search={search}
          genre={genre}
          onSearchChange={setSearch}
          onGenreChange={setGenre}
        />
      )}

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      )}

      {error && (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            {error}. Make sure the backend is running on port 4000.
          </CardContent>
        </Card>
      )}

      {!loading && !error && books.length === 0 && (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={BookOpen}
              title={search || genre ? "No books match your filters" : "No books yet"}
              description={
                search || genre
                  ? "Try a different search term or clear the genre filter."
                  : "Add your first book to unlock audience discovery, creatives, and campaign calendars."
              }
              actionLabel="Add your first book"
              actionHref="/books/new"
            />
          </CardContent>
        </Card>
      )}

      {!loading && books.length > 0 && (
        <>
          <BookList books={books} onDelete={handleDelete} deletingId={deletingId} />
          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" onClick={loadMore} disabled={loadingMore} className="gap-2">
                {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
                Load more ({books.length} of {total})
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
