const FORMULA1_ARTICLE_PATTERN = /\/what-tyres-will-the-teams-and-drivers-have-for-the-(\d{4})-(.+?)-grand-prix(?:\.|\/|$)/i;

export function parseSitemapLocations(xml) {
  return [...String(xml ?? "").matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)]
    .map((match) => decodeXml(match[1]))
    .filter(Boolean);
}

export function getFormula1TyreArticleIdentity(url) {
  const match = String(url ?? "").match(FORMULA1_ARTICLE_PATTERN);

  if (!match) {
    return null;
  }

  return {
    season: Number(match[1]),
    raceKey: normalizeRaceKey(match[2]),
  };
}

export function parseFormula1TyreAllocationArticle(html, sourceUrl) {
  const identity = getFormula1TyreArticleIdentity(sourceUrl);
  const text = stripHtml(html);
  const orderedSelection = findOrderedCompoundSelection(text);
  const hard = orderedSelection?.[0] ?? findCompoundForRole(text, "hard");
  const medium = orderedSelection?.[1] ?? findCompoundForRole(text, "medium");
  const soft = orderedSelection?.[2] ?? findCompoundForRole(text, "soft");
  const compounds = [hard, medium, soft];

  if (!identity || compounds.some((compound) => !compound) || new Set(compounds).size !== 3) {
    return null;
  }

  return {
    ...identity,
    hard,
    medium,
    soft,
    sourceUrl,
  };
}

export function matchFormula1TyreAllocationRace(allocation, races) {
  if (!allocation) {
    return null;
  }

  return races.find((race) => {
    if (Number(race.season_year) !== allocation.season) {
      return false;
    }

    const raceKey = normalizeRaceKey(race.race_name);
    return raceKey === allocation.raceKey
      || raceKey.includes(allocation.raceKey)
      || allocation.raceKey.includes(raceKey);
  }) ?? null;
}

function findCompoundForRole(text, role) {
  const explicit = text.match(new RegExp(
    `\\b(C[1-6])\\b(?:(?!\\bC[1-6]\\b)[^,.!?;]){0,60}\\b${role}\\b`,
    "i",
  ));
  return explicit?.[1]?.toUpperCase() ?? null;
}

function findOrderedCompoundSelection(text) {
  const match = text.match(
    /\b(C[1-6])\s*,\s*(C[1-6])\s+(?:,\s*)?and\s+(C[1-6])\b(?=[^.!?]{0,180}\b(?:hard|harder|medium|soft|softer|softest|compounds?|rubber)\b)/i,
  );

  return match ? match.slice(1, 4).map((compound) => compound.toUpperCase()) : null;
}

function normalizeRaceKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(?:formula\s*1|f1|grand\s+prix|gp|the|202\d)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "-");
}

function stripHtml(value) {
  return decodeXml(String(value ?? "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function decodeXml(value) {
  return String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
