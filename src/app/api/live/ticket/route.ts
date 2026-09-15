import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { getSubscriptionAccess } from "@/lib/billing/access";
import { createLiveTicket } from "@/lib/billing/live-ticket";
import { billingFlags } from "@/lib/billing/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user && billingFlags.entitlementsEnforced) return NextResponse.json({ error: "Требуется вход." }, { status: 401 });
  const access = await getSubscriptionAccess(user?.id ?? null);
  if (!access.entitlements.live) return NextResponse.json({ error: "Требуется подписка Plus." }, { status: 403 });
  try {
    if (!billingFlags.entitlementsEnforced) return NextResponse.json({ ticket: "access-not-enforced" }, { headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ ticket: createLiveTicket(user?.id ?? "00000000-0000-4000-8000-000000000000") }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "LIVE временно недоступен." }, { status: 503 });
  }
}
