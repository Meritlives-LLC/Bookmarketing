import Link from "next/link";
import { BookOpen } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Book } from "@/types";
import { GENRE_LABELS } from "@/lib/constants/genres";

export function BookCard({ book }: { book: Book }) {
  return (
    <Link href={`/books/${book.id}`}>
      <Card className="h-full overflow-hidden transition hover:shadow-md hover:border-primary/30">
        <div className="aspect-[2/3] max-h-48 bg-gradient-to-br from-brand-100 to-brand-200 dark:from-brand-900 dark:to-brand-800">
          {book.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={book.coverImageUrl}
              alt={book.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <BookOpen className="h-12 w-12 text-brand-400" />
            </div>
          )}
        </div>
        <CardContent className="p-4">
          <h3 className="font-semibold line-clamp-1">{book.title}</h3>
          {book.subtitle && (
            <p className="text-sm text-muted-foreground line-clamp-1">
              {book.subtitle}
            </p>
          )}
          <div className="mt-3">
            <Badge variant="secondary">
              {GENRE_LABELS[book.genre] || book.genre}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
