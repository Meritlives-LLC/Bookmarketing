"use client";

import Link from "next/link";
import { Copy, Check, Sparkles } from "lucide-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Creative } from "@/types";
import { SEGMENT_LABELS, PLATFORM_LABELS } from "@/lib/constants/platforms";
import { formatRelative } from "@/lib/utils";

export function CreativeCard({ creative }: { creative: Creative }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    const text =
      typeof creative.content === "object"
        ? JSON.stringify(creative.content, null, 2)
        : String(creative.content);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-sm">
                {creative.title || creative.type.replace(/_/g, " ")}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {formatRelative(creative.createdAt)}
              </p>
            </div>
          </div>
          <Badge variant="secondary">{creative.status}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {creative.segment && (
            <Badge variant="secondary" className="text-xs">
              {SEGMENT_LABELS[creative.segment] || creative.segment}
            </Badge>
          )}
          {creative.platform && (
            <Badge variant="outline" className="text-xs">
              {PLATFORM_LABELS[creative.platform] || creative.platform}
            </Badge>
          )}
        </div>
        <pre className="mb-4 max-h-32 flex-1 overflow-auto rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
          {typeof creative.content === "object"
            ? JSON.stringify(creative.content, null, 2).slice(0, 300) + "…"
            : String(creative.content).slice(0, 300)}
        </pre>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={copy}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Link href={`/creatives/${creative.id}`}>
            <Button variant="ghost" size="sm">Open</Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
