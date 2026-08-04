import Link from "next/link";
import { BookOpen, Search, Sparkles, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const stats = [
  { label: "Books", value: "0", icon: BookOpen, href: "/books" },
  { label: "Audits run", value: "0", icon: Search, href: "/audit/new" },
  { label: "Creatives", value: "0", icon: Sparkles, href: "/creatives" },
  { label: "ROAS", value: "—", icon: TrendingUp, href: "/analytics" },
];

export function StatsCards() {
  return (
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
  );
}
