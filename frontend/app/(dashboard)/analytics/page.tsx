"use client";

import { useEffect, useState } from "react";
import { BarChart3, TrendingUp, MousePointerClick, DollarSign, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api/client";
import type { AnalyticsSnapshot, Book } from "@/types";
import { PLATFORM_LABELS } from "@/lib/constants/platforms";
import { formatCurrency, formatNumber } from "@/lib/utils";

export default function AnalyticsPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [bookId, setBookId] = useState("");
  const [snapshots, setSnapshots] = useState<AnalyticsSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<Book[]>("/books").then((b) => {
      setBooks(b);
      if (b.length) setBookId(b[0].id);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!bookId) return;
    setLoading(true);
    api
      .get<AnalyticsSnapshot[]>(`/analytics?bookId=${bookId}`)
      .then(setSnapshots)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [bookId]);

  const totals = snapshots.reduce(
    (acc, s) => ({
      impressions: acc.impressions + s.impressions,
      clicks: acc.clicks + s.clicks,
      conversions: acc.conversions + s.conversions,
      spend: acc.spend + Number(s.spend),
      revenue: acc.revenue + Number(s.revenue),
    }),
    { impressions: 0, clicks: 0, conversions: 0, spend: 0, revenue: 0 }
  );
  const roas = totals.spend > 0 ? totals.revenue / totals.spend : 0;
  const cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
  const cps = totals.conversions > 0 ? totals.spend / totals.conversions : 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground">
            Performance by book and platform — CPC, CPS, ROAS
          </p>
        </div>
        <select
          className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
          value={bookId}
          onChange={(e) => setBookId(e.target.value)}
        >
          <option value="">Select book…</option>
          {books.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard icon={BarChart3} label="Impressions" value={formatNumber(totals.impressions)} />
        <MetricCard icon={MousePointerClick} label="Clicks" value={formatNumber(totals.clicks)} sub={`CPC ${formatCurrency(cpc)}`} />
        <MetricCard icon={TrendingUp} label="Conversions" value={formatNumber(totals.conversions)} sub={`CPS ${formatCurrency(cps)}`} />
        <MetricCard icon={DollarSign} label="ROAS" value={roas ? `${roas.toFixed(2)}x` : "—"} sub={`Spend ${formatCurrency(totals.spend)}`} />
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {!loading && snapshots.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <BarChart3 className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-4 font-medium">No analytics data yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Launch campaigns and connect ad accounts to see performance here.
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && snapshots.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">By platform</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-3 pr-4 font-medium">Platform</th>
                  <th className="pb-3 pr-4 font-medium">Date</th>
                  <th className="pb-3 pr-4 font-medium">Impr.</th>
                  <th className="pb-3 pr-4 font-medium">Clicks</th>
                  <th className="pb-3 pr-4 font-medium">Conv.</th>
                  <th className="pb-3 pr-4 font-medium">Spend</th>
                  <th className="pb-3 font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((s) => (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="py-3 pr-4">
                      <Badge variant="outline">
                        {PLATFORM_LABELS[s.platform] || s.platform}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4">{new Date(s.date).toLocaleDateString()}</td>
                    <td className="py-3 pr-4">{formatNumber(s.impressions)}</td>
                    <td className="py-3 pr-4">{formatNumber(s.clicks)}</td>
                    <td className="py-3 pr-4">{formatNumber(s.conversions)}</td>
                    <td className="py-3 pr-4">{formatCurrency(Number(s.spend))}</td>
                    <td className="py-3">{formatCurrency(Number(s.revenue))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
