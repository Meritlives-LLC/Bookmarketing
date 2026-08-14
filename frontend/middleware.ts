import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const protectedPrefixes = [
  "/dashboard",
  "/books",
  "/audit",
  "/creatives",
  "/calendar",
  "/analytics",
  "/settings",
];

const authPrefixes = ["/login", "/register"];

// The backend sets an httpOnly `refreshToken` cookie on login/register
// (see backend/src/controllers/user.controller.ts, COOKIE_OPTIONS — 7 day
// maxAge). Middleware runs on the server, so — unlike the JWT the client
// keeps in localStorage for the Authorization header — this cookie IS
// visible here via `request.cookies`. We gate on it rather than the
// short-lived `accessToken` cookie (15 min) so a plain page reload doesn't
// bounce someone who's still within their session; actual token validity
// and silent refresh are handled by the API client (see lib/api/client.ts).
function hasSession(request: NextRequest): boolean {
  return Boolean(request.cookies.get("refreshToken")?.value);
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isProtected = protectedPrefixes.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
  const isAuthPage = authPrefixes.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
  const authed = hasSession(request);

  if (isProtected && !authed) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname + search);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthPage && authed) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/books/:path*",
    "/audit/:path*",
    "/creatives/:path*",
    "/calendar/:path*",
    "/analytics/:path*",
    "/settings/:path*",
    "/login",
    "/register",
  ],
};
