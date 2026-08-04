"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api/client";
import type { Book } from "@/types";

export default function NewAuditPage() {
  const router = useRouter();
  const [books, setBooks] = useState<Book[]>([]);
  const [bookId, setBookId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<Book[]>("/books").then(setBooks).catch(() => {});
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!bookId) return;
    setLoading(true);
    setError("");
    try {
      const audit = await api.post<{ id: string }>(`/books/${bookId}/audit`);
      router.push(`/audit/${audit.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start audit");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 animate-fade-in">
      <div>
        <Link
          href="/dashboard"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Audience audit</h1>
        <p className="text-muted-foreground">
          Discover BookTok, Goodreads, Amazon, Reddit, and more readers for your book
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4" /> Select book
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <select
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              value={bookId}
              onChange={(e) => setBookId(e.target.value)}
              required
            >
              <option value="">Choose a book…</option>
              {books.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
            {books.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No books found.{" "}
                <Link href="/books/new" className="text-primary hover:underline">
                  Add a book first
                </Link>
              </p>
            )}
            <Button type="submit" disabled={loading || !bookId}>
              {loading ? "Starting audit…" : "Run audience audit"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
