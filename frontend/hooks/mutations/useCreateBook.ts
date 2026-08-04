"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import type { Book } from "@/types";

export function useCreateBook() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createBook(body: Partial<Book>) {
    setLoading(true);
    setError(null);
    try {
      return await api.post<Book>("/books", body);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to create book";
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }

  return { createBook, loading, error };
}
