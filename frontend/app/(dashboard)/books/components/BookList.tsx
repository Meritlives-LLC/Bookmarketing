import type { Book } from "@/types";
import { BookCard } from "./BookCard";

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
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {books.map((book) => (
        <BookCard
          key={book.id}
          book={book}
          onDelete={onDelete}
          deleting={deletingId === book.id}
        />
      ))}
    </div>
  );
}