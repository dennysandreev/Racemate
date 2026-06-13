import { cn } from "@/lib/utils";

type TeamLogoProps = {
  code?: string | null;
  color?: string | null;
  logo?: string | null;
  name: string;
  size?: "sm" | "md";
};

export function TeamLogo({
  code,
  color,
  logo,
  name,
  size = "sm",
}: TeamLogoProps) {
  const initials = code || getInitials(name);

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-grid shrink-0 place-items-center overflow-hidden border border-white/10 bg-[oklch(0.16_0.014_250)] text-[0.58rem] font-semibold text-foreground shadow-sm",
        logo
          ? size === "sm"
            ? "h-8 w-24 rounded-md px-2 py-1.5"
            : "h-10 w-32 rounded-md px-2.5 py-1.5"
          : size === "sm"
            ? "size-6 rounded-full"
            : "size-8 rounded-full",
      )}
      style={color && !logo ? { backgroundColor: color } : undefined}
      title={name}
    >
      {logo ? (
        <span
          className="block h-full w-full bg-contain bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${logo})` }}
        />
      ) : (
        <span className="px-1 leading-none">{initials}</span>
      )}
    </span>
  );
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
