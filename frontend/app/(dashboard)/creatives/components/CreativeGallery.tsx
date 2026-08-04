import type { Creative } from "@/types";
import { CreativeCard } from "./CreativeCard";

export function CreativeGallery({ creatives }: { creatives: Creative[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {creatives.map((c) => (
        <CreativeCard key={c.id} creative={c} />
      ))}
    </div>
  );
}
