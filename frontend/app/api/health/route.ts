import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const apiUrl = process.env.BACKEND_INTERNAL_URL || "http://localhost:4000";
  try {
    const res = await fetch(`${apiUrl}/api/health`, { next: { revalidate: 0 } });
    const data = await res.json();
    return NextResponse.json({ frontend: "ok", backend: data });
  } catch {
    return NextResponse.json(
      { frontend: "ok", backend: "unreachable" },
      { status: 503 }
    );
  }
}
