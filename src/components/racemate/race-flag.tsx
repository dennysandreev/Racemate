import Image from "next/image";

import { cn } from "@/lib/utils";

type RaceFlagProps = {
  label: string;
  countryCode?: string | null;
  value?: string | null;
  className?: string;
};

const supportedFlags = new Set([
  "ae",
  "ar",
  "au",
  "at",
  "az",
  "be",
  "bh",
  "br",
  "ca",
  "cn",
  "ch",
  "de",
  "dk",
  "es",
  "fi",
  "fr",
  "gb",
  "hu",
  "it",
  "jp",
  "mc",
  "mx",
  "my",
  "nl",
  "nz",
  "pl",
  "pt",
  "qa",
  "ru",
  "sa",
  "sg",
  "th",
  "tr",
  "us",
]);

const countryCodeAliases: Record<string, string> = {
  are: "ae",
  arg: "ar",
  aus: "au",
  aut: "at",
  aze: "az",
  bel: "be",
  bhr: "bh",
  bra: "br",
  can: "ca",
  che: "ch",
  chn: "cn",
  deu: "de",
  dnk: "dk",
  esp: "es",
  fin: "fi",
  fra: "fr",
  gbr: "gb",
  hun: "hu",
  ita: "it",
  jpn: "jp",
  mco: "mc",
  mex: "mx",
  mys: "my",
  nld: "nl",
  nzl: "nz",
  pol: "pl",
  prt: "pt",
  qat: "qa",
  rus: "ru",
  sau: "sa",
  sgp: "sg",
  sui: "ch",
  tha: "th",
  tur: "tr",
  usa: "us",
};

export function RaceFlag({ label, countryCode, className }: RaceFlagProps) {
  const rawCode = countryCode?.trim().toLowerCase();
  const code = rawCode ? countryCodeAliases[rawCode] ?? rawCode : undefined;
  const hasCountryFlag = Boolean(code && supportedFlags.has(code));
  const isSquare = code === "ch";

  return (
    <Image
      alt={label}
      className={cn(
        "inline-block h-[1em] shrink-0 rounded-[2px] object-cover shadow-[0_0_0_1px_rgb(255_255_255_/_0.22)]",
        isSquare ? "w-[1em]" : "w-[1.45em]",
        className,
      )}
      height={20}
      loading="lazy"
      src={hasCountryFlag ? `/flags/${code}.svg` : "/flags/race.svg"}
      title={label}
      width={isSquare ? 20 : 30}
    />
  );
}
