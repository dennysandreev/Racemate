import { createHash } from "node:crypto";

import rawCatalog from "../config/admin-jobs.json" with { type: "json" };
import type { AdminJobDefinition } from "@/types/admin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const adminJobCatalog = Object.freeze(rawCatalog as AdminJobDefinition[]);

const adminJobsByName = new Map(adminJobCatalog.map((job) => [job.name, job]));

export function getAdminJobDefinition(jobName: string) {
  return adminJobsByName.get(jobName) ?? null;
}

export function validateAdminJobRequest(
  jobName: string,
  input: Record<string, unknown>,
):
  | { ok: true; definition: AdminJobDefinition; args: Record<string, boolean | number | string> }
  | { ok: false; message: string } {
  const definition = getAdminJobDefinition(jobName);

  if (!definition) {
    return { ok: false, message: "Эту задачу нельзя запускать из админки." };
  }

  const allowedNames = new Set(definition.parameters.map((parameter) => parameter.name));
  const unexpectedName = Object.keys(input).find((name) => !allowedNames.has(name));

  if (unexpectedName) {
    return { ok: false, message: `Параметр «${unexpectedName}» не разрешён для этой задачи.` };
  }

  const args: Record<string, boolean | number | string> = {};

  for (const parameter of definition.parameters) {
    const value = input[parameter.name];

    if (value === undefined || value === null || value === "") {
      if (parameter.required) {
        return { ok: false, message: `Нужен параметр «${parameter.name}».` };
      }
      continue;
    }

    if (parameter.type === "boolean") {
      if (![true, false, "true", "false", "on"].includes(value as boolean | string)) {
        return { ok: false, message: `Параметр «${parameter.name}» должен быть переключателем.` };
      }
      args[parameter.name] = value === true || value === "true" || value === "on";
      continue;
    }

    if (parameter.type === "integer") {
      const number = typeof value === "number" ? value : Number(value);

      if (
        !Number.isInteger(number) ||
        (parameter.min !== undefined && number < parameter.min) ||
        (parameter.max !== undefined && number > parameter.max)
      ) {
        return { ok: false, message: `Параметр «${parameter.name}» вне допустимого диапазона.` };
      }
      args[parameter.name] = number;
      continue;
    }

    const text = String(value).trim();

    if (!text || text.length > 200) {
      return { ok: false, message: `Параметр «${parameter.name}» заполнен неверно.` };
    }
    if (parameter.type === "uuid" && !UUID_PATTERN.test(text)) {
      return { ok: false, message: `Параметр «${parameter.name}» должен содержать корректный ID.` };
    }
    if (parameter.options && !parameter.options.includes(text)) {
      return { ok: false, message: `Значение параметра «${parameter.name}» не разрешено.` };
    }
    args[parameter.name] = text;
  }

  return { ok: true, definition, args };
}

export function makeAdminJobRequestKey(input: {
  requestedBy: string;
  jobName: string;
  args: Record<string, boolean | number | string>;
  retryOf?: string | null;
  nonce?: string;
  now?: number;
}) {
  const stableArgs = Object.fromEntries(Object.entries(input.args).sort(([left], [right]) => left.localeCompare(right)));
  const bucket = input.nonce ?? String(Math.floor((input.now ?? Date.now()) / 5_000));
  const source = JSON.stringify([input.requestedBy, input.jobName, stableArgs, input.retryOf ?? null, bucket]);

  return createHash("sha256").update(source).digest("hex");
}
