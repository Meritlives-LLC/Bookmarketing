"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Plus, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { BookList } from "./components/BookList";
import { BookFilters } from "./components/BookFilters";
import { api } from "@/lib/api/client";
import type { Book } from "@/types";

export default function BooksPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [genre, setGenre] = useState("");

  useEffect(() => {
    api
      .get<Book[]>("/books")
      .then(setBooks)
      .catch((e) => setError(e.message || "Failed to load books"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return books.filter((b) => {
      const matchSearch =
        !search ||
        b.title.toLowerCase().includes(search.toLowerCase()) ||
        (b.subtitle || "").toLowerCase().includes(search.toLowerCase());
      const matchGenre = !genre || b.genre === genre;
      return matchSearch && matchGenre;
    });
  }, [books, search, genre]);

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

      {!loading && books.length > 0 && (
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
              title="No books yet"
              description="Add your first book to unlock audience discovery, creatives, and campaign calendars."
              actionLabel="Add your first book"
              actionHref="/books/new"
            />
          </CardContent>
        </Card>
      )}

      {!loading && filtered.length > 0 && <BookList books={filtered} />}
    </div>
  );
}
