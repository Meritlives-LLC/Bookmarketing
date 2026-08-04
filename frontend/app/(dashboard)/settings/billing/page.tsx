"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api/client";
import { useState } from "react";

export default function BillingSettingsPage() {
  const [error, setError] = useState("");

  async function openPortal() {
    try {
      const { url } = await api.post<{ url: string }>("/billing/portal");
      window.location.href = url;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not open portal");
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 animate-fade-in">
      <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Settings
      </Link>
      <h1 className="text-2xl font-bold">Billing</h1>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Subscription</CardTitle>
          <CardDescription>Manage plan, invoices, and payment methods via Stripe</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={openPortal}>Open billing portal</Button>
        </CardContent>
      </Card>
    </div>
  );
}
