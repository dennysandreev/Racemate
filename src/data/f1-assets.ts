import type { TeamVisual } from "@/types/racemate";

type CircuitAsset = {
  aliases: string[];
  src: string;
};

type TeamAsset = TeamVisual & {
  aliases: string[];
};

type TeamProfileAsset = {
  aliases: string[];
  carImageUrl: string;
  slug: string;
};

const circuitAssets = [
  {
    aliases: ["australia", "albert park", "melbourne"],
    src: "/f1/circuits/australia.webp",
  },
  {
    aliases: ["china", "shanghai"],
    src: "/f1/circuits/china.webp",
  },
  {
    aliases: ["japan", "suzuka"],
    src: "/f1/circuits/japan.webp",
  },
  {
    aliases: ["miami", "miami international autodrome"],
    src: "/f1/circuits/miami.webp",
  },
  {
    aliases: ["canada", "gilles villeneuve", "montreal"],
    src: "/f1/circuits/canada.webp",
  },
  {
    aliases: ["monaco", "monte carlo"],
    src: "/f1/circuits/monaco.webp",
  },
  {
    aliases: ["barcelona-catalunya", "barcelona", "catalunya", "circuit de barcelona-catalunya"],
    src: "/f1/circuits/barcelona-catalunya.webp",
  },
  {
    aliases: ["spain", "madrid", "madring", "ifema madrid"],
    src: "/f1/circuits/spain.webp",
  },
  {
    aliases: ["austria", "red bull ring", "spielberg"],
    src: "/f1/circuits/austria.webp",
  },
  {
    aliases: ["great britain", "silverstone", "united kingdom"],
    src: "/f1/circuits/great-britain.webp",
  },
  {
    aliases: ["belgium", "spa-francorchamps", "spa"],
    src: "/f1/circuits/belgium.webp",
  },
  {
    aliases: ["hungary", "hungaroring", "budapest"],
    src: "/f1/circuits/hungary.webp",
  },
  {
    aliases: ["netherlands", "zandvoort"],
    src: "/f1/circuits/netherlands.webp",
  },
  {
    aliases: ["italy", "monza"],
    src: "/f1/circuits/italy.webp",
  },
  {
    aliases: ["azerbaijan", "baku"],
    src: "/f1/circuits/baku.webp",
  },
  {
    aliases: ["singapore", "marina bay"],
    src: "/f1/circuits/singapore.webp",
  },
  {
    aliases: ["united states", "usa", "americas", "austin", "cota"],
    src: "/f1/circuits/usa.webp",
  },
  {
    aliases: ["mexico", "hermanos rodriguez"],
    src: "/f1/circuits/mexico.webp",
  },
  {
    aliases: ["brazil", "interlagos", "jose carlos pace", "sao paulo"],
    src: "/f1/circuits/brazil.webp",
  },
  {
    aliases: ["las vegas", "las vegas strip"],
    src: "/f1/circuits/las-vegas.webp",
  },
  {
    aliases: ["qatar", "losail", "lusail"],
    src: "/f1/circuits/qatar.webp",
  },
  {
    aliases: ["abu dhabi", "yas marina", "united arab emirates"],
    src: "/f1/circuits/abu-dhabi.webp",
  },
] satisfies CircuitAsset[];

const teamAssets = [
  {
    name: "Alpine",
    code: "ALP",
    logo: "/f1/teams/alpine.webp",
    color: "#0093CC",
    aliases: ["alpine", "bwt alpine", "alp"],
  },
  {
    name: "Aston Martin",
    code: "AMR",
    logo: "/f1/teams/aston-martin.svg",
    color: "#229971",
    aliases: ["aston martin", "aston martin aramco", "aston martin aramco f1 team", "amr", "ast"],
  },
  {
    name: "Audi",
    code: "AUD",
    logo: "/f1/teams/audi.webp",
    color: "#D71920",
    aliases: ["audi", "sauber", "kick sauber", "stake", "aud"],
  },
  {
    name: "Cadillac",
    code: "CAD",
    logo: "/f1/teams/cadillac.webp",
    color: "#B98B2F",
    aliases: ["cadillac", "cad"],
  },
  {
    name: "Ferrari",
    code: "FER",
    logo: "/f1/teams/ferrari.webp",
    color: "#E8002D",
    aliases: ["ferrari", "scuderia ferrari", "fer"],
  },
  {
    name: "Haas",
    code: "HAS",
    logo: "/f1/teams/haas.svg",
    color: "#B6BABD",
    aliases: ["haas", "haas f1 team", "moneygram haas", "tgr haas", "has", "haa"],
  },
  {
    name: "McLaren",
    code: "MCL",
    logo: "/f1/teams/mclaren.webp",
    color: "#FF8000",
    aliases: ["mclaren", "mclaren mercedes", "mcl"],
  },
  {
    name: "Mercedes",
    code: "MER",
    logo: "/f1/teams/mercedes.webp",
    color: "#27F4D2",
    aliases: ["mercedes", "mercedes-amg", "mercedes amg", "mer"],
  },
  {
    name: "Racing Bulls",
    code: "RB",
    logo: "/f1/teams/racing-bulls.webp",
    color: "#6692FF",
    aliases: ["racing bulls", "rb", "visa cash app rb", "vcarb", "racingbulls"],
  },
  {
    name: "Red Bull Racing",
    code: "RBR",
    logo: "/f1/teams/red-bull-racing.svg",
    color: "#3671C6",
    aliases: ["red bull", "red bull racing", "oracle red bull racing", "rbr", "red"],
  },
  {
    name: "Williams",
    code: "WIL",
    logo: "/f1/teams/williams.webp",
    color: "#64C4FF",
    aliases: ["williams", "atlansian williams", "williams racing", "wil"],
  },
] satisfies TeamAsset[];

