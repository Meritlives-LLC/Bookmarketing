import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// This is intentionally a no-op (matcher: [] below means it never runs).
//
// It previously tried to gate routes on the backend's httpOnly
// `refreshToken` cookie. That never worked: the backend
// (NEXT_PUBLIC_API_URL) is a separate origin from this frontend, with no
// next.config.js rewrite proxying it, and it sets that cookie host-only
// with no `domain` attribute — so the cookie is scoped to the backend's
// origin and is never sent on requests to this frontend's origin. A
// proxy/middleware running on the frontend origin can never see it, so the
// old check fired on every navigation to a protected route (including
// right after a successful login) and bounced the user straight back to
// /login before the page ever rendered.
//
// Auth is instead handled entirely client-side: AuthGuard.tsx calls
// GET /user (via lib/api/client.ts), which relies on the browser sending
// the backend's session cookie directly to the backend's own origin.
// Do not reintroduce a cookie-based redirect here unless the cookie's
// `domain` is set to a parent domain shared with the frontend (or API
// calls are proxied same-origin) — otherwise it will reproduce this exact
// bug.
export function middleware(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [],
};
