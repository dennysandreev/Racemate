const DECIMAL_AMOUNT = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/;

export type YooMoneyNotification = {
  currency: "RUB";
  eventId: string;
  eventType: "card-incoming" | "p2p-incoming";
  grossAmountMinor: number;
  label: string;
  netAmountMinor: number;
  occurredAt: string;
  paymentMethod: "yoomoney_card" | "yoomoney_wallet";
  transactionId: string;
};

export function makeYooMoneyCanonicalString(entries: Iterable<[string, string]>) {
  return [...entries]
    .filter(([key]) => key !== "sign")
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${rfc3986(value)}`)
    .join("&");
}

export async function signYooMoneyNotification(
  entries: Iterable<[string, string]>,
  secret: string,
) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(makeYooMoneyCanonicalString(entries)),
  );
  return bytesToHex(new Uint8Array(signature));
}

export async function verifyYooMoneySignature(
  entries: Iterable<[string, string]>,
  received: string,
  secret: string,
) {
  if (!/^[a-f0-9]{64}$/i.test(received)) return false;
  const expected = await signYooMoneyNotification(entries, secret);
  return constantTimeHexEqual(expected, received);
}

export function isYooMoneyTestNotification(params: Pick<URLSearchParams, "get">) {
  return params.get("test_notification") === "true";
}

export function parseYooMoneyNotification(params: URLSearchParams): YooMoneyNotification {
  const notificationType = required(params, "notification_type");
  if (notificationType !== "card-incoming" && notificationType !== "p2p-incoming") {
    throw new Error("UNSUPPORTED_NOTIFICATION_TYPE");
  }
  if (required(params, "currency") !== "643") throw new Error("UNSUPPORTED_CURRENCY");
  if (required(params, "unaccepted") !== "false") throw new Error("PAYMENT_UNACCEPTED");
  if (required(params, "codepro") !== "false") throw new Error("PAYMENT_CODEPRO");

  const operationId = required(params, "operation_id");
  if (!/^[A-Za-z0-9._:-]{3,160}$/.test(operationId)) {
    throw new Error("INVALID_OPERATION_ID");
  }
  const label = required(params, "label");
  if (!/^rs_[A-Za-z0-9_-]{12,60}$/.test(label)) throw new Error("INVALID_PAYMENT_LABEL");
  const occurredAt = new Date(required(params, "datetime"));
  if (Number.isNaN(occurredAt.getTime())) throw new Error("INVALID_PAYMENT_DATE");

  return {
    currency: "RUB",
    eventId: operationId,
    eventType: notificationType,
    grossAmountMinor: parseMinorUnits(required(params, "withdraw_amount")),
    label,
    netAmountMinor: parseMinorUnits(required(params, "amount")),
    occurredAt: occurredAt.toISOString(),
    paymentMethod: notificationType === "card-incoming"
      ? "yoomoney_card"
      : "yoomoney_wallet",
    transactionId: operationId,
  };
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

function parseMinorUnits(value: string) {
  const match = DECIMAL_AMOUNT.exec(value);
  if (!match) throw new Error("INVALID_MONEY_FORMAT");
  const [whole] = value.split(".");
  const fraction = (match[2] ?? "").padEnd(2, "0");
  const amount = Number(whole) * 100 + Number(fraction || 0);
  if (!Number.isSafeInteger(amount)) throw new Error("MONEY_OUT_OF_RANGE");
  return amount;
}

function required(params: URLSearchParams, key: string) {
  const value = params.get(key);
  if (value === null || value === "") throw new Error(`MISSING_${key.toUpperCase()}`);
  return value;
}

function rfc3986(value: string) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function constantTimeHexEqual(expected: string, received: string) {
  const left = expected.toLowerCase();
  const right = received.toLowerCase();
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