const teamProfileAssets = [
  { aliases: ["mercedes", "mer"], carImageUrl: "/f1/teams/cars/2026/mercedes.jpg", slug: "mercedes" },
  { aliases: ["ferrari", "fer"], carImageUrl: "/f1/teams/cars/2026/ferrari.jpg", slug: "ferrari" },
  { aliases: ["mclaren", "mcl"], carImageUrl: "/f1/teams/cars/2026/mclaren.jpg", slug: "mclaren" },
  { aliases: ["red bull", "red bull racing", "red"], carImageUrl: "/f1/teams/cars/2026/red-bull.jpg", slug: "red-bull" },
  { aliases: ["alpine", "alpine f1 team", "alp"], carImageUrl: "/f1/teams/cars/2026/alpine.jpg", slug: "alpine" },
  { aliases: ["racing bulls", "rb f1 team", "rbx"], carImageUrl: "/f1/teams/cars/2026/racing-bulls.jpg", slug: "racing-bulls" },
  { aliases: ["haas", "haas f1 team", "haa"], carImageUrl: "/f1/teams/cars/2026/haas.jpg", slug: "haas" },
  { aliases: ["williams", "wil"], carImageUrl: "/f1/teams/cars/2026/williams.jpg", slug: "williams" },
  { aliases: ["audi", "aud"], carImageUrl: "/f1/teams/cars/2026/audi.jpg", slug: "audi" },
  { aliases: ["aston martin", "ast", "amr"], carImageUrl: "/f1/teams/cars/2026/aston-martin.jpg", slug: "aston-martin" },
  { aliases: ["cadillac", "cadillac f1 team", "cad"], carImageUrl: "/f1/teams/cars/2026/cadillac.jpg", slug: "cadillac" },
] satisfies TeamProfileAsset[];

export function getCircuitAsset(circuitNameOrExternalId?: string | null) {
  if (!circuitNameOrExternalId) {
    return null;
  }

  const normalized = normalizeAssetKey(circuitNameOrExternalId);

  return (
    circuitAssets.find((asset) =>
      asset.aliases.some((alias) => normalized.includes(normalizeAssetKey(alias))),
    ) ?? null
  );
}

export function getTeamAsset(teamNameOrCode?: string | null): TeamVisual | null {
  if (!teamNameOrCode) {
    return null;
  }

  const normalized = normalizeAssetKey(teamNameOrCode);
  const match = teamAssets.find((asset) =>
    asset.aliases.some((alias) => normalized.includes(normalizeAssetKey(alias))),
  );

  if (!match) {
    return null;
  }

  return {
    name: match.name,
    code: match.code,
    logo: match.logo,
    color: match.color,
  };
}

export function getTeamProfileAsset(teamNameOrCode?: string | null) {
  if (!teamNameOrCode) {
    return null;
  }

  const normalized = normalizeAssetKey(teamNameOrCode);

  return (
    teamProfileAssets.find((asset) =>
      asset.aliases.some((alias) => normalized === normalizeAssetKey(alias)),
    ) ?? null
  );
}

type DriverTeamLookup = {
  driver?: string | null;
  team?: string | null;
  teamCode?: string | null;
  teamColor?: string | null;
  teamLogo?: string | null;
};

export function getTeamAssetForDriver(
  driverName?: string | null,
  rows: DriverTeamLookup[] = [],
): TeamVisual | null {
  if (!driverName) {
    return null;
  }

  const normalizedDriver = normalizeAssetKey(driverName);
  const match = rows.find((row) => {
    const normalizedRowDriver = normalizeAssetKey(row.driver ?? "");

    return (
      normalizedRowDriver === normalizedDriver ||
      normalizedRowDriver.includes(normalizedDriver) ||
      normalizedDriver.includes(normalizedRowDriver)
    );
  });

  if (!match) {
    return null;
  }

  return (
    getTeamAsset(match.teamCode) ??
    getTeamAsset(match.team) ?? {
      name: match.team ?? driverName,
      code: match.teamCode ?? undefined,
      logo: match.teamLogo ?? undefined,
      color: match.teamColor ?? undefined,
    }
  );
}

export function getTeamAssetForMarketOutcome(
  outcomeName?: string | null,
  rows: DriverTeamLookup[] = [],
): TeamVisual | null {
  return getTeamAsset(outcomeName) ?? getTeamAssetForDriver(outcomeName, rows);
}

export function getTeamMatchNames() {
  const names = new Set<string>();

  teamAssets.forEach((asset) => {
    names.add(asset.name);

    if (asset.code) {
      names.add(asset.code);
    }

    asset.aliases.forEach((alias) => names.add(alias));
  });

  return [...names];
}

function normalizeAssetKey(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
