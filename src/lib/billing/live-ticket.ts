import "server-only";

import { createHmac, randomUUID } from "node:crypto";

export function createLiveTicket(userId: string) {
  const secret = process.env.LIVE_ACCESS_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error("LIVE_ACCESS_SECRET_INVALID");
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ aud: "raceside-live", exp: issuedAt + 90, iat: issuedAt, jti: randomUUID(), sub: userId })).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}
