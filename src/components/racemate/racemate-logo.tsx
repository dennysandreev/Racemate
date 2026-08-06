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
    mark: "h-9 w-[4.8rem]",
    wordmark: "text-[1.55rem]",
    descriptor: "mt-1 text-[0.55rem] tracking-[0.16em]",
  },
  footer: {
    root: "gap-2",
    mark: "h-7 w-[3.75rem]",
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
          RaceSide
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
  return (
    <svg
      aria-hidden="true"
      className={cn("shrink-0 text-primary", className)}
      fill="none"
      viewBox="0 0 136 64"
    >
      <path
        d="M5 59 18 7h27c12 0 19 6 19 15 0 10-8 17-20 17H27l23 20"
        stroke="currentColor"
        strokeLinecap="square"
        strokeLinejoin="round"
        strokeWidth="10"
      />
      <path
        d="M129 8H95c-10 0-16 5-16 13 0 7 6 11 15 11h19c10 0 16 5 16 13 0 8-6 13-16 13H76"
        stroke="currentColor"
        strokeLinecap="square"
        strokeLinejoin="round"
        strokeWidth="10"
      />
    </svg>
  );
}
