import { readFileSync } from "node:fs";

const catalog = JSON.parse(
  readFileSync(new URL("../src/config/admin-jobs.json", import.meta.url), "utf8"),
);
const definitions = new Map(catalog.map((definition) => [definition.name, definition]));
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getQueuedJobDefinition(jobName) {
  return definitions.get(jobName) ?? null;
}

export function validateQueuedJob(job) {
  const definition = getQueuedJobDefinition(job?.job_name);

  if (!definition) {
    return { ok: false, reason: "job_not_allowed" };
  }

  const input = isRecord(job?.metadata?.args) ? job.metadata.args : {};
  const allowedNames = new Set(definition.parameters.map((parameter) => parameter.name));

  if (Object.keys(input).some((name) => !allowedNames.has(name))) {
    return { ok: false, reason: "unexpected_parameter" };
  }

  const args = {};

  for (const parameter of definition.parameters) {
    const value = input[parameter.name];

    if (value === undefined || value === null || value === "") {
      if (parameter.required) {
        return { ok: false, reason: `missing_${parameter.name}` };
      }
      continue;
    }

    if (parameter.type === "boolean") {
      if (typeof value !== "boolean") {
        return { ok: false, reason: `invalid_${parameter.name}` };
      }
      args[parameter.name] = value;
      continue;
    }

    if (parameter.type === "integer") {
      if (
        !Number.isInteger(value) ||
        (parameter.min !== undefined && value < parameter.min) ||
        (parameter.max !== undefined && value > parameter.max)
      ) {
        return { ok: false, reason: `invalid_${parameter.name}` };
      }
      args[parameter.name] = value;
      continue;
    }

    if (
      typeof value !== "string" ||
      !value.trim() ||
      value.length > 200 ||
      (parameter.type === "uuid" && !uuidPattern.test(value)) ||
      (parameter.options && !parameter.options.includes(value))
    ) {
      return { ok: false, reason: `invalid_${parameter.name}` };
    }
    args[parameter.name] = value.trim();
  }

  return { ok: true, definition, args };
}

export function toWorkerArguments(definition, args) {
  const result = [];

  for (const parameter of definition.parameters) {
    const value = args[parameter.name];

    if (value === undefined || value === null || value === false) {
      continue;
    }
    result.push(parameter.flag);
    if (parameter.type !== "boolean") {
      result.push(String(value));
    }
  }

  return result;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
