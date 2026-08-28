"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, Loader2, Trash2 } from "lucide-react";
import { AdminGuard } from "@/components/shared/AdminGuard";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/EmptyState";
import { apiGetWithMeta, api, ApiError } from "@/lib/api/client";
import { formatRelative } from "@/lib/utils";
import type { AdminBook, PaginationMeta } from "@/types";

const PAGE_SIZE = 20;

function AdminBooksView() {
  const [books, setBooks] = useState<AdminBook[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  function load(nextPage: number, nextSearch: string) {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    const params = new URLSearchParams({ page: String(nextPage), limit: String(PAGE_SIZE) });
    if (nextSearch) params.set("search", nextSearch);
    apiGetWithMeta<AdminBook[], PaginationMeta>(`/admin/books?${params.toString()}`)
      .then(({ data, meta: m }) => {
        if (requestId !== requestIdRef.current) return;
        setBooks(data);
        setMeta(m);
        setError("");
      })
      .catch((e) => {
        if (requestId === requestIdRef.current) {
          setError(e instanceof Error ? e.message : "Failed to load books");
        }
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false);
      });
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      load(1, search);
    }, search ? 300 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function handleDelete(book: AdminBook) {
    if (
      !confirm(
        `Delete "${book.title}" (${book.user.email}) and all its audits/creatives? This cannot be undone.`
      )
    ) {
      return;
    }
    setDeletingId(book.id);
    try {
      await api.delete(`/admin/books/${book.id}`);
      setBooks((prev) => prev.filter((b) => b.id !== book.id));
      setMeta((prev) => (prev ? { ...prev, total: prev.total - 1 } : prev));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to delete book");
    } finally {
      setDeletingId(null);
    }
  }

  const totalPages = meta?.totalPages ?? 1;

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-in">
      <div>
        <Link
          href="/admin"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Admin
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Books</h1>
        <p className="text-muted-foreground">{meta ? `${meta.total} total` : "Loading…"}</p>
      </div>

      <Input
        placeholder="Search by title or author email…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {loading && (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}

          {!loading && books.length === 0 && (
            <EmptyState icon={BookOpen} title="No books found" description="Try a different search." />
          )}

          {!loading && books.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead>Genre</TableHead>
                  <TableHead>Audits</TableHead>
                  <TableHead>Creatives</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {books.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.title}</TableCell>
                    <TableCell>
                      <p className="text-sm">
                        {b.user.firstName} {b.user.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground">{b.user.email}</p>
                    </TableCell>
                    <TableCell className="text-sm">{b.genre}</TableCell>
                    <TableCell className="text-sm">{b._count.audits}</TableCell>
                    <TableCell className="text-sm">{b._count.creatives}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatRelative(b.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-destructive hover:text-destructive"
                        disabled={deletingId === b.id}
                        onClick={() => handleDelete(b)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1 || loading}
            onClick={() => {
              const next = page - 1;
              setPage(next);
              load(next, search);
            }}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages || loading}
            onClick={() => {
              const next = page + 1;
              setPage(next);
              load(next, search);
            }}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

export default function AdminBooksPage() {
  return (
    <AdminGuard>
      <AdminBooksView />
    </AdminGuard>
  );
}
