"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";

export function PricingCta({
  planId,
  cta,
  popular,
}: {
  planId: "FREE" | "STARTER" | "PRO" | "AGENCY";
  cta: string;
  popular: boolean;
}) {
  const [href, setHref] = useState("/register");

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      try {
        await api.get("/user");

        if (mounted) {
          setHref(
            planId === "FREE"
              ? "/dashboard"
              : "/settings/billing"
          );
        }
      } catch {
        if (mounted) {
          setHref("/register");
        }
      }
    }

    checkSession();

    return () => {
      mounted = false;
    };
  }, [planId]);

  return (
    <Link href={href} className="block">
      <Button
        className="w-full"
        variant={popular ? "default" : "outline"}
      >
        {cta}
      </Button>
    </Link>
  );
}