import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { KeywordSuggestion } from "@/types";
import { PLATFORM_LABELS } from "@/lib/constants/platforms";

export function KeywordRecommendations({
  keywords,
}: {
  keywords: KeywordSuggestion[];
}) {
  if (!keywords.length) {
    return <p className="text-sm text-muted-foreground">No keywords yet.</p>;
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Amazon & platform keywords</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Keyword</TableHead>
              <TableHead>Platform</TableHead>
              <TableHead>Volume</TableHead>
              <TableHead>Bid</TableHead>
              <TableHead>Competition</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keywords.map((k) => (
              <TableRow key={k.id}>
                <TableCell className="font-medium">{k.keyword}</TableCell>
                <TableCell>{PLATFORM_LABELS[k.platform] || k.platform}</TableCell>
                <TableCell>
                  {k.searchVolume != null ? k.searchVolume.toLocaleString() : "—"}
                </TableCell>
                <TableCell>
                  {k.suggestedBid != null
                    ? `$${Number(k.suggestedBid).toFixed(2)}`
                    : "—"}
                </TableCell>
                <TableCell>
                  {k.competition ? (
                    <Badge
                      variant={
                        k.competition.toLowerCase() === "high"
                          ? "destructive"
                          : k.competition.toLowerCase() === "low"
                            ? "success"
                            : "secondary"
                      }
                    >
                      {k.competition}
                    </Badge>
                  ) : (
                    "—"
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
