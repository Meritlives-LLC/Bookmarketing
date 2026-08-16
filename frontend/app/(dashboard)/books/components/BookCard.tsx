"use client";

import Link from "next/link";
import { Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookCoverImage } from "@/components/books/BookCoverImage";
import type { Book } from "@/types";
import { GENRE_LABELS } from "@/lib/constants/genres";

export function BookCard({
  book,
  onDelete,
  deleting,
  priority = false,
}: {
  book: Book;
  onDelete?: (book: Book) => void;
  deleting?: boolean;
  /** Set true for the first few cards so LCP cover loads eagerly. */
  priority?: boolean;
}) {
  return (
    <Card className="group relative flex h-full flex-col overflow-hidden transition hover:shadow-md hover:border-primary/30">
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

      <Link href={`/books/${book.id}`} className="flex h-full flex-col">
        <div className="relative w-full shrink-0 overflow-hidden">
          <BookCoverImage
            src={book.coverImageUrl}
            alt={book.title}
            variant="card"
            priority={priority}
            className="transition duration-300 group-hover:scale-[1.02]"
          />
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-10 bg-gradient-to-t from-card/80 to-transparent"
            aria-hidden
          />
        </div>

        <CardContent className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
          <h3 className="font-semibold leading-snug line-clamp-2">{book.title}</h3>
          {book.subtitle && (
            <p className="text-sm text-muted-foreground line-clamp-1">
              {book.subtitle}
            </p>
          )}
          <div className="mt-auto pt-1">
            <Badge variant="secondary" className="text-xs">
              {GENRE_LABELS[book.genre] || book.genre}
            </Badge>
          </div>
        </CardContent>
      </Link>
    </Card>
  );
}
