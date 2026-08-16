"use client";

import Link from "next/link";
import { BookOpen, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Book } from "@/types";
import { GENRE_LABELS } from "@/lib/constants/genres";

export function BookCard({
  book,
  onDelete,
  deleting,
}: {
  book: Book;
  onDelete?: (book: Book) => void;
  deleting?: boolean;
}) {
  return (
    <Card className="group relative h-full overflow-hidden transition hover:shadow-md hover:border-primary/30">
      {onDelete && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-2 top-2 z-10 h-9 w-9 bg-background/80 text-destructive opacity-100 shadow-sm backdrop-blur sm:opacity-0 sm:group-hover:opacity-100"
          title="Delete book"
          disabled={deleting}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete(book);
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}

      <Link href={`/books/${book.id}`} className="block h-full">
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
      </Link>
    </Card>
  );
}