import { NextResponse } from "next/server";

/**
 * Anonymous aggregate stats after a successful screenshot import (no bodies, no images, no names).
 * Enable server logs with ENABLE_SCREENSHOT_METRICS=1 (pipe logs to your warehouse / analytics).
 */
export async function POST(req: Request) {
  if (process.env.ENABLE_SCREENSHOT_METRICS !== "1") {
    return new NextResponse(null, { status: 204 });
  }

  try {
    const body = (await req.json()) as {
      messageCount?: number;
      threadTitlePresent?: boolean;
      matchSource?: string;
      tier?: string | null;
    };
    const payload = {
      event: "screenshot_import_saved",
      at: new Date().toISOString(),
      messageCount: typeof body.messageCount === "number" ? body.messageCount : null,
      threadTitlePresent: Boolean(body.threadTitlePresent),
      matchSource: typeof body.matchSource === "string" ? body.matchSource : "unknown",
      tier: body.tier ?? null,
    };
    console.info(JSON.stringify(payload));
    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 400 });
  }
}
