import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function BlogPostPage({
  params,
}: {
  params: { slug: string };
}) {
  const title = params.slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  return (
    <article className="px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/blog"
          className="mb-8 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Blog
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-6 leading-relaxed text-muted-foreground">
          This is a placeholder article. Full content can be loaded from a CMS or
          markdown files. BookMarketingOS helps authors discover readers on BookTok,
          Goodreads, Amazon, Reddit, and more — then generate campaigns that speak
          their language.
        </p>
      </div>
    </article>
  );
}
