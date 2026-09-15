import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { getTributeConfig } from "@/lib/billing/config";
import { parseTributeWebhook, verifyTributeWebhook } from "@/lib/billing/providers/tribute";
import { findOrderByProviderReference } from "@/lib/billing/repository";
import { invalidateSubscriptionAccess } from "@/lib/billing/access";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const type = request.headers.get("content-type")?.split(";", 1)[0]?.trim();
  if (type !== "application/json") return reply("unsupported content type", 415);
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > 64 * 1024) return reply("payload too large", 413);
  const config = getTributeConfig();
  if (!config) return reply("billing unavailable", 503);
  const signature = request.headers.get("trbt-signature") ?? "";
  if (!verifyTributeWebhook(rawBody, signature, config.apiKey)) {
    await recordRejected(digest(rawBody));
    return reply("invalid signature", 403);
  }

  let parsedEvent: ReturnType<typeof parseTributeWebhook> | null = null;
  try {
    const event = parseTributeWebhook(rawBody);
    parsedEvent = event;
    if (event.kind === "ignored") return reply("OK", 200);
    const order = await findOrderByProviderReference("tribute", event.orderId);
    if (!order) throw new Error("BILLING_ORDER_NOT_FOUND");
    const eventAmount = event.kind === "paid" ? event.grossAmountMinor : event.amountMinor;
    if (eventAmount !== order.amountMinor) throw new Error("BILLING_AMOUNT_MISMATCH");
    const admin = createSupabaseAdminClient();
    if (!admin) return reply("billing unavailable", 503);
    if (event.kind === "refunded") {
      const { error } = await admin.rpc("billing_apply_refund", {
        p_order_id: order.id,
        p_amount_minor: event.amountMinor,
        p_payload_hash: digest(rawBody),
        p_provider: "tribute",
        p_provider_event_id: event.eventId,
        p_provider_event_type: event.eventType,
      });
      if (error) throw error;
      invalidateSubscriptionAccess(order.userId);
      return reply("OK", 200);
    }
    if (event.kind === "failed") {
      const { error } = await admin.from("billing_orders").update({
        failed_at: new Date().toISOString(),
        failure_reason: "PROVIDER_PAYMENT_FAILED",
        status: "failed",
        updated_at: new Date().toISOString(),
      }).eq("id", order.id);
      if (error) throw error;
      await admin.from("billing_notification_events").upsert({
        payload_hash: digest(rawBody),
        provider: "tribute",
        provider_event_id: `shop_order_payment_failed:${order.providerOrderId}`,
        provider_event_type: "shop_order_payment_failed",
        provider_reference: order.providerOrderId,
        safe_payload: {},
        signature_valid: true,
        status: "processed",
        processed_at: new Date().toISOString(),
      }, { onConflict: "provider,provider_event_id" });
      return reply("OK", 200);
    }
    const { error } = await admin.rpc("billing_apply_payment", {
      p_currency: event.currency,
      p_gross_amount_minor: event.grossAmountMinor,
      p_net_amount_minor: event.netAmountMinor,
      p_occurred_at: event.occurredAt,
      p_order_id: order.id,
      p_payload_hash: digest(rawBody),
      p_payment_method: event.paymentMethod,
      p_provider: "tribute",
      p_provider_event_id: event.eventId,
      p_provider_event_type: event.eventType,
      p_provider_reference: event.orderId,
      p_provider_transaction_id: event.transactionId,
      p_safe_payload: { eventType: event.eventType },
    });
    if (error) throw error;
    invalidateSubscriptionAccess(order.userId);
    return reply("OK", 200);
  } catch (error) {
    await recordFailedTributeEvent(parsedEvent, digest(rawBody), safeError(error));
    console.error("billing_tribute_webhook_failed", safeError(error));
    return reply("processing failed", 422);
  }
}

async function recordFailedTributeEvent(
  event: ReturnType<typeof parseTributeWebhook> | null,
  payloadHash: string,
  reason: string,
) {
  const admin = createSupabaseAdminClient();
  if (!admin) return;
  const eventId = event && "eventId" in event ? event.eventId : `failed:${payloadHash}`;
  await admin.from("billing_notification_events").upsert({
    last_error: reason,
    payload_hash: payloadHash,
    provider: "tribute",
    provider_event_id: eventId,
    provider_event_type: event?.eventType ?? "unknown",
    provider_reference: event?.orderId ?? null,
    safe_payload: event && event.kind === "paid" ? {
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

function reply(body: string, status: number) {
  return new NextResponse(body, { status, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function recordRejected(payloadHash: string) {
  const admin = createSupabaseAdminClient();
  if (!admin) return;
  await admin.from("billing_notification_events").upsert({
    last_error: "invalid_signature",
    payload_hash: payloadHash,
    provider: "tribute",
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
