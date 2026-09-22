import assert from "node:assert/strict";
import test from "node:test";

import { eventCategory, eventDriverNumbers } from "./event-display.ts";

const drivers = [
  { driverNumber: 16, acronym: "LEC" },
  { driverNumber: 44, acronym: "HAM" },
  { driverNumber: 81, acronym: "PIA" },
];

test("event categories distinguish track, sporting and race events", () => {
  assert.deepEqual(
    eventCategory({
      type: "race_control",
      message: "Жёлтый флаг",
      original: "YELLOW FLAG",
    }),
    { label: "Жёлтый флаг", tone: "yellow" },
  );
  assert.deepEqual(
    eventCategory({
      type: "stewards",
      message: "Штраф",
      original: "5 SECOND TIME PENALTY",
    }),
    { label: "Штраф", tone: "red" },
  );
  assert.deepEqual(
    eventCategory({
      type: "overtake",
      message: "HAM обгоняет LEC",
      original: null,
    }),
    { label: "Обгон", tone: "orange" },
  );
  assert.deepEqual(
    eventCategory({
      type: "race_control",
      message: "ALO — время 1:55.304 удалено",
      original: "CAR 14 LAP TIME 1:55.304 DELETED",
    }),
    { label: "Круг удалён", tone: "red" },
  );
  assert.deepEqual(
    eventCategory({
      type: "race_control",
      message: "MARSHALS ON TRACK AT TURN 5",
      original: "MARSHALS ON TRACK AT TURN 5",
    }),
    { label: "На трассе", tone: "orange" },
  );
  assert.deepEqual(
    eventCategory({
      type: "race_control",
      message:
        "FIA STEWARDS: INCIDENT INVOLVING CAR 14 (ALO) WILL BE INVESTIGATED AFTER THE RACE - YELLOW FLAG INFRINGEMENT",
      original: null,
    }),
    { label: "Дирекция", tone: "neutral" },
  );
});

test("driver tags include explicit and mentioned drivers in message order", () => {
  assert.deepEqual(
    eventDriverNumbers(
      {
        driverNumber: null,
        message: "Инцидент рассматривается",
        original: "CARS 44 (HAM) AND 16 (LEC) UNDER INVESTIGATION",
      },
      drivers,
    ),
    [44, 16],
  );
  assert.deepEqual(
    eventDriverNumbers(
      {
        driverNumber: 81,
        message: "PIA — пит-стоп",
        original: null,
      },
      drivers,
    ),
    [81],
  );
});
