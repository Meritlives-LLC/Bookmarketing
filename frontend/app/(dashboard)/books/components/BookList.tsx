import type { Book } from "@/types";
import { BookCard } from "./BookCard";

export function BookList({ books }: { books: Book[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {books.map((book) => (
        <BookCard key={book.id} book={book} />
      ))}
    </div>
  );
}
