"use client";

import { GENRES } from "@/lib/constants/genres";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

interface BookFiltersProps {
  search: string;
  genre: string;
  onSearchChange: (v: string) => void;
  onGenreChange: (v: string) => void;
}

export function BookFilters({
  search,
  genre,
  onSearchChange,
  onGenreChange,
}: BookFiltersProps) {
  return (
    <div className="flex flex-wrap gap-3">
      <Input
        placeholder="Search books…"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="max-w-xs"
      />
      <Select value={genre} onChange={(e) => onGenreChange(e.target.value)}>
        <option value="">All genres</option>
        {GENRES.map((g) => (
          <option key={g.value} value={g.value}>
            {g.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
