const DEFAULT_AUTH_NEXT = "/account";

export function normalizeAuthNext(value: FormDataEntryValue | string | null | undefined) {
  const next = String(value ?? "").trim();

  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return DEFAULT_AUTH_NEXT;
  }

  try {
    const parsed = new URL(next, "https://raceside.online");

    if (parsed.origin !== "https://raceside.online") {
      return DEFAULT_AUTH_NEXT;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return DEFAULT_AUTH_NEXT;
  }
}
