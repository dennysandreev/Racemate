import { createHash } from "node:crypto";

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value ?? null);
}

export function makeAdminFindingFingerprint(input: {
  ruleKey: string;
  subject: Record<string, unknown>;
}) {
  const source = stableSerialize({
    ruleKey: input.ruleKey.trim().toLowerCase(),
    subject: input.subject,
  });

  return createHash("sha256").update(source).digest("hex");
}
