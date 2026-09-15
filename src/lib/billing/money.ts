const DECIMAL_AMOUNT = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/;

export function parseMinorUnits(value: string): number {
  const match = DECIMAL_AMOUNT.exec(value);
  if (!match) throw new Error("INVALID_MONEY_FORMAT");
  const [whole] = value.split(".");
  const fraction = (match[2] ?? "").padEnd(2, "0");
  const amount = Number(whole) * 100 + Number(fraction || 0);
  if (!Number.isSafeInteger(amount)) throw new Error("MONEY_OUT_OF_RANGE");
  return amount;
}

export function minorUnitsToDecimal(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("INVALID_MINOR_UNITS");
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
}

export function addCalendarMonthsUtc(value: Date, months: number): Date {
  if (!Number.isInteger(months) || months < 1) throw new Error("INVALID_MONTH_COUNT");
  const year = value.getUTCFullYear();
  const month = value.getUTCMonth() + months;
  const targetYear = year + Math.floor(month / 12);
  const targetMonth = ((month % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(
    targetYear,
    targetMonth,
    Math.min(value.getUTCDate(), lastDay),
    value.getUTCHours(),
    value.getUTCMinutes(),
    value.getUTCSeconds(),
    value.getUTCMilliseconds(),
  ));
}
