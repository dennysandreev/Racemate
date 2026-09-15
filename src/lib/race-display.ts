const GRAND_PRIX_NAMES_RU: Record<string, string> = {
  "70th Anniversary Grand Prix": "Гран-при 70-летия Формулы-1",
  "Abu Dhabi Grand Prix": "Гран-при Абу-Даби",
  "Australian Grand Prix": "Гран-при Австралии",
  "Austrian Grand Prix": "Гран-при Австрии",
  "Azerbaijan Grand Prix": "Гран-при Азербайджана",
  "Bahrain Grand Prix": "Гран-при Бахрейна",
  "Bahrain Grand Prix in Malaysia": "Гран-при Малайзии",
  "Barcelona Grand Prix": "Гран-при Барселоны",
  "Belgian Grand Prix": "Гран-при Бельгии",
  "Brazilian Grand Prix": "Гран-при Бразилии",
  "British Grand Prix": "Гран-при Великобритании",
  "Canadian Grand Prix": "Гран-при Канады",
  "Chinese Grand Prix": "Гран-при Китая",
  "Dutch Grand Prix": "Гран-при Нидерландов",
  "Eifel Grand Prix": "Гран-при Айфеля",
  "Emilia Romagna Grand Prix": "Гран-при Эмилии-Романьи",
  "French Grand Prix": "Гран-при Франции",
  "Hungarian Grand Prix": "Гран-при Венгрии",
  "Italian Grand Prix": "Гран-при Италии",
  "Japanese Grand Prix": "Гран-при Японии",
  "Las Vegas Grand Prix": "Гран-при Лас-Вегаса",
  "Madrid Grand Prix": "Гран-при Мадрида",
  "Malaysian Grand Prix": "Гран-при Малайзии",
  "Mexico Grand Prix": "Гран-при Мексики",
  "Mexico City Grand Prix": "Гран-при Мехико",
  "Miami Grand Prix": "Гран-при Майами",
  "Monaco Grand Prix": "Гран-при Монако",
  "Portuguese Grand Prix": "Гран-при Португалии",
  "Qatar Grand Prix": "Гран-при Катара",
  "Russian Grand Prix": "Гран-при России",
  "Sakhir Grand Prix": "Гран-при Сахира",
  "Saudi Arabian Grand Prix": "Гран-при Саудовской Аравии",
  "Singapore Grand Prix": "Гран-при Сингапура",
  "Spanish Grand Prix": "Гран-при Испании",
  "Styrian Grand Prix": "Гран-при Штирии",
  "Sao Paulo Grand Prix": "Гран-при Сан-Паулу",
  "São Paulo Grand Prix": "Гран-при Сан-Паулу",
  "Turkish Grand Prix": "Гран-при Турции",
  "Tuscan Grand Prix": "Гран-при Тосканы",
  "United States Grand Prix": "Гран-при США",
};

const CANONICAL_GRAND_PRIX_NAMES: Record<string, string> = {
  "Bahrain Grand Prix in Malaysia": "Malaysian Grand Prix",
};

export function getCanonicalGrandPrixName(raceName: string) {
  const normalized = raceName.trim().replace(/\s+/g, " ");
  return CANONICAL_GRAND_PRIX_NAMES[normalized] ?? normalized;
}

export function formatGrandPrixNameRu(raceName: string) {
  const normalized = getCanonicalGrandPrixName(raceName);

  if (!normalized || /^гран-при\b/i.test(normalized)) {
    return normalized;
  }

  const exactMatch = GRAND_PRIX_NAMES_RU[normalized];

  if (exactMatch) {
    return exactMatch;
  }

  const normalizedKey = normalized.toLocaleLowerCase("en-US");
  const caseInsensitiveMatch = Object.entries(GRAND_PRIX_NAMES_RU).find(
    ([name]) => name.toLocaleLowerCase("en-US") === normalizedKey,
  );

  return caseInsensitiveMatch?.[1] ?? normalized;
}

export function formatGrandPrixTagNameRu(tagName: string) {
  const normalized = tagName.trim().replace(/\s+/g, " ");
  const match = normalized.match(/^(.+? Grand Prix)(.*)$/i);

  if (!match) {
    return formatGrandPrixNameRu(normalized);
  }

  const localizedRaceName = formatGrandPrixNameRu(match[1]);
  return localizedRaceName === match[1]
    ? normalized
    : `${localizedRaceName}${match[2]}`;
}
