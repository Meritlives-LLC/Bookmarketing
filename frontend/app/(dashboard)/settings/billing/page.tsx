"use client";

import Link from "next/link";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Check, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api, ApiError } from "@/lib/api/client";
import { PLANS } from "@/lib/constants/pricing";
import type { User, BillingEvent } from "@/types";
import { formatDate, cn } from "@/lib/utils";

function BillingContent() {
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [history, setHistory] = useState<BillingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoadingPlan, setCheckoutLoadingPlan] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState("");

  const notice =
    searchParams.get("success") === "true"
      ? "Subscription updated. It may take a few seconds to reflect below."
      : searchParams.get("canceled") === "true"
        ? "Checkout canceled — no changes were made."
        : "";

  useEffect(() => {
    Promise.all([
      api.get<User>("/user"),
      api.get<BillingEvent[]>("/billing/history").catch(() => [] as BillingEvent[]),
    ])
      .then(([u, h]) => {
        setUser(u);
        setHistory(h);
      })
      .catch((e) => setError(e.message || "Failed to load billing info"))
      .finally(() => setLoading(false));
  }, []);

  const currentPlan = user?.subscription?.plan ?? "FREE";

  async function upgrade(priceId: string, planId: string) {
    if (!priceId) {
      setError("Billing isn't configured for this plan yet. Contact support to upgrade.");
      return;
    }
    setError("");
    setCheckoutLoadingPlan(planId);
    try {
      const { url } = await api.post<{ url: string }>("/billing/checkout", { priceId });
      window.location.href = url;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not start checkout");
      setCheckoutLoadingPlan(null);
    }
  }

  async function openPortal() {
    setError("");
    setPortalLoading(true);
    try {
      const { url } = await api.post<{ url: string }>("/billing/portal");
      window.location.href = url;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not open portal");
      setPortalLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-fade-in">
      <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Settings
      </Link>
      <h1 className="text-2xl font-bold">Billing</h1>

      {notice && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Current plan</CardTitle>
            <CardDescription>
              {user?.credits ?? 0} credits remaining
              {user?.subscription?.currentPeriodEnd &&
                ` · Renews ${formatDate(user.subscription.currentPeriodEnd)}`}
              {user?.subscription?.cancelAtPeriodEnd && " · Cancels at period end"}
            </CardDescription>
          </div>
          <Badge variant={currentPlan === "FREE" ? "secondary" : "success"}>{currentPlan}</Badge>
        </CardHeader>
        {currentPlan !== "FREE" && (
          <CardContent>
            <Button variant="outline" onClick={openPortal} disabled={portalLoading} className="gap-2">
              {portalLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
              Manage subscription & invoices
            </Button>
          </CardContent>
        )}
      </Card>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Change plan</h2>
        {PLANS.filter((p) => p.id !== "FREE").map((plan) => {
          const isCurrent = plan.id === currentPlan;
          return (
            <Card key={plan.id} className={cn(isCurrent && "border-primary/40 bg-primary/5")}>
              <CardContent className="flex items-center justify-between gap-4 p-5">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{plan.name}</p>
                    {isCurrent && <Badge variant="success">Current</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">${plan.price}/mo · {plan.description}</p>
                </div>
                <Button
                  variant={isCurrent ? "outline" : "default"}
                  disabled={isCurrent || checkoutLoadingPlan === plan.id}
                  onClick={() => upgrade(plan.priceId, plan.id)}
                  className="shrink-0 gap-2"
                >
                  {checkoutLoadingPlan === plan.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isCurrent ? (
                    <Check className="h-4 w-4" />
                  ) : null}
                  {isCurrent ? "Active" : "Switch"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Billing history</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No billing events yet.</p>
          ) : (
            <div className="space-y-2">
              {history.map((h) => (
                <div key={h.id} className="flex items-center justify-between border-b py-2.5 text-sm last:border-0">
                  <div>
                    <p className="font-medium">{h.type.replace(/_/g, " ")}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(h.createdAt)}</p>
                  </div>
                  {h.amount != null && (
                    <p className="font-medium">
                      {(h.amount / 100).toFixed(2)} {h.currency?.toUpperCase() ?? ""}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function BillingSettingsPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <BillingContent />
    </Suspense>
  );
}
