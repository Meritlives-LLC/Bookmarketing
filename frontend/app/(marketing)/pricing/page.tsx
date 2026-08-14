import { Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PLANS } from "@/lib/constants/pricing";
import { cn } from "@/lib/utils";
import { PricingCta } from "./PricingCta";

export const metadata = {
  title: "Pricing",
};

export default function PricingPage() {
  return (
    <div className="px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-4xl font-bold tracking-tight">
          Simple pricing for serious authors
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Start free. Upgrade when you&apos;re ready to scale campaigns.
        </p>
      </div>
      <div className="mx-auto mt-14 grid max-w-6xl gap-6 lg:grid-cols-4">
        {PLANS.map((plan) => (
          <Card
            key={plan.id}
            className={cn(
              "relative flex flex-col",
              plan.popular && "border-primary shadow-glow ring-1 ring-primary"
            )}
          >
            {plan.popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground">
                Most popular
              </div>
            )}
            <CardHeader>
              <CardTitle className="text-lg">{plan.name}</CardTitle>
              <div className="mt-2">
                <span className="text-3xl font-bold">
                  {plan.price === 0 ? "Free" : `$${plan.price}`}
                </span>
                {plan.price > 0 && (
                  <span className="text-muted-foreground">/mo</span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{plan.description}</p>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col">
              <ul className="mb-6 flex-1 space-y-2.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    {f}
                  </li>
                ))}
              </ul>
              <PricingCta planId={plan.id} cta={plan.cta} popular={plan.popular} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
