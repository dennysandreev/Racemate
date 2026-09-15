import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { billingPriceCatalog } from "@/lib/billing/catalog";
import {
  billingFlags,
  getTributeConfig,
  getTrustedSiteOrigin,
  getYooMoneyConfig,
} from "@/lib/billing/config";
import { isOpenPendingCheckout } from "@/lib/billing/order-state";
import { createTributeOrder } from "@/lib/billing/providers/tribute";
import { createYooMoneyForm } from "@/lib/billing/providers/yoomoney";
import type {
  BillingOrder,
  BillingPaymentMethod,
  BillingPriceCode,
  HostedCheckout,
} from "@/lib/billing/types";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function createCheckout(input: {
  idempotencyKey: string;
  paymentMethod: BillingPaymentMethod;
  priceCode: BillingPriceCode;
  userId: string;
}): Promise<HostedCheckout> {
  if (!billingFlags.checkout) throw new Error("CHECKOUT_DISABLED");
  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("BILLING_UNAVAILABLE");
  const price = billingPriceCatalog[input.priceCode];
  const provider = input.paymentMethod === "tribute" ? "tribute" : "yoomoney";
  if (provider === "tribute" && !billingFlags.tribute)
    throw new Error("TRIBUTE_DISABLED");
  if (provider === "yoomoney" && !billingFlags.yoomoney)
    throw new Error("YOOMONEY_DISABLED");
  if (
    input.paymentMethod === "yoomoney_wallet" &&
    !billingFlags.yoomoneyWallet
  ) {
    throw new Error("YOOMONEY_WALLET_DISABLED");
  }
  if (!/^[a-f0-9-]{16,64}$/i.test(input.idempotencyKey))
    throw new Error("INVALID_IDEMPOTENCY_KEY");

  const { data: prior } = await admin
    .from("billing_orders")
    .select("*")
    .eq("user_id", input.userId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (prior) return checkoutFromOrder(mapOrder(prior));

  if (price.firstPurchaseOnly) {
    const { count } = await admin
      .from("billing_orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", input.userId)
      .eq("status", "paid");
    if ((count ?? 0) > 0) throw new Error("FIRST_YEAR_UNAVAILABLE");
  }

  const [{ data: plan }, { data: dbPrice }] = await Promise.all([
    admin
      .from("subscription_plans")
      .select("id, name")
      .eq("code", "raceside_plus")
      .eq("active", true)
      .single(),
    admin
      .from("subscription_prices")
      .select("id")
      .eq("code", price.code)
      .eq("active", true)
      .single(),
  ]);
  if (!plan || !dbPrice) throw new Error("BILLING_CATALOG_UNAVAILABLE");

  const now = new Date().toISOString();
  await admin
    .from("billing_orders")
    .update({
      failed_at: now,
      failure_reason: "CHECKOUT_EXPIRED",
      status: "failed",
      updated_at: now,
    })
    .eq("user_id", input.userId)
    .eq("status", "pending")
    .lte("expires_at", now);

  const { data: pendingOrder } = await admin
    .from("billing_orders")
    .select("*")
    .eq("user_id", input.userId)
    .eq("status", "pending")
    .gt("expires_at", now)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (pendingOrder) {
    const pending = mapOrder(pendingOrder);
    if (
      pending.priceCode === input.priceCode &&
      pending.paymentMethod === input.paymentMethod
    ) {
      if (pending.provider === "tribute" && !pending.checkoutUrl) {
        throw new Error("CHECKOUT_IN_PROGRESS");
      }
      return checkoutFromOrder(pending);
    }
    throw new Error("CHECKOUT_BUSY");
  }

  const orderNumber = `RS-${new Date().getUTCFullYear()}-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
  const providerLabel =
    provider === "yoomoney" ? `rs_${randomUUID().replaceAll("-", "")}` : null;
  const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
  const { data: order, error } = await admin
    .from("billing_orders")
    .insert({
      amount_minor: price.amountMinor,
      currency: price.currency,
      duration_months: price.durationMonths,
      expires_at: expiresAt,
      idempotency_key: input.idempotencyKey,
      order_number: orderNumber,
      payment_method: input.paymentMethod,
      plan_id: plan.id,
      plan_name_snapshot: plan.name,
      price_id: dbPrice.id,
      price_name_snapshot: price.label,
      provider,
      provider_label: providerLabel,
      user_id: input.userId,
    })
    .select("*")
    .single();
  if (error || !order) {
    if (error?.code === "23505") throw new Error("CHECKOUT_BUSY");
    throw new Error("BILLING_ORDER_CREATE_FAILED");
  }

  try {
    if (provider === "tribute") {
      const config = getTributeConfig();
      if (!config) throw new Error("TRIBUTE_UNAVAILABLE");
      const origin = getTrustedSiteOrigin();
      const remote = await createTributeOrder({
        amountMinor: price.amountMinor,
        apiKey: config.apiKey,
        customerId: opaqueCustomerId(input.userId),
        description: `${price.label}. Разовый платёж, без автопродления.`,
        failUrl: `${origin}/payment/return?order=${encodeURIComponent(orderNumber)}&status=failed`,
        successUrl: `${origin}/payment/return?order=${encodeURIComponent(orderNumber)}`,
        title: "RaceSide Plus",
      });
      await admin
        .from("billing_orders")
        .update({
          checkout_url: remote.checkoutUrl,
          provider_order_id: remote.uuid,
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id);
      return { kind: "redirect", orderNumber, url: remote.checkoutUrl };
    }

    return checkoutFromOrder(mapOrder(order));
  } catch (checkoutError) {
    await admin
      .from("billing_orders")
      .update({
        failed_at: new Date().toISOString(),
        failure_reason:
          checkoutError instanceof Error
            ? checkoutError.message
            : "CHECKOUT_FAILED",
        status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);
    throw checkoutError;
  }
}

export async function consumeBillingCheckoutRateLimit(
  userId: string,
  requestIp: string,
) {
  const admin = createSupabaseAdminClient();
  if (!admin) return false;
  const identities = [
    ["user", userId, 10],
    ["ip", requestIp, 20],
  ] as const;
  const results = await Promise.all(
    identities.map(async ([kind, value, limit]) => {
      const identityHash = createHash("sha256")
        .update(`billing:${kind}:${value}`)
        .digest("hex");
      const { data, error } = await admin.rpc("billing_consume_rate_limit", {
        p_identity_hash: identityHash,
        p_limit: limit,
        p_scope: "checkout",
        p_window_seconds: 3600,
      });
      return !error && Boolean(data?.[0]?.allowed);
    }),
  );
  return results.every(Boolean);
}

export async function getUserOrders(userId: string, limit = 20) {
  const admin = createSupabaseAdminClient();
  if (!admin) return [];
  const { data } = await admin
    .from("billing_orders")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map(mapOrder);
}

export async function canUseFirstYearPrice(userId: string) {
  const admin = createSupabaseAdminClient();
  if (!admin) return false;
  const { count } = await admin
    .from("billing_orders")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "paid");
  return (count ?? 0) === 0;
}

export async function getUserOrder(userId: string, orderNumber: string) {
  const admin = createSupabaseAdminClient();
  if (!admin) return null;
  const { data } = await admin
    .from("billing_orders")
    .select("*")
    .eq("user_id", userId)
    .eq("order_number", orderNumber)
    .maybeSingle();
  return data ? mapOrder(data) : null;
}

export async function getPendingUserOrder(userId: string) {
  const admin = createSupabaseAdminClient();
  if (!admin) return null;
  const { data } = await admin
    .from("billing_orders")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? mapOrder(data) : null;
}

export async function resumeUserCheckout(userId: string, orderNumber: string) {
  const order = await getUserOrder(userId, orderNumber);
  if (!order) throw new Error("CHECKOUT_NOT_FOUND");
  if (!isOpenPendingCheckout(order)) throw new Error("CHECKOUT_CLOSED");
  return checkoutFromOrder(order);
}

export async function cancelUserCheckout(userId: string, orderNumber: string) {
  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("BILLING_UNAVAILABLE");
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("billing_orders")
    .update({ expires_at: now, updated_at: now })
    .eq("user_id", userId)
    .eq("order_number", orderNumber)
    .eq("status", "pending")
    .gt("expires_at", now)
    .select("*")
    .maybeSingle();
  if (error) throw new Error("CHECKOUT_CANCEL_FAILED");
  if (data) return "cancelled" as const;

  const order = await getUserOrder(userId, orderNumber);
  if (order?.status === "paid") return "paid" as const;
  return "closed" as const;
}

export async function findOrderByProviderReference(
  provider: "tribute" | "yoomoney",
  reference: string,
) {
  const admin = createSupabaseAdminClient();
  if (!admin) return null;
  const column =
    provider === "tribute" ? "provider_order_id" : "provider_label";
  const { data } = await admin
    .from("billing_orders")
    .select("*")
    .eq(column, reference)
    .maybeSingle();
  return data ? mapOrder(data) : null;
}

function checkoutFromOrder(order: BillingOrder): HostedCheckout {
  if (order.provider === "tribute") {
    if (!order.checkoutUrl) throw new Error("CHECKOUT_NOT_READY");
    return {
      kind: "redirect",
      orderNumber: order.orderNumber,
      url: order.checkoutUrl,
    };
  }
  const config = getYooMoneyConfig();
  if (!config || !order.providerLabel) throw new Error("YOOMONEY_UNAVAILABLE");
  const origin = getTrustedSiteOrigin();
  const form = createYooMoneyForm({
    amountMinor: order.amountMinor,
    label: order.providerLabel,
    paymentType: order.paymentMethod === "yoomoney_wallet" ? "PC" : "AC",
    receiver: config.receiver,
    successUrl: `${origin}/payment/return?order=${encodeURIComponent(order.orderNumber)}`,
  });
  return { kind: "form", orderNumber: order.orderNumber, ...form };
}

function mapOrder(row: Record<string, unknown>): BillingOrder {
  return {
    amountMinor: Number(row.amount_minor),
    checkoutUrl: typeof row.checkout_url === "string" ? row.checkout_url : null,
    createdAt: String(row.created_at),
    currency: String(row.currency),
    durationMonths: Number(row.duration_months),
    expiresAt: String(row.expires_at),
    id: String(row.id),
    orderNumber: String(row.order_number),
    paidAt: typeof row.paid_at === "string" ? row.paid_at : null,
    paymentMethod: row.payment_method as BillingPaymentMethod,
    priceCode:
      row.price_name_snapshot === billingPriceCatalog.plus_first_year.label
        ? "plus_first_year"
        : "plus_monthly",
    provider: row.provider as "tribute" | "yoomoney",
    providerLabel:
      typeof row.provider_label === "string" ? row.provider_label : null,
    providerOrderId:
      typeof row.provider_order_id === "string" ? row.provider_order_id : null,
    status: row.status as BillingOrder["status"],
    userId: String(row.user_id),
  };
}

function opaqueCustomerId(userId: string) {
  const salt = process.env.TRIBUTE_CUSTOMER_SALT?.trim() || "raceside-tribute";
  return createHash("sha256").update(`${salt}:${userId}`).digest("hex");
}
