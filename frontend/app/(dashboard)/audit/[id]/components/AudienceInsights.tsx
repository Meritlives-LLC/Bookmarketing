import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AudienceInsight } from "@/types";
import { SEGMENT_LABELS, PLATFORM_LABELS } from "@/lib/constants/platforms";

export function AudienceInsights({ insights }: { insights: AudienceInsight[] }) {
  if (!insights.length) {
    return <p className="text-sm text-muted-foreground">No audience insights yet.</p>;
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {insights.map((ins) => (
        <Card key={ins.id}>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base">
                  {SEGMENT_LABELS[ins.segment] || ins.segment}
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  {PLATFORM_LABELS[ins.platform] || ins.platform}
                </p>
              </div>
              <Badge variant="outline">{Math.round(ins.confidence * 100)}% conf.</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-muted-foreground">{ins.summary}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
