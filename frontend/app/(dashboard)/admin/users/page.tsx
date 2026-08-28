"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Trash2, Users } from "lucide-react";
import { AdminGuard } from "@/components/shared/AdminGuard";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { useAuth } from "@/lib/hooks/useAuth";
import { formatRelative } from "@/lib/utils";
import type { AdminUser, PaginationMeta, UserRole } from "@/types";

const PAGE_SIZE = 20;
const ROLES: UserRole[] = ["AUTHOR", "ADMIN", "SUPER_ADMIN"];

function RoleBadge({ role }: { role: UserRole }) {
  if (role === "SUPER_ADMIN") return <Badge variant="destructive">SUPER_ADMIN</Badge>;
  if (role === "ADMIN") return <Badge variant="warning">ADMIN</Badge>;
  return <Badge variant="secondary">AUTHOR</Badge>;
}

function AdminUsersView() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [creditsDraft, setCreditsDraft] = useState<Record<string, string>>({});
  const requestIdRef = useRef(0);

  function load(nextPage: number, nextSearch: string) {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    const params = new URLSearchParams({ page: String(nextPage), limit: String(PAGE_SIZE) });
    if (nextSearch) params.set("search", nextSearch);
    apiGetWithMeta<AdminUser[], PaginationMeta>(`/admin/users?${params.toString()}`)
      .then(({ data, meta: m }) => {
        if (requestId !== requestIdRef.current) return;
        setUsers(data);
        setMeta(m);
        setError("");
      })
      .catch((e) => {
        if (requestId === requestIdRef.current) {
          setError(e instanceof Error ? e.message : "Failed to load users");
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

  async function updateUser(id: string, patch: { role?: UserRole; credits?: number }) {
    setSavingId(id);
    setRowError((prev) => ({ ...prev, [id]: "" }));
    try {
      const updated = await api.patch<AdminUser>(`/admin/users/${id}`, patch);
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...updated } : u)));
    } catch (e) {
      const message =
        e instanceof ApiError ? e.message : "Failed to update user";
      setRowError((prev) => ({ ...prev, [id]: message }));
    } finally {
      setSavingId(null);
    }
  }

  async function deleteUser(u: AdminUser) {
    if (
      !confirm(
        `Delete ${u.email}? This permanently removes their account, books, and all related data.`
      )
    ) {
      return;
    }
    setSavingId(u.id);
    try {
      await api.delete(`/admin/users/${u.id}`);
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      setMeta((prev) => (prev ? { ...prev, total: prev.total - 1 } : prev));
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Failed to delete user";
      setRowError((prev) => ({ ...prev, [u.id]: message }));
    } finally {
      setSavingId(null);
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
        <h1 className="text-2xl font-bold tracking-tight">Users</h1>
        <p className="text-muted-foreground">
          {meta ? `${meta.total} total` : "Loading…"}
        </p>
      </div>

      <Input
        placeholder="Search by name or email…"
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

          {!loading && users.length === 0 && (
            <EmptyState icon={Users} title="No users found" description="Try a different search." />
          )}

          {!loading && users.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Credits</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Books</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => {
                  const isSelf = u.id === me?.id;
                  const draft = creditsDraft[u.id] ?? String(u.credits);
                  return (
                    <TableRow key={u.id}>
                      <TableCell>
                        <p className="font-medium">
                          {u.firstName} {u.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                        {rowError[u.id] && (
                          <p className="mt-1 text-xs text-destructive">{rowError[u.id]}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <RoleBadge role={u.role} />
                          {!isSelf && (
                            <Select
                              className="h-8 w-auto text-xs"
                              value={u.role}
                              disabled={savingId === u.id}
                              onChange={(e) =>
                                updateUser(u.id, { role: e.target.value as UserRole })
                              }
                            >
                              {ROLES.map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </Select>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number"
                            min={0}
                            className="h-8 w-20 text-xs"
                            value={draft}
                            onChange={(e) =>
                              setCreditsDraft((prev) => ({ ...prev, [u.id]: e.target.value }))
                            }
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            disabled={savingId === u.id || Number(draft) === u.credits}
                            onClick={() => updateUser(u.id, { credits: Number(draft) })}
                          >
                            Save
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {u.subscription?.plan ?? "FREE"}
                      </TableCell>
                      <TableCell className="text-sm">{u._count.books}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatRelative(u.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        {!isSelf && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 text-destructive hover:text-destructive"
                            disabled={savingId === u.id}
                            onClick={() => deleteUser(u)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
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

export default function AdminUsersPage() {
  return (
    <AdminGuard>
      <AdminUsersView />
    </AdminGuard>
  );
}
