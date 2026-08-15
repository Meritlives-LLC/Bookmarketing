"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api/client";
import { GENRES } from "@/lib/constants/genres";
import { parseAmazonUrl } from "@/lib/amazon";
import { parseGoodreadsUrl } from "@/lib/goodreads";
import type { BookGenre } from "@/types";

export default function NewBookPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    title: "",
    subtitle: "",
    description: "",
    genre: "FANTASY" as BookGenre,
    amazonUrl: "",
    goodreadsUrl: "",
    asin: "",
    isbn: "",
    price: "",
  });

  function update(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  /** When Amazon URL changes, pull ASIN / ISBN from the public URL path. */
  function onAmazonUrlChange(value: string) {
    const parsed = parseAmazonUrl(value);
    setForm((f) => ({
      ...f,
      amazonUrl: value,
      // Only fill empty fields so we never overwrite a value the user typed
      asin: f.asin || parsed.asin || "",
      isbn: f.isbn || parsed.isbn || "",
    }));
  }

  /** When Goodreads URL changes, pull ISBN if present in the URL. */
  function onGoodreadsUrlChange(value: string) {
    const parsed = parseGoodreadsUrl(value);
    setForm((f) => ({
      ...f,
      goodreadsUrl: value,
      isbn: f.isbn || parsed.isbn || "",
    }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // Final pass: ensure ids are extracted even if user never blurred the field
      const fromAmazon = parseAmazonUrl(form.amazonUrl);
      const fromGoodreads = parseGoodreadsUrl(form.goodreadsUrl);

      const body = {
        ...form,
        price: form.price ? parseFloat(form.price) : undefined,
        subtitle: form.subtitle || undefined,
        amazonUrl: form.amazonUrl || undefined,
        goodreadsUrl: form.goodreadsUrl || undefined,
        asin: form.asin || fromAmazon.asin || undefined,
        isbn: form.isbn || fromAmazon.isbn || fromGoodreads.isbn || undefined,
      };
      const book = await api.post<{ id: string; auditId?: string | null }>("/books", body);
      // Auto-audit starts on create — land on the live audit page when available
      if (book.auditId) {
        router.push(`/audit/${book.auditId}`);
      } else {
        router.push(`/books/${book.id}`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create book");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-fade-in">
      <div>
        <Link
          href="/books"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to books
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Add a book</h1>
        <p className="text-muted-foreground">
          Tell us about your book so we can find its readers
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Book details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">Title *</label>
              <Input
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
                required
                placeholder="The Name of Your Book"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Subtitle</label>
              <Input
                value={form.subtitle}
                onChange={(e) => update("subtitle", e.target.value)}
                placeholder="Optional subtitle"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description *</label>
              <textarea
                className="flex min-h-[120px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                required
                placeholder="Book description / blurb..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Genre *</label>
              <select
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                value={form.genre}
                onChange={(e) => update("genre", e.target.value)}
              >
                {GENRES.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Amazon URL</label>
                <Input
                  value={form.amazonUrl}
                  onChange={(e) => onAmazonUrlChange(e.target.value)}
                  placeholder="https://amazon.com/dp/..."
                />
                <p className="text-xs text-muted-foreground">
                  ASIN / ISBN fill automatically from the link when present
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Goodreads URL</label>
                <Input
                  value={form.goodreadsUrl}
                  onChange={(e) => onGoodreadsUrlChange(e.target.value)}
                  placeholder="https://goodreads.com/book/show/..."
                />
                <p className="text-xs text-muted-foreground">
                  ISBN fills automatically when it appears in the link
                </p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">ASIN</label>
                <Input
                  value={form.asin}
                  onChange={(e) => update("asin", e.target.value)}
                  placeholder="B0XXXXXXX"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">ISBN</label>
                <Input
                  value={form.isbn}
                  onChange={(e) => update("isbn", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Price (USD)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => update("price", e.target.value)}
                  placeholder="9.99"
                />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={loading}>
                {loading ? "Saving…" : "Save book"}
              </Button>
              <Link href="/books">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}