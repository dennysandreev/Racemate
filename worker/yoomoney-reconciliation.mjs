import { createHash } from "node:crypto";

const ALLOWED_INCOMING_TYPES = new Set(["deposit", "deposition", "incoming-transfer"]);
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export function readRequiredEnvironmentValue(env, name) {
  const value = env?.[name];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`MISSING_REQUIRED_ENV_${name}`);
  }
  return value.trim();
}

export function expectedYooMoneyNetAmountMinor(grossAmountMinor, paymentMethod) {
  const gross = Number(grossAmountMinor);
  if (!Number.isSafeInteger(gross) || gross <= 0) {
    throw new Error("INVALID_YOOMONEY_GROSS_AMOUNT");
  }
  if (paymentMethod === "yoomoney_card") {
    return Math.round((gross * 97) / 100);
  }
  if (paymentMethod === "yoomoney_wallet") {
    return Math.round((gross * 100) / 101);
  }
  throw new Error("UNSUPPORTED_YOOMONEY_PAYMENT_METHOD");
}

export function findMatchingYooMoneyOperation(order, operations) {
  if (!order?.provider_label || order.currency !== "RUB" || !Array.isArray(operations)) {
    return null;
  }
  const expectedNetAmountMinor = expectedYooMoneyNetAmountMinor(
    Number(order.amount_minor),
    order.payment_method,
  );
  const orderCreatedAt = Date.parse(order.created_at);
  if (!Number.isFinite(orderCreatedAt)) return null;

  for (const operation of operations) {
    if (!operation || typeof operation !== "object") continue;
    if (operation.label !== order.provider_label) continue;
    if (operation.status !== "success" || operation.direction !== "in") continue;
    if (!ALLOWED_INCOMING_TYPES.has(operation.type)) continue;
    const netAmountMinor = parseYooMoneyAmountMinor(operation.amount);
    if (netAmountMinor !== expectedNetAmountMinor) continue;
    const occurredAtMs = Date.parse(operation.datetime);
    if (!Number.isFinite(occurredAtMs) || occurredAtMs < orderCreatedAt - MAX_CLOCK_SKEW_MS) continue;
    const operationId = typeof operation.operation_id === "string"
      ? operation.operation_id.trim()
      : "";
    if (!/^[A-Za-z0-9._:-]{3,160}$/.test(operationId)) continue;

    return {
      netAmountMinor,
      occurredAt: new Date(occurredAtMs).toISOString(),
      operationId,
    };
  }
  return null;
}

export function makeYooMoneyReconciliationHash(input) {
  return createHash("sha256")
    .update([
      "yoomoney-wallet-api-v1",
      input.operationId,
      input.label,
      String(input.amountMinor),
      input.occurredAt,
    ].join(":"))
    .digest("hex");
}

function parseYooMoneyAmountMinor(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const normalized = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(amount) ? amount : null;
}
