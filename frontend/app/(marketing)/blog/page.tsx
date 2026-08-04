import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Blog" };

const posts = [
  {
    slug: "find-your-booktok-audience",
    title: "How to find your BookTok audience without guessing",
    excerpt: "Readers are already talking about books like yours. Here's how AI discovers them.",
    date: "2026-07-15",
  },
  {
    slug: "amazon-keywords-that-convert",
    title: "Amazon keywords that actually convert for indie authors",
    excerpt: "Search volume is vanity. Intent is what sells books.",
    date: "2026-06-28",
  },
  {
    slug: "stop-marketing-to-everyone",
    title: "Stop marketing to everyone: reader segments that matter",
    excerpt: "Goodreads power readers and Reddit communities buy differently than BookTok.",
    date: "2026-06-10",
  },
];

export default function BlogPage() {
  return (
    <div className="px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-4xl font-bold tracking-tight">Blog</h1>
        <p className="mt-3 text-muted-foreground">
          Practical marketing for authors who write first.
        </p>
        <div className="mt-12 space-y-6">
          {posts.map((p) => (
            <Link key={p.slug} href={`/blog/${p.slug}`}>
              <Card className="mb-4 transition hover:border-primary/30 hover:shadow-md">
                <CardContent className="p-6">
                  <time className="text-xs text-muted-foreground">{p.date}</time>
                  <h2 className="mt-1 text-lg font-semibold">{p.title}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">{p.excerpt}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
