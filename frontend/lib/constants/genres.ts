import type { BookGenre } from "@/types";

export const GENRE_LABELS: Record<BookGenre, string> = {
  ROMANCE: "Romance",
  ROMANTASY: "Romantasy",
  FANTASY: "Fantasy",
  SCI_FI: "Science Fiction",
  THRILLER: "Thriller",
  MYSTERY: "Mystery",
  YA: "Young Adult",
  LITERARY_FICTION: "Literary Fiction",
  HISTORICAL_FICTION: "Historical Fiction",
  NON_FICTION: "Non-Fiction",
  MEMOIR: "Memoir",
  SELF_HELP: "Self-Help",
  BUSINESS: "Business",
  HORROR: "Horror",
  LITRPG: "LitRPG",
  OTHER: "Other",
};

export const GENRES = Object.entries(GENRE_LABELS).map(([value, label]) => ({
  value: value as BookGenre,
  label,
}));
