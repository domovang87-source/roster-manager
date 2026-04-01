import { NextResponse } from "next/server";

/** Uptime / load-balancer probe — no auth, no DB (avoids credential coupling). */
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { ok: true, service: "stack", ts: new Date().toISOString() },
    { status: 200 }
  );
}

export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}
