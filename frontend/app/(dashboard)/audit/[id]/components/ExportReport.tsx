"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Audit } from "@/types";

export function ExportReport({ audit }: { audit: Audit }) {
  function exportJson() {
    const blob = new Blob([JSON.stringify(audit, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-${audit.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button variant="outline" size="sm" className="gap-2" onClick={exportJson}>
      <Download className="h-3.5 w-3.5" /> Export report
    </Button>
  );
}
