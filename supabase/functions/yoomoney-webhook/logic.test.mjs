import assert from "node:assert/strict";
import test from "node:test";

import {
  isYooMoneyTestNotification,
  makeYooMoneyCanonicalString,
  parseYooMoneyNotification,
  signYooMoneyNotification,
  verifyYooMoneySignature,
} from "./logic.ts";

const officialEntries = Object.entries({
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

test("Edge webhook reproduces the official YooMoney signature", async () => {
  assert.equal(
    await signYooMoneyNotification(officialEntries, "secret123"),
    "a452af731650e2c5b39abcdc7c28dd27db7b3b654c2230ad2c386e64afb98605",
  );
  assert.equal(
    await verifyYooMoneySignature(
      [...officialEntries].reverse(),
      "a452af731650e2c5b39abcdc7c28dd27db7b3b654c2230ad2c386e64afb98605",
      "secret123",
    ),
    true,
  );
  assert.equal(await verifyYooMoneySignature(officialEntries, "0".repeat(64), "secret123"), false);
});

test("Edge webhook canonicalization is compatible with the app handler", () => {
  assert.equal(
    makeYooMoneyCanonicalString([
      ["sum", "249.00"],
      ["label", "rs_demo"],
      ["sender", ""],
      ["note", "F1 !*"],
      ["sign", "ignored"],
    ]),
    "label=rs_demo&note=F1%20%21%2A&sender=&sum=249.00",
  );
});

test("Edge webhook parses a valid RaceSide notification in minor units", () => {
  const event = parseYooMoneyNotification(new URLSearchParams({
    amount: "241.53",
    codepro: "false",
    currency: "643",
    datetime: "2026-09-16T10:38:24Z",
    label: "rs_1234567890abcdef",
    notification_type: "card-incoming",
    operation_id: "842824956756395120",
    unaccepted: "false",
    withdraw_amount: "249.00",
  }));

  assert.deepEqual(event, {
    currency: "RUB",
    eventId: "842824956756395120",
    eventType: "card-incoming",
    grossAmountMinor: 24_900,
    label: "rs_1234567890abcdef",
    netAmountMinor: 24_153,
    occurredAt: "2026-09-16T10:38:24.000Z",
    paymentMethod: "yoomoney_card",
    transactionId: "842824956756395120",
  });
});

test("Edge webhook rejects unsafe payment data and identifies signed tests", () => {
  const invalid = new URLSearchParams({
    amount: "241.53",
    codepro: "false",
    currency: "643",
    datetime: "2026-09-16T10:38:24Z",
    label: "not-raceside",
    notification_type: "card-incoming",
    operation_id: "842824956756395120",
    unaccepted: "false",
    withdraw_amount: "249.00",
  });
  assert.throws(() => parseYooMoneyNotification(invalid), /INVALID_PAYMENT_LABEL/);
  assert.equal(isYooMoneyTestNotification(new URLSearchParams("test_notification=true")), true);
});
