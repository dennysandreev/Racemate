import { createHmac, timingSafeEqual } from "node:crypto";

export function makeYooMoneyCanonicalString(entries: Iterable<[string, string]>) {
  return [...entries]
    .filter(([key]) => key !== "sign")
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${rfc3986(value)}`)
    .join("&");
}

export function signYooMoneyNotification(entries: Iterable<[string, string]>, secret: string) {
  return createHmac("sha256", secret).update(makeYooMoneyCanonicalString(entries), "utf8").digest("hex");
}

export function verifyYooMoneySignature(entries: Iterable<[string, string]>, received: string, secret: string) {
  return safeHexEqual(signYooMoneyNotification(entries, secret), received);
}

export function isYooMoneyTestNotification(params: Pick<URLSearchParams, "get">) {
  return params.get("test_notification") === "true";
}

export function verifyRawBodyHmac(rawBody: string, received: string, secret: string) {
  return safeHexEqual(createHmac("sha256", secret).update(rawBody, "utf8").digest("hex"), received);
}

function rfc3986(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function safeHexEqual(expected: string, received: string) {
  if (!/^[a-f0-9]{64}$/i.test(received)) return false;
  const left = Buffer.from(expected.toLowerCase(), "hex");
  const right = Buffer.from(received.toLowerCase(), "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}
