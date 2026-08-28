"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, ScanSearch } from "lucide-react";
import { AdminGuard } from "@/components/shared/AdminGuard";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
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
import { apiGetWithMeta } from "@/lib/api/client";
import { formatRelative } from "@/lib/utils";
import type { AdminAudit, AuditStatus, PaginationMeta } from "@/types";

const PAGE_SIZE = 20;
const STATUSES: AuditStatus[] = ["PENDING", "SCRAPING", "ANALYZING", "COMPLETED", "FAILED"];

function StatusBadge({ status }: { status: AuditStatus }) {
  if (status === "COMPLETED") return <Badge variant="success">COMPLETED</Badge>;
  if (status === "FAILED") return <Badge variant="destructive">FAILED</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

function AdminAuditsView() {
  const [audits, setAudits] = useState<AdminAudit[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<AuditStatus | "">("");
  const [page, setPage] = useState(1);
  const requestIdRef = useRef(0);

  function load(nextPage: number, nextStatus: AuditStatus | "") {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    const params = new URLSearchParams({ page: String(nextPage), limit: String(PAGE_SIZE) });
    if (nextStatus) params.set("status", nextStatus);
    apiGetWithMeta<AdminAudit[], PaginationMeta>(`/admin/audits?${params.toString()}`)
      .then(({ data, meta: m }) => {
        if (requestId !== requestIdRef.current) return;
        setAudits(data);
        setMeta(m);
        setError("");
      })
      .catch((e) => {
        if (requestId === requestIdRef.current) {
          setError(e instanceof Error ? e.message : "Failed to load audits");
        }
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false);
      });
  }

  useEffect(() => {
    setPage(1);
    load(1, status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

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
        <h1 className="text-2xl font-bold tracking-tight">Audience audits</h1>
        <p className="text-muted-foreground">{meta ? `${meta.total} total` : "Loading…"}</p>
      </div>

      <Select
        className="max-w-xs"
        value={status}
        onChange={(e) => setStatus(e.target.value as AuditStatus | "")}
      >
        <option value="">All statuses</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </Select>

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

          {!loading && audits.length === 0 && (
            <EmptyState
              icon={ScanSearch}
              title="No audits found"
              description="Try a different status filter."
            />
          )}

          {!loading && audits.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Book</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {audits.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.book.title}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {a.book.user.email}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={a.status} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatRelative(a.requestedAt)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {a.completedAt ? formatRelative(a.completedAt) : "—"}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-destructive">
                      {a.errorMessage ?? ""}
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
              load(next, status);
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
              load(next, status);
            }}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

export default function AdminAuditsPage() {
  return (
    <AdminGuard>
      <AdminAuditsView />
    </AdminGuard>
  );
}
