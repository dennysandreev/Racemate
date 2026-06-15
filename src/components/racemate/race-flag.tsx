import { cn } from "@/lib/utils";

type RaceFlagProps = {
  label: string;
  value?: string | null;
  className?: string;
};

const emojiFontFamily =
  '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", emoji, sans-serif';

export function RaceFlag({ label, value, className }: RaceFlagProps) {
  const flag = value?.trim() || "🏁";

  return (
    <span
      aria-label={label}
      className={cn("inline-block shrink-0 leading-none", className)}
      role="img"
      style={{ fontFamily: emojiFontFamily }}
      title={label}
    >
      {flag}
    </span>
  );
}
