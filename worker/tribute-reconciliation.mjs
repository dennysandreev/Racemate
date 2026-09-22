import { createHash } from "node:crypto";

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export function findMatchingTributeTransaction(order, payload) {
  if (
    !order?.provider_order_id ||
    order.currency !== "RUB" ||
    !Array.isArray(payload?.transactions)
  ) {
    return null;
  }

  const orderCreatedAt = Date.parse(order.created_at);
  if (!Number.isFinite(orderCreatedAt)) return null;

  for (const transaction of payload.transactions) {
    if (!transaction || typeof transaction !== "object") continue;
    if (transaction.type !== "shop_order_sell" || transaction.isRefunded === true) {
      continue;
    }
    if (transaction.shopOrder?.uuid !== order.provider_order_id) continue;
    if (String(transaction.currency ?? "").toLowerCase() !== "rub") continue;

    const grossAmountMinor = positiveInteger(transaction.amount);
    const feeMinor = nonNegativeInteger(transaction.serviceFee);
    const netAmountMinor = nonNegativeInteger(transaction.total);
    if (
      grossAmountMinor !== Number(order.amount_minor) ||
      feeMinor === null ||
      netAmountMinor === null ||
      netAmountMinor !== grossAmountMinor - feeMinor
    ) {
      continue;
    }

    const transactionId = String(transaction.id ?? "").trim();
    if (!/^[A-Za-z0-9._:-]{1,160}$/.test(transactionId)) continue;

    const occurredAtMs = parseTributeTimestamp(transaction.createdAt);
    if (
      occurredAtMs === null ||
      occurredAtMs < orderCreatedAt - MAX_CLOCK_SKEW_MS
    ) {
      continue;
    }

    return {
      grossAmountMinor,
      netAmountMinor,
      occurredAt: new Date(occurredAtMs).toISOString(),
      transactionId,
    };
  }

  return null;
}

export function makeTributeReconciliationHash(input) {
  return createHash("sha256")
    .update([
      "tribute-shop-api-v1",
      input.orderId,
      input.transactionId,
      String(input.grossAmountMinor),
      String(input.netAmountMinor),
      input.occurredAt,
    ].join(":"))
    .digest("hex");
}

function parseTributeTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value < 1_000_000_000_000 ? value * 1000 : value;
    return Number.isFinite(milliseconds) ? milliseconds : null;
  }
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}
