import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { getTeamAsset } from "@/data/f1-assets";
import { cn } from "@/lib/utils";
import type { NewsItem } from "@/types/racemate";

type NewsTagBadgeProps = {
  className?: string;
  href?: string;
  tag: NewsItem["tags"][number];
};

export function NewsTagBadge({ className, href, tag }: NewsTagBadgeProps) {
  const team = tag.type === "team" ? getTeamAsset(tag.name) : null;
  const badge = (
    <Badge
      className={cn(className, team && "text-foreground")}
      style={team?.color ? { backgroundColor: `${team.color}24`, borderColor: `${team.color}a6` } : undefined}
      variant={team ? "outline" : "secondary"}
    >
      {tag.name}
    </Badge>
  );

  return href ? (
    <Link className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={href}>
      {badge}
    </Link>
  ) : badge;
}
