import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// This is intentionally a no-op (matcher: [] below means it never runs).
//
// It previously tried to gate routes on the backend's httpOnly
// `refreshToken` cookie. That never worked at the time: NEXT_PUBLIC_API_URL
// pointed at a separate backend origin, lib/api/client.ts called it
// directly, and the backend sets that cookie host-only with no `domain`
// attribute — so the cookie was scoped to the backend's origin and never
// sent on requests to this frontend's origin. A proxy/middleware running on
// the frontend origin could never see it, so the old check fired on every
// navigation to a protected route (including right after a successful
// login) and bounced the user straight back to /login before the page ever
// rendered.
//
// As of the single-URL deploy setup, lib/api/client.ts calls the API via a
// same-origin relative path (API_BASE) that next.config.mjs rewrites
// server-side to BACKEND_INTERNAL_URL. Because the browser only ever talks
// to this frontend's origin, the backend's host-only cookie now lands on
// *this* origin too — so a cookie-based check here would actually see it.
// Auth is still handled client-side for now: AuthGuard.tsx calls GET /user
// (via lib/api/client.ts) and relies on the browser sending that same-origin
// cookie along. If you reintroduce a cookie-based redirect here, it should
// work under the current same-origin rewrite setup — but if this ever goes
// back to a split two-service deployment (separate frontend/backend URLs,
// no rewrite), this exact bug will resurface unless the cookie's `domain`
// is set to a shared parent domain instead.
export function proxy(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [],
};
