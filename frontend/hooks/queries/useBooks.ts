"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import type { Book } from "@/types";

export function useBooks() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Book[]>("/books")
      .then(setBooks)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return { books, loading, error, setBooks };
}
