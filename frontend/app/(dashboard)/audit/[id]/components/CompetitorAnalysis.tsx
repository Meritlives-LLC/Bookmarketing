import { CheckCircle2, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CompetitorAnalysis as CompetitorType } from "@/types";

export function CompetitorAnalysis({
  competitors,
}: {
  competitors: CompetitorType[];
}) {
  if (!competitors.length) {
    return <p className="text-sm text-muted-foreground">No competitor analysis yet.</p>;
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {competitors.map((c) => (
        <Card key={c.id}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{c.competitorName}</CardTitle>
            {c.competitorAsin && (
              <p className="text-xs text-muted-foreground">ASIN: {c.competitorAsin}</p>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {c.strengths?.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-600">
                  Strengths
                </p>
                <ul className="space-y-1">
                  {c.strengths.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {c.weaknesses?.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-amber-600">
                  Weaknesses
                </p>
                <ul className="space-y-1">
                  {c.weaknesses.map((w, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
