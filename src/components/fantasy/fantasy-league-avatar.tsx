import Image from "next/image";

import { cn } from "@/lib/utils";

export function FantasyLeagueAvatar({
  avatarUrl,
  className,
  name,
}: {
  avatarUrl?: string | null;
  className?: string;
  name: string;
}) {
  return (
    <span
      aria-label={`Обложка лиги: ${name}`}
      className={cn(
        "relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-border/80 bg-secondary/55 font-display text-sm font-extrabold text-primary shadow-sm",
        className,
      )}
      title={name}
    >
      {avatarUrl ? (
        <Image alt="" className="object-cover" fill sizes="128px" src={avatarUrl} unoptimized />
      ) : (
        getInitials(name)
      )}
    </span>
  );
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "RM";
}
