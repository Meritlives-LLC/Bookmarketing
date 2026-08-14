"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api, ApiError } from "@/lib/api/client";
import type { User } from "@/types";

export default function ProfileSettingsPage() {
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "" });
  const [user, setUser] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api.get<User>("/user").then((u) => {
      setUser(u);
      setForm({ firstName: u.firstName, lastName: u.lastName, email: u.email });
    }).catch(() => {});
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    try {
      await api.put("/user", { firstName: form.firstName, lastName: form.lastName });
      setMsg("Saved");
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 animate-fade-in">
      <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Settings
      </Link>
      <h1 className="text-2xl font-bold">Profile</h1>

      {user && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Plan & usage</CardTitle>
            <Badge variant={user.subscription?.plan && user.subscription.plan !== "FREE" ? "success" : "secondary"}>
              {user.subscription?.plan ?? "FREE"}
            </Badge>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold">{user.credits}</p>
              <p className="text-sm text-muted-foreground">credits remaining</p>
            </div>
            <Link href="/settings/billing">
              <Button variant="outline" size="sm">Manage plan</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Personal info</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
            <div className="space-y-2">
              <Label>First name</Label>
              <Input value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Last name</Label>
              <Input value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                Email
                {user && (
                  <Badge variant={user.emailVerified ? "success" : "warning"}>
                    {user.emailVerified ? "Verified" : "Unverified"}
                  </Badge>
                )}
              </Label>
              <Input value={form.email} disabled />
            </div>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
