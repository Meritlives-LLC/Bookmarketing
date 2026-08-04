import Link from "next/link";
import {
  BookOpen,
  Search,
  Sparkles,
  Calendar,
  BarChart3,
  Users,
  ArrowRight,
  CheckCircle2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const features = [
  {
    icon: Search,
    title: "AI Audience Discovery",
    description:
      "We scrape TikTok, Goodreads, Amazon, Reddit, BookTube and more to find the exact readers who want books like yours.",
  },
  {
    icon: Sparkles,
    title: "Creative Generation",
    description:
      "TikTok scripts, Amazon keywords, email campaigns, Facebook ads, discussion guides — generated for every reader segment.",
  },
  {
    icon: Calendar,
    title: "30-Day Marketing Calendar",
    description:
      "One-click campaign schedules with optimal posting times across platforms. Stop guessing, start publishing.",
  },
  {
    icon: BarChart3,
    title: "Performance & Optimization",
    description:
      "Real-time ROAS, CPC, and CPS. AI pauses underperformers and shifts budget to winners automatically.",
  },
];

const segments = [
  "BookTok",
  "Goodreads",
  "Amazon Search",
  "Reddit",
  "BookTube",
  "Newsletters",
  "Facebook Groups",
  "Podcasts",
  "Book Clubs",
  "Libraries",
];

const stats = [
  { value: "78%", label: "of self-published authors sell < 100 copies" },
  { value: "40%", label: "of author time spent on marketing" },
  { value: "63%", label: "give up promotion within 3 months" },
];

export default function LandingPage() {
  return (
    <div className="bg-hero-pattern">
      {/* Hero */}
      <section className="relative overflow-hidden px-4 pb-20 pt-16 sm:px-6 lg:px-8 lg:pt-24">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-background/80 px-4 py-1.5 text-sm shadow-sm backdrop-blur">
            <Zap className="h-4 w-4 text-amber-500" />
            <span className="text-muted-foreground">
              AI-powered marketing OS for authors
            </span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Your book is finished.{" "}
            <span className="gradient-text">Now find the readers</span> who
            already want it.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            BookMarketingOS discovers where your ideal readers hang out, generates
            platform-native creatives, and runs campaigns that turn attention into
            sales — so you can get back to writing.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/register">
              <Button size="lg" className="gap-2">
                Start free <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/features">
              <Button size="lg" variant="outline">
                See how it works
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Pain stats */}
      <section className="border-y bg-muted/40 px-4 py-12">
        <div className="mx-auto grid max-w-5xl gap-8 sm:grid-cols-3">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-3xl font-bold text-primary">{s.value}</div>
              <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              From manuscript to readers in five steps
            </h2>
            <p className="mt-3 text-muted-foreground">
              Built for authors who are writers first — not marketers.
            </p>
          </div>
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <Card key={f.title} className="border-0 shadow-soft transition hover:shadow-glow">
                <CardContent className="p-6">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <f.icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{f.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Reader segments */}
      <section className="bg-muted/40 px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Users className="h-6 w-6" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight">
            We know where your readers live
          </h2>
          <p className="mt-3 text-muted-foreground">
            Audience discovery across the platforms that actually sell books.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            {segments.map((s) => (
              <span
                key={s}
                className="rounded-full border bg-background px-4 py-2 text-sm font-medium shadow-sm"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl rounded-2xl bg-gradient-to-br from-brand-700 to-brand-900 px-8 py-14 text-center text-white shadow-glow">
          <BookOpen className="mx-auto h-10 w-10 opacity-90" />
          <h2 className="mt-4 text-3xl font-bold">
            Stop writing into the void
          </h2>
          <p className="mt-3 text-brand-100">
            Upload your book. Let AI find your readers. Launch campaigns that convert.
          </p>
          <Link href="/register" className="mt-8 inline-block">
            <Button size="lg" variant="accent" className="gap-2">
              Create free account <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <ul className="mt-8 flex flex-wrap justify-center gap-6 text-sm text-brand-200">
            {["No credit card required", "1 free audience audit", "Cancel anytime"].map(
              (t) => (
                <li key={t} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" /> {t}
                </li>
              )
            )}
          </ul>
        </div>
      </section>
    </div>
  );
}
