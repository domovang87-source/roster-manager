import { updateSession } from "./lib/supabase/middleware";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Exclude Stripe + Bearer-token webhooks/cron so POSTs are not redirected to /login
    "/((?!_next/static|_next/image|favicon.ico|api/stripe-webhook|api/incoming-message|api/approve-all|api/cron/|api/health).*)",
  ],
};
