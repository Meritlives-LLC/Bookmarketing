import {
  Search,
  Sparkles,
  Calendar,
  BarChart3,
  Target,
  MessageSquare,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Features" };

const features = [
  {
    icon: Search,
    title: "AI Audience Discovery",
    body: "Scrape BookTok, Goodreads shelves, Amazon keyword demand, Reddit threads, BookTube, newsletters, and Facebook groups. Understand what readers love, hate, and are searching for right now.",
  },
  {
    icon: Sparkles,
    title: "Creative Studio",
    body: "Generate TikTok scripts with trending hooks, Amazon ad keyword sets with bid suggestions, email sequences, Facebook/Instagram ads, discussion guides, podcast pitches, and Reddit posts — per reader segment.",
  },
  {
    icon: Calendar,
    title: "Marketing Calendar",
    body: "AI builds a 30-day posting and ad schedule optimized for each platform. One-click launch into Facebook, Amazon Ads, email tools, and more.",
  },
  {
    icon: BarChart3,
    title: "Analytics & ROAS",
    body: "Track impressions, clicks, conversions, spend, and revenue by book and platform. See cost per sale and return on ad spend in one dashboard.",
  },
  {
    icon: Target,
    title: "Auto Optimization",
    body: "Underperforming creatives are paused. Budget shifts to winners. Weekly recommendations keep campaigns improving without constant manual work.",
  },
  {
    icon: MessageSquare,
    title: "Reader-Segment Messaging",
    body: "Speak the language of BookTok, Goodreads power readers, Amazon shoppers, Reddit communities, and book clubs — not generic 'buy my book' copy.",
  },
];

export default function FeaturesPage() {
  return (
    <div className="px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-4xl font-bold tracking-tight">
          Everything you need to market a book
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          From discovering who wants your book to running and optimizing the
          campaigns that reach them.
        </p>
      </div>
      <div className="mx-auto mt-14 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <Card key={f.title} className="border-0 shadow-soft">
            <CardContent className="p-6">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
