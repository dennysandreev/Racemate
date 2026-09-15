import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { addCalendarMonthsUtc, minorUnitsToDecimal, parseMinorUnits } from "./money.ts";
import { isYooMoneyTestNotification, makeYooMoneyCanonicalString, signYooMoneyNotification, verifyRawBodyHmac, verifyYooMoneySignature } from "./signatures.ts";

test("billing money parser uses integer minor units", () => {
  assert.equal(parseMinorUnits("249.00"), 24900);
  assert.equal(parseMinorUnits("1990.00"), 199000);
  assert.equal(minorUnitsToDecimal(24900), "249.00");
  assert.throws(() => parseMinorUnits("249.001"));
  assert.throws(() => parseMinorUnits("2e3"));
});

test("calendar periods clamp end-of-month and preserve leap dates", () => {
  assert.equal(addCalendarMonthsUtc(new Date("2026-01-31T12:00:00Z"), 1).toISOString(), "2026-02-28T12:00:00.000Z");
  assert.equal(addCalendarMonthsUtc(new Date("2024-02-29T12:00:00Z"), 12).toISOString(), "2025-02-28T12:00:00.000Z");
});

test("YooMoney signs all fields except sign in codepoint order with RFC3986 encoding", () => {
  const entries = [["sum", "249.00"], ["label", "rs_demo"], ["sender", ""], ["note", "F1 !*"], ["sign", "ignored"]];
  const canonical = makeYooMoneyCanonicalString(entries);
  assert.equal(canonical, "label=rs_demo&note=F1%20%21%2A&sender=&sum=249.00");
  const signature = signYooMoneyNotification(entries, "test-secret");
  assert.equal(verifyYooMoneySignature([...entries].reverse(), signature, "test-secret"), true);
  assert.equal(verifyYooMoneySignature(entries, "0".repeat(64), "test-secret"), false);
});

test("YooMoney official notification example reproduces the documented sign", () => {
  const entries = Object.entries({
    notification_type: "p2p-incoming",
    operation_id: "441361714955017004",
    amount: "98.00",
    withdraw_amount: "100.00",
    currency: "643",
    datetime: "2013-12-26T08:28:34Z",
    sender: "41000000000",
    codepro: "false",
    label: "ML23045",
    unaccepted: "false",
    sha1_hash: "ac13833bd6ba9eff1fa9e4bed76f3d6ebb57f6c0",
  });
  assert.equal(
    signYooMoneyNotification(entries, "secret123"),
    "a452af731650e2c5b39abcdc7c28dd27db7b3b654c2230ad2c386e64afb98605",
  );
});

test("YooMoney test notifications are identified explicitly", () => {
  assert.equal(isYooMoneyTestNotification(new URLSearchParams("test_notification=true")), true);
  assert.equal(isYooMoneyTestNotification(new URLSearchParams("test_notification=false")), false);
  assert.equal(isYooMoneyTestNotification(new URLSearchParams()), false);
});

test("Tribute signature covers the exact raw JSON body", () => {
  const body = '{"name":"shop_order_payment_received","payload":{"amount":24900}}';
  const signature = createHmac("sha256", "tribute-key").update(body).digest("hex");
  assert.equal(verifyRawBodyHmac(body, signature, "tribute-key"), true);
  assert.equal(verifyRawBodyHmac(`${body}\n`, signature, "tribute-key"), false);
});

test("billing migration protects financial writes and idempotency", () => {
  const sql = readFileSync(new URL("../../../supabase/migrations/20260915142510_subscription_billing.sql", import.meta.url), "utf8");
  assert.match(sql, /enable row level security/g);
  assert.match(sql, /revoke all on public\.subscription_plans[\s\S]+from public, anon, authenticated/);
  assert.match(sql, /unique \(provider, provider_transaction_id\)/);
  assert.match(sql, /unique \(user_id, idempotency_key\)/);
  assert.match(sql, /billing_orders_one_pending_per_user/);
  assert.match(sql, /billing_consume_rate_limit/);
  assert.match(sql, /billing_admin_revoke/);
  assert.match(sql, /for update/);
});

test("admin subscription grant validates targets without reading the protected auth schema", () => {
  const sql = readFileSync(
    new URL("../../../supabase/migrations/20260915194332_fix_billing_admin_grant_target_lookup.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /from public\.profiles where id = p_target_user_id/);
  assert.doesNotMatch(sql, /from auth\.users/);
  assert.match(sql, /security invoker/);
  assert.match(sql, /grant execute on function public\.billing_admin_grant[\s\S]+to service_role/);
});

test("security policy permits only the trusted YooMoney checkout form", () => {
  const config = readFileSync(new URL("../../../next.config.ts", import.meta.url), "utf8");
  const directive = config.match(/"form-action ([^"]+)"/)?.[1];
  assert.equal(directive, "'self' https://yoomoney.ru");
});
