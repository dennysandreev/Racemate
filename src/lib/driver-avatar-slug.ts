const driverAvatarSlugAliases: Record<string, string> = {
  "alex-albon": "alexander-albon",
  "kimi-antonelli": "andrea-kimi-antonelli",
};

export function normalizeDriverAvatarSlug(value?: string | null) {
  if (!value) return null;

  const slug = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  if (!slug) return null;

  return driverAvatarSlugAliases[slug] ?? slug;
}
