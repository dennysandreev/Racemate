import type { BillingPrice, BillingPriceCode } from "@/lib/billing/types";

export const billingPriceCatalog: Record<BillingPriceCode, BillingPrice> = {
  plus_monthly: {
    amountMinor: 24_900,
    code: "plus_monthly",
    currency: "RUB",
    durationMonths: 1,
    firstPurchaseOnly: false,
    label: "RaceSide Plus на месяц",
    shortLabel: "249 ₽ за месяц",
  },
  plus_first_year: {
    amountMinor: 199_000,
    code: "plus_first_year",
    currency: "RUB",
    durationMonths: 12,
    firstPurchaseOnly: true,
    label: "RaceSide Plus на первые 12 месяцев",
    shortLabel: "1 990 ₽ за 12 месяцев",
  },
};

export function getBillingPrice(value: string): BillingPrice | null {
  return value in billingPriceCatalog
    ? billingPriceCatalog[value as BillingPriceCode]
    : null;
}

export function formatMoney(amountMinor: number, currency = "RUB") {
  return new Intl.NumberFormat("ru-RU", {
    currency,
    maximumFractionDigits: amountMinor % 100 === 0 ? 0 : 2,
    minimumFractionDigits: amountMinor % 100 === 0 ? 0 : 2,
    style: "currency",
  }).format(amountMinor / 100);
}

export function formatProvider(provider: string, method?: string) {
  if (provider === "tribute") return "Tribute";
  if (provider === "yoomoney_wallet" || method === "yoomoney_wallet") return "Кошелёк ЮMoney";
  return "Банковская карта через ЮMoney";
}
