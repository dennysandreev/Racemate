export type PolymarketRaceIdentity = {
  season: number;
  race: string;
  country: string;
  locality: string;
  circuit: string;
  startsAtIso?: string;
};

export type PolymarketEventIdentity = {
  title?: string;
  slug?: string;
  markets?: Array<{
    question?: string;
    title?: string;
    slug?: string;
    groupItemTitle?: string;
  }>;
};

const GENERIC_RACE_WORDS = new Set([
  "autodromo",
  "circuit",
  "de",
  "del",
  "di",
  "formula",
  "grand",
  "international",
  "nazionale",
  "one",
  "park",
  "prix",
  "street",
  "the",
]);

const RACE_NAME_ALIASES = [
  ["australia", "australian"],
  ["austria", "austrian"],
  ["azerbaijan", "azerbaijani"],
  ["bahrain", "bahraini"],
  ["belgium", "belgian"],
  ["brazil", "brazilian", "sao paulo"],
  ["canada", "canadian"],
  ["china", "chinese"],
  ["great britain", "british", "united kingdom"],
  ["hungary", "hungarian"],
  ["italy", "italian"],
  ["japan", "japanese"],
  ["mexico", "mexican"],
  ["netherlands", "dutch"],
  ["saudi arabia", "saudi"],
  ["singapore", "singaporean"],
  ["spain", "spanish"],
  ["united states", "american", "usa"],
] as const;

function normalizeRaceText(value: string | undefined) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsTerm(haystack: string, term: string) {
  return ` ${haystack} `.includes(` ${term} `);
}

function addMeaningfulTerms(terms: Set<string>, value: string | undefined) {
  const normalized = normalizeRaceText(value);
  const words = normalized
    .split(" ")
    .filter((word) => word.length >= 3 && !GENERIC_RACE_WORDS.has(word));
  const phrase = words.join(" ");

  if (phrase.length >= 4) {
    terms.add(phrase);
  }

  words
    .filter((word) => word.length >= 4)
    .forEach((word) => terms.add(word));
}

export function getPolymarketRaceMatchTerms(race: PolymarketRaceIdentity) {
  const terms = new Set<string>();
  const raceIdentity = normalizeRaceText(
    `${race.race} ${race.country} ${race.locality} ${race.circuit}`,
  );

  [race.race, race.country, race.locality, race.circuit].forEach((value) => {
    addMeaningfulTerms(terms, value);
  });

  RACE_NAME_ALIASES.forEach((aliases) => {
    if (aliases.some((alias) => containsTerm(raceIdentity, alias))) {
      aliases.forEach((alias) => terms.add(alias));
    }
  });

  if (terms.has("barcelona")) {
    terms.add("catalunya");
  }

  return [...terms];
}

function getEventIdentityText(event: PolymarketEventIdentity) {
  return [
    event.title,
    event.slug,
    ...(event.markets ?? []).flatMap((market) => [
      market.question,
      market.title,
      market.slug,
      market.groupItemTitle,
    ]),
  ]
    .filter(Boolean)
    .join(" ");
}

export function isPolymarketEventForRace(
  event: PolymarketEventIdentity,
  race: PolymarketRaceIdentity,
) {
  const identityText = getEventIdentityText(event);
  const normalizedIdentity = normalizeRaceText(identityText);

  if (!normalizedIdentity) {
    return false;
  }

  const eventDates = [...identityText.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)].map(
    (match) => match[1],
  );
  const raceDate = race.startsAtIso?.match(/^20\d{2}-\d{2}-\d{2}/)?.[0];

  if (raceDate && eventDates.length > 0 && !eventDates.includes(raceDate)) {
    return false;
  }

  const eventYears = [...identityText.matchAll(/\b(20\d{2})\b/g)].map((match) =>
    Number(match[1]),
  );

  if (eventYears.length > 0 && !eventYears.includes(race.season)) {
    return false;
  }

  return getPolymarketRaceMatchTerms(race).some((term) =>
    containsTerm(normalizedIdentity, term),
  );
}
