"use client";

import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import type { User } from "@/types";

export default function NotificationsSettingsPage() {
  const [emailAudits, setEmailAudits] = useState(true);
  const [weeklyReport, setWeeklyReport] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get<User>("/user")
      .then((u) => {
        setEmailAudits(u.emailPreferences?.auditCompleted ?? true);
        setWeeklyReport(u.emailPreferences?.weeklyReport ?? true);
      })
      .catch((e) => setError(e.message || "Failed to load preferences"))
      .finally(() => setLoading(false));
  }, []);

  async function update(key: "auditCompleted" | "weeklyReport", value: boolean) {
    if (key === "auditCompleted") setEmailAudits(value);
    else setWeeklyReport(value);

    setSaving(true);
    setError("");
    try {
      await api.put("/user/preferences", { [key]: value });
    } catch (e) {
      // revert on failure
      if (key === "auditCompleted") setEmailAudits(!value);
      else setWeeklyReport(!value);
      setError(e instanceof ApiError ? e.message : "Failed to save preference");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 animate-fade-in">
      <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Settings
      </Link>
      <h1 className="text-2xl font-bold">Notifications</h1>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Email preferences</CardTitle>
          {(loading || saving) && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>Audit completed</span>
            <input
              type="checkbox"
              checked={emailAudits}
              disabled={loading}
              onChange={(e) => update("auditCompleted", e.target.checked)}
              className="h-4 w-4"
            />
          </label>
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>Weekly performance report</span>
            <input
              type="checkbox"
              checked={weeklyReport}
              disabled={loading}
              onChange={(e) => update("weeklyReport", e.target.checked)}
              className="h-4 w-4"
            />
          </label>
        </CardContent>
      </Card>
    </div>
  );
}
