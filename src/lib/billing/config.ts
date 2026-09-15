import "server-only";

import { getSiteUrl } from "@/lib/env";

function enabled(value: string | undefined, fallback = false) {
  if (value === undefined) return fallback;
  return value === "1" || value.toLowerCase() === "true";
}

export const billingFlags = {
  ads: enabled(process.env.BILLING_ADS_ENABLED),
  checkout: enabled(process.env.BILLING_CHECKOUT_ENABLED),
  entitlementsEnforced: enabled(process.env.BILLING_ENTITLEMENTS_ENFORCED),
  tribute: enabled(process.env.BILLING_TRIBUTE_ENABLED),
  yoomoney: enabled(process.env.BILLING_YOOMONEY_ENABLED),
  yoomoneyWallet: enabled(process.env.BILLING_YOOMONEY_WALLET_ENABLED),
} as const;

export function getTrustedSiteOrigin() {
  const value = new URL(getSiteUrl());
  if (process.env.NODE_ENV === "production" && value.protocol !== "https:") {
    throw new Error("BILLING_SITE_URL_MUST_USE_HTTPS");
  }
  return value.origin;
}

export function isTrustedBillingOrigin(
  origin: string | null,
  fetchSite: string | null,
) {
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "same-site") {
    return false;
  }
  if (!origin) return process.env.NODE_ENV !== "production";
  try {
    return new URL(origin).origin === getTrustedSiteOrigin();
  } catch {
    return false;
  }
}

export function getYooMoneyConfig() {
  const receiver = process.env.YOOMONEY_RECEIVER?.trim();
  const notificationSecret = process.env.YOOMONEY_NOTIFICATION_SECRET?.trim();
  if (!receiver || !notificationSecret) return null;
  return { notificationSecret, receiver };
}

export function getTributeConfig() {
  const apiKey = process.env.TRIBUTE_API_KEY?.trim();
  return apiKey ? { apiKey } : null;
}
