"use client";

import Link from "next/link";
import {
  BookOpen,
  Search,
  Sparkles,
  TrendingUp,
  ArrowRight,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const stats = [
  { label: "Books", value: "0", icon: BookOpen, href: "/books" },
  { label: "Audits run", value: "0", icon: Search, href: "/audit/new" },
  { label: "Creatives", value: "0", icon: Sparkles, href: "/creatives" },
  { label: "ROAS", value: "—", icon: TrendingUp, href: "/analytics" },
];

const quickActions = [
  {
    title: "Add a book",
    description: "Upload title, cover, and Amazon link",
    href: "/books/new",
    icon: Plus,
  },
  {
    title: "Run audience audit",
    description: "Discover who wants books like yours",
    href: "/audit/new",
    icon: Search,
  },
  {
    title: "Generate creatives",
    description: "TikTok, Amazon ads, emails & more",
    href: "/creatives",
    icon: Sparkles,
  },
];

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-8 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Your book marketing command center
          </p>
        </div>
        <Link href="/books/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" /> Add book
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href}>
            <Card className="transition hover:shadow-md hover:border-primary/30">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <s.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{s.value}</p>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold">Quick actions</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {quickActions.map((a) => (
            <Link key={a.title} href={a.href}>
              <Card className="h-full transition hover:shadow-md hover:border-primary/30">
                <CardContent className="p-5">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <a.icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold">{a.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {a.description}
                  </p>
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
                    Get started <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <BookOpen className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="font-medium">No activity yet</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Add your first book and run an audience audit to see insights and
              campaigns appear here.
            </p>
            <Link href="/books/new" className="mt-4">
              <Button variant="outline" size="sm">
                Add your first book
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
