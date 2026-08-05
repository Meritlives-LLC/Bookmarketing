import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1";
  try {
    const base = apiUrl.replace(/\/api\/v1$/, "");
    const res = await fetch(`${base}/api/health`, { next: { revalidate: 0 } });
    const data = await res.json();
    return NextResponse.json({ frontend: "ok", backend: data });
  } catch {
    return NextResponse.json(
      { frontend: "ok", backend: "unreachable" },
      { status: 503 }
    );
  }
}
