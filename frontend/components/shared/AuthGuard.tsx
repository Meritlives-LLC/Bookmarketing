"use client";

import { Suspense, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";

/**
 * The only auth gate in the app — `proxy.ts` (Next's middleware
 * convention) is a deliberate no-op; see the comment there for why. This
 * component calls `useAuth`, which hits `GET /user` relying on the
 * browser's session cookie. If that comes back unauthenticated (no
 * session, expired session, cookies blocked, etc.) we redirect here
 * instead of ever rendering `children` and having a page's own fetch fail
 * with a raw "Authentication token missing" error card.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  return (
    // useSearchParams() needs a Suspense boundary around it (Next.js app
    // router requirement) so this route can still be statically analyzed.
    <Suspense fallback={<LoadingSpinner className="min-h-screen" />}>
      <AuthGuardInner>{children}</AuthGuardInner>
    </Suspense>
  );
}

function AuthGuardInner({ children }: { children: React.ReactNode }) {
  const { loading, isAuthenticated } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (loading || isAuthenticated) return;
    const redirect = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
    router.replace(`/login?redirect=${encodeURIComponent(redirect)}`);
  }, [loading, isAuthenticated, pathname, searchParams, router]);

  if (loading || !isAuthenticated) {
    return <LoadingSpinner className="min-h-screen" />;
  }

  return <>{children}</>;
}
