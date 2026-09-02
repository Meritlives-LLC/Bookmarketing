export const metadata = { title: "About" };

export default function AboutPage() {
  return (
    <div className="px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-4xl font-bold tracking-tight">About Kyuka Books</h1>
        <div className="mt-8 space-y-6 text-muted-foreground leading-relaxed">
          <p>
            Most authors are writers first. They spend years crafting a book —
            then discover that getting it into readers&apos; hands is a completely
            different skill. 78% of self-published authors sell fewer than 100
            copies. The average author spends 40% of their time on marketing. Many
            give up within three months.
          </p>
          <p>
            Kyuka Books was built to close that gap. We don&apos;t just generate
            ads. We discover <em>where</em> readers who want books like yours
            already hang out — BookTok, Goodreads, Amazon search, Reddit,
            BookTube, newsletters, Facebook groups, podcasts — and create
            campaigns that speak their language.
          </p>
          <p>
            The goal is simple: authors should spend more time writing the next
            book, and less time guessing how to market the last one.
          </p>
        </div>
      </div>
    </div>
  );
}
