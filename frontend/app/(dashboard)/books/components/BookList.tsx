import type { Book } from "@/types";
import { BookCard } from "./BookCard";

/** First N covers load with priority to improve LCP. */
const PRIORITY_COUNT = 4;

export function BookList({
  books,
  onDelete,
  deletingId,
}: {
  books: Book[];
  onDelete?: (book: Book) => void;
  deletingId?: string | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {books.map((book, index) => (
        <BookCard
          key={book.id}
          book={book}
          onDelete={onDelete}
          deleting={deletingId === book.id}
          priority={index < PRIORITY_COUNT}
        />
      ))}
    </div>
  );
}
