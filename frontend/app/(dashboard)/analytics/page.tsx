"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, TrendingUp, MousePointerClick, DollarSign, Loader2, Download } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api/client";
import type { AnalyticsSnapshot, Book } from "@/types";
import { PLATFORM_LABELS } from "@/lib/constants/platforms";
import { formatCurrency, formatNumber, exportToCsv } from "@/lib/utils";

const CHART_COLORS = [
  "hsl(262 83% 58%)",
  "hsl(38 92% 50%)",
  "hsl(199 89% 48%)",
  "hsl(142 71% 45%)",
  "hsl(0 84% 60%)",
  "hsl(280 65% 60%)",
  "hsl(24 95% 53%)",
  "hsl(190 80% 40%)",
  "hsl(330 81% 60%)",
];

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

  // Trend: aggregate impressions/clicks/revenue by date across platforms.
  const trendData = useMemo(() => {
    const byDate = new Map<string, { date: string; impressions: number; clicks: number; revenue: number }>();
    for (const s of snapshots) {
      const key = new Date(s.date).toISOString().slice(0, 10);
      const existing = byDate.get(key) || { date: key, impressions: 0, clicks: 0, revenue: 0 };
      existing.impressions += s.impressions;
      existing.clicks += s.clicks;
      existing.revenue += Number(s.revenue);
      byDate.set(key, existing);
    }
    return Array.from(byDate.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({
        ...d,
        label: new Date(d.date).toLocaleDateString("en", { month: "short", day: "numeric" }),
      }));
  }, [snapshots]);

  // Spend by platform, for the pie chart.
  const platformSpend = useMemo(() => {
    const byPlatform = new Map<string, number>();
    for (const s of snapshots) {
      const label = PLATFORM_LABELS[s.platform] || s.platform;
      byPlatform.set(label, (byPlatform.get(label) || 0) + Number(s.spend));
    }
    return Array.from(byPlatform.entries())
      .map(([name, value]) => ({ name, value }))
      .filter((d) => d.value > 0);
  }, [snapshots]);

  function handleExport() {
    const book = books.find((b) => b.id === bookId);
    exportToCsv(
      `analytics-${book?.title || bookId}`,
      snapshots.map((s) => ({
        date: new Date(s.date).toISOString().slice(0, 10),
        platform: PLATFORM_LABELS[s.platform] || s.platform,
        impressions: s.impressions,
        clicks: s.clicks,
        conversions: s.conversions,
        spend: Number(s.spend).toFixed(2),
        revenue: Number(s.revenue).toFixed(2),
      }))
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground">
            Performance by book and platform — CPC, CPS, ROAS
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleExport}
            disabled={snapshots.length === 0}
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        </div>
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
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Impressions & clicks over time</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ left: 0, right: 12, top: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid hsl(var(--border))",
                        fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="impressions" name="Impressions" stroke="hsl(262 83% 58%)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="clicks" name="Clicks" stroke="hsl(38 92% 50%)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Spend by platform</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={platformSpend}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {platformSpend.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value)}
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid hsl(var(--border))",
                        fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Revenue over time</CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} margin={{ left: 0, right: 12, top: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => formatCurrency(v)} />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid hsl(var(--border))",
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="revenue" name="Revenue" fill="hsl(262 83% 58%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

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
        </>
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