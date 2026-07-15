import { useId } from "react";

import { cn } from "@/lib/utils";

type RaceMateLogoProps = {
  className?: string;
  size?: "navigation" | "footer";
};

type RaceMateMarkProps = {
  className?: string;
};

const logoSizeClasses = {
  navigation: {
    root: "gap-2",
    mark: "h-9 w-[3.85rem]",
    wordmark: "text-[1.55rem]",
    descriptor: "mt-1 text-[0.55rem] tracking-[0.16em]",
  },
  footer: {
    root: "gap-2",
    mark: "h-7 w-12",
    wordmark: "text-base",
    descriptor: "mt-0.5 text-[0.46rem] tracking-[0.14em]",
  },
} as const;

export function RaceMateLogo({
  className,
  size = "navigation",
}: RaceMateLogoProps) {
  const classes = logoSizeClasses[size];

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex min-w-0 items-center transition-transform duration-200 group-hover:translate-x-0.5 group-active:translate-y-px motion-reduce:transform-none motion-reduce:transition-none",
        classes.root,
        className,
      )}
    >
      <RaceMateMark className={classes.mark} />
      <span className="min-w-0 leading-none">
        <span
          className={cn(
            "block whitespace-nowrap font-display font-extrabold tracking-[-0.03em] text-[var(--racemate-logo-wordmark)]",
            classes.wordmark,
          )}
        >
          RaceMate
        </span>
        <span
          className={cn(
            "block whitespace-nowrap font-telemetry font-bold text-[var(--racemate-logo-descriptor)]",
            classes.descriptor,
          )}
        >
          Гоночный центр
        </span>
      </span>
    </span>
  );
}

export function RaceMateMark({ className }: RaceMateMarkProps) {
  const maskId = `racemate-rm-${useId().replaceAll(":", "")}`;

  return (
    <svg
      aria-hidden="true"
      className={cn("shrink-0 text-primary", className)}
      fill="none"
      viewBox="0 0 96 56"
    >
      <mask
        height="56"
        id={maskId}
        maskUnits="userSpaceOnUse"
        width="96"
        x="0"
        y="0"
      >
        <rect fill="white" height="56" width="96" />
        <path d="M39 36h8l-3 19Z" fill="black" />
      </mask>
      <g fill="currentColor" mask={`url(#${maskId})`}>
        <path d="M6 10 16 0h29c12 0 20 7 20 18 0 12-8 19-20 19h-7l12 15-7 4-14-19h-3c-5 0-8 2-11 6L5 56H0l16-23c3-4 7-6 13-6h16c6 0 10-3 10-8.5S51 10 45 10Z" />
        <path d="M44 56 86 0h10v56H86V17L54 56Z" />
      </g>
    </svg>
  );
}
