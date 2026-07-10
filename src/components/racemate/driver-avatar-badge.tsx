import Image from "next/image";

import { cn } from "@/lib/utils";

const localDriverAvatarSlugs = new Set([
  "alexander-albon",
  "andrea-kimi-antonelli",
  "arvid-lindblad",
  "carlos-sainz",
  "charles-leclerc",
  "esteban-ocon",
  "fernando-alonso",
  "franco-colapinto",
  "gabriel-bortoleto",
  "george-russell",
  "isack-hadjar",
  "lance-stroll",
  "lando-norris",
  "lewis-hamilton",
  "liam-lawson",
  "max-verstappen",
  "nico-hulkenberg",
  "oliver-bearman",
  "oscar-piastri",
  "pierre-gasly",
  "sergio-perez",
  "valtteri-bottas",
]);

type DriverAvatarBadgeProps = {
  className?: string;
  color?: string | null;
  name: string;
  sizes?: string;
  slug?: string | null;
};

export function DriverAvatarBadge({
  className,
  color,
  name,
  sizes = "3rem",
  slug,
}: DriverAvatarBadgeProps) {
  const src = slug && localDriverAvatarSlugs.has(slug) ? `/drivers/avatars/${slug}.png` : null;

  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 bg-[oklch(0.21_0.014_250)]",
        className,
      )}
      style={{ borderColor: color ?? "var(--border)" }}
      title={name}
    >
      {src ? (
        <Image alt="" className="object-cover object-top" fill sizes={sizes} src={src} />
      ) : (
        <span className="font-display text-xs font-bold text-muted-foreground">
          {getInitials(name)}
        </span>
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
