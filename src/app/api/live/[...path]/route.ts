import { NextResponse } from "next/server";
import { consumeIpRateLimit, getRetryAfterSeconds } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/auth";
import { getSubscriptionAccess } from "@/lib/billing/access";
import { billingFlags } from "@/lib/billing/config";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const target = path.join("/");
  if (!/^(snapshot|health|history|radio\/[a-f0-9]{64}\/audio)$/.test(target))
    return NextResponse.json({ error: "Не найдено." }, { status: 404 });
  if (billingFlags.entitlementsEnforced) {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Войдите, чтобы открыть RaceSide LIVE.", code: "SUBSCRIPTION_REQUIRED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    const access = await getSubscriptionAccess(user.id);
    if (!access.entitlements.live) return NextResponse.json({ error: "RaceSide LIVE доступен по подписке Plus.", code: "SUBSCRIPTION_REQUIRED" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const limit = await consumeIpRateLimit("api:live", request, 120, 60000);
  if (!limit.ok)
    return NextResponse.json(
      { error: "Слишком много запросов." },
      {
        status: 429,
        headers: { "Retry-After": getRetryAfterSeconds(limit.resetAt) },
      },
    );
  try {
    const base = process.env.LIVE_INTERNAL_ORIGIN ?? "http://127.0.0.1:3002";
    const query = new URL(request.url).search;
    const response = await fetch(`${base}/${target}${query}`, {
      cache: "no-store",
      signal: AbortSignal.any([
        request.signal,
        AbortSignal.timeout(target.endsWith("/audio") ? 30000 : 5000),
      ]),
    });
    return new Response(response.body, {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("Content-Type") ?? "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Восстанавливаем связь с LIVE." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
