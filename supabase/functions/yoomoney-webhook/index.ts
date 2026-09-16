import {
  isYooMoneyTestNotification,
  parseYooMoneyNotification,
  sha256Hex,
  verifyYooMoneySignature,
  type YooMoneyNotification,
} from "./logic.ts";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const MAX_BODY_BYTES = 64 * 1024;

Deno.serve(async (request) => {
  if (request.method !== "POST") return text("method not allowed", 405);
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim();
  if (contentType !== "application/x-www-form-urlencoded") {
    return text("unsupported content type", 415);
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return text("payload too large", 413);
  }

  const notificationSecret = requiredEnvironmentValue("YOOMONEY_NOTIFICATION_SECRET");
  const params = new URLSearchParams(rawBody);
  const signatureValid = await verifyYooMoneySignature(
    params.entries(),
    params.get("sign") ?? "",
    notificationSecret,
  );
  const payloadHash = await sha256Hex(rawBody);
  if (!signatureValid) {
    console.warn(JSON.stringify({
      event: "billing.yoomoney_webhook.rejected",
      payloadHash,
      reason: "invalid_signature",
    }));
    return text("invalid signature", 403);
  }
  if (isYooMoneyTestNotification(params)) return text("OK", 200);

  let event: YooMoneyNotification | null = null;
  try {
    event = parseYooMoneyNotification(params);
    const order = await findOrder(event.label);
    if (!order) throw new Error("BILLING_ORDER_NOT_FOUND");
    const result = await callSupabase("/rest/v1/rpc/billing_apply_payment", {
      body: JSON.stringify({
        p_currency: event.currency,
        p_gross_amount_minor: event.grossAmountMinor,
        p_net_amount_minor: event.netAmountMinor,
        p_occurred_at: event.occurredAt,
        p_order_id: order.id,
        p_payload_hash: payloadHash,
        p_payment_method: event.paymentMethod,
        p_provider: "yoomoney",
        p_provider_event_id: event.eventId,
        p_provider_event_type: event.eventType,
        p_provider_reference: event.label,
        p_provider_transaction_id: event.transactionId,
        p_safe_payload: { notificationType: event.eventType, source: "edge_webhook" },
      }),
      method: "POST",
    });
    if (!result.ok) throw new Error(`BILLING_APPLY_PAYMENT_${result.status}`);
    return text("OK", 200);
  } catch (error) {
    const reason = safeError(error);
    await recordFailedEvent(event, payloadHash, reason);
    console.error(JSON.stringify({
      event: "billing.yoomoney_webhook.failed",
      payloadHash,
      reason,
    }));
    return text("processing failed", 422);
  }
});

async function findOrder(label: string) {
  const query = new URLSearchParams({
    limit: "1",
    provider: "eq.yoomoney",
    provider_label: `eq.${label}`,
    select: "id",
  });
  const response = await callSupabase(`/rest/v1/billing_orders?${query}`);
  if (!response.ok) throw new Error(`BILLING_ORDER_LOOKUP_${response.status}`);
  const rows = await response.json();
  return Array.isArray(rows) && typeof rows[0]?.id === "string" ? rows[0] : null;
}

async function recordFailedEvent(
  event: YooMoneyNotification | null,
  payloadHash: string,
  reason: string,
) {
  try {
    await callSupabase(
      "/rest/v1/billing_notification_events?on_conflict=provider,provider_event_id",
      {
        body: JSON.stringify({
          last_error: reason,
          payload_hash: payloadHash,
          provider: "yoomoney",
          provider_event_id: event?.eventId ?? `failed:${payloadHash}`,
          provider_event_type: event?.eventType ?? "unknown",
          provider_reference: event?.label ?? null,
          safe_payload: event
            ? {
                currency: event.currency,
                grossAmountMinor: event.grossAmountMinor,
                netAmountMinor: event.netAmountMinor,
                occurredAt: event.occurredAt,
                paymentMethod: event.paymentMethod,
                transactionId: event.transactionId,
                source: "edge_webhook",
              }
            : { source: "edge_webhook" },
          signature_valid: true,
          status: "failed",
        }),
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        method: "POST",
      },
    );
  } catch {
    // The original signed notification failure remains the primary error.
  }
}

async function callSupabase(path: string, init: RequestInit = {}) {
  const supabaseUrl = requiredEnvironmentValue("SUPABASE_URL").replace(/\/$/, "");
  const serviceRoleKey = requiredEnvironmentValue("SUPABASE_SERVICE_ROLE_KEY");
  return fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(10_000),
  });
}

function requiredEnvironmentValue(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`MISSING_REQUIRED_ENV_${name}`);
  return value;
}

function safeError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 160) : "unknown";
}

function text(body: string, status: number) {
  return new Response(body, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    },
    status,
  });
}
