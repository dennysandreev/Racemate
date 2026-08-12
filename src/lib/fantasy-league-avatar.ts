import { getSupabaseEnv } from "@/lib/env";
import {
  FANTASY_LEAGUE_AVATAR_BUCKET,
  getFantasyLeagueAvatarStoragePath,
} from "@/lib/fantasy-league-avatar-image";

export * from "@/lib/fantasy-league-avatar-image";

export function getFantasyLeagueAvatarUrl({
  avatarPath,
  avatarUpdatedAt,
  leagueId,
}: {
  avatarPath?: string | null;
  avatarUpdatedAt?: string | null;
  leagueId: string;
}) {
  if (!avatarPath || avatarPath !== getFantasyLeagueAvatarStoragePath(leagueId)) {
    return null;
  }

  const env = getSupabaseEnv();

  if (!env) {
    return null;
  }

  const encodedPath = avatarPath.split("/").map(encodeURIComponent).join("/");
  const version = avatarUpdatedAt ? Date.parse(avatarUpdatedAt) : 0;
  const versionQuery = Number.isFinite(version) && version > 0 ? `?v=${version}` : "";

  return `${env.url}/storage/v1/object/public/${FANTASY_LEAGUE_AVATAR_BUCKET}/${encodedPath}${versionQuery}`;
}
