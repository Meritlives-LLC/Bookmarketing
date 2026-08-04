"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";

export default function NotificationsSettingsPage() {
  const [emailAudits, setEmailAudits] = useState(true);
  const [weeklyReport, setWeeklyReport] = useState(true);

  return (
    <div className="mx-auto max-w-lg space-y-6 animate-fade-in">
      <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Settings
      </Link>
      <h1 className="text-2xl font-bold">Notifications</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Email preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>Audit completed</span>
            <input type="checkbox" checked={emailAudits} onChange={(e) => setEmailAudits(e.target.checked)} className="h-4 w-4" />
          </label>
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>Weekly performance report</span>
            <input type="checkbox" checked={weeklyReport} onChange={(e) => setWeeklyReport(e.target.checked)} className="h-4 w-4" />
          </label>
        </CardContent>
      </Card>
    </div>
  );
}
