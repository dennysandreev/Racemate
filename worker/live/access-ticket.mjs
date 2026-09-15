import { createHmac, timingSafeEqual } from "node:crypto";

export const LIVE_TICKET_AUDIENCE = "raceside-live";

export function verifyAndConsumeLiveTicket(
  ticket,
  secret,
  usedTickets,
  now = Math.floor(Date.now() / 1000),
) {
  try {
    const [payload, received, extra] = String(ticket ?? "").split(".");
    if (!payload || !received || extra) return null;
    const expected = createHmac("sha256", secret).update(payload).digest();
    const signature = Buffer.from(received, "base64url");
    if (expected.length !== signature.length || !timingSafeEqual(expected, signature)) return null;
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    for (const [jti, expiresAt] of usedTickets) {
      if (expiresAt <= now) usedTickets.delete(jti);
    }
    if (
      value.aud !== LIVE_TICKET_AUDIENCE ||
      typeof value.sub !== "string" ||
      value.sub.length < 16 ||
      typeof value.jti !== "string" ||
      value.jti.length < 16 ||
      !Number.isSafeInteger(value.iat) ||
      !Number.isSafeInteger(value.exp) ||
      value.iat > now + 5 ||
      value.exp <= now ||
      value.exp - value.iat > 120 ||
      usedTickets.has(value.jti)
    ) return null;
    usedTickets.set(value.jti, value.exp);
    return { expiresAt: value.exp, ticketId: value.jti, userId: value.sub };
  } catch {
    return null;
  }
}
