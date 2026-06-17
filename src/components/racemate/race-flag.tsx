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
  "au",
  "at",
  "az",
  "be",
  "bh",
  "br",
  "ca",
  "cn",
  "es",
  "gb",
  "hu",
  "it",
  "jp",
  "mc",
  "mx",
  "nl",
  "qa",
  "sa",
  "sg",
  "us",
]);

export function RaceFlag({ label, countryCode, value, className }: RaceFlagProps) {
  const code = countryCode?.trim().toLowerCase();

  if (code && supportedFlags.has(code)) {
    return (
      <Image
        alt={label}
        className={cn("inline-block h-[1em] w-[1.45em] shrink-0 rounded-[2px] object-cover shadow-[0_0_0_1px_rgb(255_255_255_/_0.22)]", className)}
        height={20}
        loading="lazy"
        src={`/flags/${code}.svg`}
        title={label}
        width={30}
      />
    );
  }

  return (
    <span aria-label={label} className={cn("inline-block shrink-0 leading-none", className)} role="img" title={label}>
      {value?.trim() || "🏁"}
    </span>
  );
}
