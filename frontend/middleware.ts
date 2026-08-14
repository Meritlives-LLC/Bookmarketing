import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// NOTE: this used to gate on the backend's httpOnly `refreshToken` cookie
// (see git history, commit "ghost"). That doesn't work: the backend
// (NEXT_PUBLIC_API_URL, a separate origin from this frontend, and no
// next.config.js rewrite proxies it) sets that cookie host-only with no
// `domain` attribute, so it is scoped to the backend's own origin and is
// never sent on requests to this frontend's origin. request.cookies here
// can never see it, so the old hard redirect fired on every navigation to
// a protected route — including right after a successful login — and
// bounced the user straight back to /login before the page ever rendered.
//
// The client keeps the real session in localStorage (accessToken /
// refreshToken), which middleware (server-side) cannot read at all. The
// actual gating happens client-side in AuthGuard.tsx, which checks that
// localStorage token against GET /user via lib/api/client.ts. Middleware
// just passes requests through; do not reintroduce a cookie-based redirect
// here unless the cookie's `domain` is set to a parent domain shared with
// the frontend (or API calls are proxied same-origin), otherwise it will
// reproduce this exact bug.
export function middleware(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [],
};