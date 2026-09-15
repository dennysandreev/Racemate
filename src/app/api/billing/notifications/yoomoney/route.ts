import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { getYooMoneyConfig } from "@/lib/billing/config";
import { parseYooMoneyNotification, verifyYooMoneyNotification } from "@/lib/billing/providers/yoomoney";
import { findOrderByProviderReference } from "@/lib/billing/repository";
import { isYooMoneyTestNotification } from "@/lib/billing/signatures";
import { invalidateSubscriptionAccess } from "@/lib/billing/access";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const type = request.headers.get("content-type")?.split(";", 1)[0]?.trim();
  if (type !== "application/x-www-form-urlencoded") return response("unsupported content type", 415);
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > 64 * 1024) return response("payload too large", 413);
  const config = getYooMoneyConfig();
  if (!config) return response("billing unavailable", 503);
  const params = new URLSearchParams(rawBody);
  const signature = params.get("sign") ?? "";
  if (!verifyYooMoneyNotification(params.entries(), signature, config.notificationSecret)) {
    await recordRejected("yoomoney", digest(rawBody), "invalid_signature");
    return response("invalid signature", 403);
  }
  if (isYooMoneyTestNotification(params)) return response("OK", 200);

  let parsedEvent: ReturnType<typeof parseYooMoneyNotification> | null = null;
  try {
    const event = parseYooMoneyNotification(params);
    parsedEvent = event;
    const order = await findOrderByProviderReference("yoomoney", event.label);
    if (!order) throw new Error("BILLING_ORDER_NOT_FOUND");
    const admin = createSupabaseAdminClient();
    if (!admin) return response("billing unavailable", 503);
    const { error } = await admin.rpc("billing_apply_payment", {
      p_currency: event.currency,
      p_gross_amount_minor: event.grossAmountMinor,
      p_net_amount_minor: event.netAmountMinor,
      p_occurred_at: event.occurredAt,
      p_order_id: order.id,
      p_payload_hash: digest(rawBody),
      p_payment_method: event.paymentMethod,
      p_provider: "yoomoney",
      p_provider_event_id: event.eventId,
      p_provider_event_type: event.eventType,
      p_provider_reference: event.label,
      p_provider_transaction_id: event.transactionId,
      p_safe_payload: { notificationType: event.eventType },
    });
    if (error) throw error;
    invalidateSubscriptionAccess(order.userId);
    return response("OK", 200);
  } catch (error) {
    await recordFailedYooMoneyEvent(parsedEvent, digest(rawBody), safeError(error));
    console.error("billing_yoomoney_webhook_failed", safeError(error));
    return response("processing failed", 422);
  }
}

async function recordFailedYooMoneyEvent(
  event: ReturnType<typeof parseYooMoneyNotification> | null,
  payloadHash: string,
  reason: string,
) {
  const admin = createSupabaseAdminClient();
  if (!admin) return;
  await admin.from("billing_notification_events").upsert({
    last_error: reason,
    payload_hash: payloadHash,
    provider: "yoomoney",
    provider_event_id: event?.eventId ?? `failed:${payloadHash}`,
    provider_event_type: event?.eventType ?? "unknown",
    provider_reference: event?.label ?? null,
    safe_payload: event ? {
      currency: event.currency,
      grossAmountMinor: event.grossAmountMinor,
      netAmountMinor: event.netAmountMinor,
      occurredAt: event.occurredAt,
      paymentMethod: event.paymentMethod,
      transactionId: event.transactionId,
    } : {},
    signature_valid: true,
    status: "failed",
  }, { onConflict: "provider,provider_event_id" });
}

function response(body: string, status: number) {
  return new NextResponse(body, { status, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function recordRejected(provider: "tribute" | "yoomoney", payloadHash: string, reason: string) {
  const admin = createSupabaseAdminClient();
  if (!admin) return;
  await admin.from("billing_notification_events").upsert({
    last_error: reason,
    payload_hash: payloadHash,
    provider,
    provider_event_id: `rejected:${payloadHash}`,
    provider_event_type: "unknown",
    safe_payload: {},
    signature_valid: false,
    status: "rejected",
  }, { onConflict: "provider,provider_event_id" });
}

function safeError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 160) : "unknown";
}
