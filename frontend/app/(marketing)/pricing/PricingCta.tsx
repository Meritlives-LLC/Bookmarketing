"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function PricingCta({
  planId,
  cta,
  popular,
}: {
  planId: "FREE" | "STARTER" | "PRO" | "AGENCY";
  cta: string;
  popular: boolean;
}) {
  // Client-only: signed-in authors land on billing to actually pick a plan,
  // signed-out visitors go through registration first.
  const [href, setHref] = useState("/register");

  useEffect(() => {
    const hasToken = typeof window !== "undefined" && !!localStorage.getItem("accessToken");
    if (hasToken) {
      setHref(planId === "FREE" ? "/dashboard" : "/settings/billing");
    }
  }, [planId]);

  return (
    <Link href={href} className="block">
      <Button className="w-full" variant={popular ? "default" : "outline"}>
        {cta}
      </Button>
    </Link>
  );
}
