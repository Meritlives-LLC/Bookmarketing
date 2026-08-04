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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = protectedPrefixes.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  // Client stores JWT in localStorage; middleware cannot read it.
  // Soft gate: allow through; pages handle redirect if unauthenticated.
  // Optionally check cookie if you set httpOnly auth cookie later.
  if (isProtected) {
    return NextResponse.next();
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
  ],
};
