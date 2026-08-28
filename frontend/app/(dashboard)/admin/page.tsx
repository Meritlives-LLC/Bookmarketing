"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  BookOpen,
  ScanSearch,
  Sparkles,
  ChevronRight,
  UserPlus,
} from "lucide-react";
import { AdminGuard } from "@/components/shared/AdminGuard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api/client";
import type { AdminStats } from "@/types";

const sections = [
  {
    href: "/admin/users",
    label: "Users",
    desc: "Roles, credits, and accounts",
    icon: Users,
  },
  {
    href: "/admin/books",
    label: "Books",
    desc: "Every book across all authors",
    icon: BookOpen,
  },
  {
    href: "/admin/audits",
    label: "Audience audits",
    desc: "Status and failures across the site",
    icon: ScanSearch,
  },
];

function StatCard({
  label,
  value,
  icon: Icon,
  loading,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  loading: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          {loading ? (
            <Skeleton className="h-7 w-12" />
          ) : (
            <p className="text-2xl font-bold">{value}</p>
          )}
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function AdminOverview() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .get<AdminStats>("/admin/stats")
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || "Failed to load admin stats");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
        <p className="text-muted-foreground">Manage users, books, and audits site-wide</p>
      </div>

      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Users" value={String(stats?.userCount ?? 0)} icon={Users} loading={loading} />
        <StatCard label="Books" value={String(stats?.bookCount ?? 0)} icon={BookOpen} loading={loading} />
        <StatCard label="Audits run" value={String(stats?.auditCount ?? 0)} icon={ScanSearch} loading={loading} />
        <StatCard label="Creatives made" value={String(stats?.creativeCount ?? 0)} icon={Sparkles} loading={loading} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <UserPlus className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">
            {loading ? "…" : stats?.newUsersLast7d ?? 0} new users in the last 7 days
          </CardTitle>
        </CardHeader>
        {!loading && stats && (
          <CardContent className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-medium text-muted-foreground">Users by role</p>
              <div className="space-y-1.5">
                {stats.usersByRole.map((r) => (
                  <div key={r.role} className="flex items-center justify-between text-sm">
                    <span>{r.role}</span>
                    <span className="font-medium">{r.count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-muted-foreground">
                Subscriptions by plan
              </p>
              <div className="space-y-1.5">
                {stats.subscriptionsByPlan.length === 0 && (
                  <p className="text-sm text-muted-foreground">No subscriptions yet</p>
                )}
                {stats.subscriptionsByPlan.map((p) => (
                  <div key={p.plan} className="flex items-center justify-between text-sm">
                    <span>{p.plan}</span>
                    <span className="font-medium">{p.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      <div>
        <h2 className="mb-4 text-lg font-semibold">Manage</h2>
        <div className="space-y-2">
          {sections.map((s) => (
            <Link key={s.href} href={s.href}>
              <Card className="mb-2 transition hover:border-primary/30">
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <s.icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{s.label}</p>
                    <p className="text-sm text-muted-foreground">{s.desc}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <AdminGuard>
      <AdminOverview />
    </AdminGuard>
  );
}
