import Link from "next/link";
import { Plus, Search, Sparkles, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const actions = [
  { title: "Add a book", description: "Upload title, cover, and Amazon link", href: "/books/new", icon: Plus },
  { title: "Run audience audit", description: "Discover who wants books like yours", href: "/audit/new", icon: Search },
  { title: "Generate creatives", description: "TikTok, Amazon ads, emails & more", href: "/creatives", icon: Sparkles },
];

export function QuickActions() {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {actions.map((a) => (
        <Link key={a.title} href={a.href}>
          <Card className="h-full transition hover:shadow-md hover:border-primary/30">
            <CardContent className="p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <a.icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold">{a.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{a.description}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
                Get started <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
