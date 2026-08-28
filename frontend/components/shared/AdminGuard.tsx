"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";

/**
 * Sits inside AuthGuard (via the (dashboard) layout) and additionally
 * requires the signed-in user to have an admin role. Non-admins are
 * bounced to the regular dashboard rather than seeing a 403 page.
 */
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";

  useEffect(() => {
    if (loading) return;
    if (!isAdmin) router.replace("/dashboard");
  }, [loading, isAdmin, router]);

  if (loading || !isAdmin) {
    return <LoadingSpinner className="min-h-[60vh]" />;
  }

  return <>{children}</>;
}
