"use server";

import { revalidatePath } from "next/cache";

import {
  FANTASY_LEAGUE_AVATAR_BUCKET,
  FANTASY_LEAGUE_AVATAR_DIMENSION,
  FANTASY_LEAGUE_AVATAR_MAX_BYTES,
  getFantasyLeagueAvatarStoragePath,
  getFantasyLeagueAvatarUrl,
  readFantasyLeagueAvatarWebpDimensions,
} from "@/lib/fantasy-league-avatar";
import { requireUser } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export type FantasyLeagueAvatarActionResult = {
  avatarUrl?: string | null;
  message: string;
  ok: boolean;
};

export async function uploadFantasyLeagueAvatar(
  formData: FormData,
): Promise<FantasyLeagueAvatarActionResult> {
  const user = await requireUser();
  const admin = createSupabaseAdminClient();
  const leagueId = String(formData.get("leagueId") ?? "").trim();
  const file = formData.get("avatar");

  if (!admin || !leagueId) {
    return { message: "Загрузка временно недоступна.", ok: false };
  }

  const { data: league } = await admin
    .from("prediction_leagues")
    .select("id, owner_user_id")
    .eq("id", leagueId)
    .maybeSingle();

  if (!league || league.owner_user_id !== user.id) {
    return { message: "Изменить обложку может только создатель лиги.", ok: false };
  }

  const rateLimit = consumeRateLimit(
    "fantasy:league-avatar:upload",
    `user:${user.id}:league:${leagueId}`,
    12,
    60 * 60 * 1_000,
  );

  if (!rateLimit.ok) {
    return { message: "Слишком много загрузок. Попробуй позже.", ok: false };
  }

  if (!(file instanceof File) || file.size === 0) {
    return { message: "Выбери изображение для лиги.", ok: false };
  }

  if (file.type !== "image/webp" || file.size > FANTASY_LEAGUE_AVATAR_MAX_BYTES) {
    return { message: "Не удалось подготовить изображение. Выбери другой файл.", ok: false };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const dimensions = readFantasyLeagueAvatarWebpDimensions(bytes);

  if (
    !dimensions ||
    dimensions.width !== FANTASY_LEAGUE_AVATAR_DIMENSION ||
    dimensions.height !== FANTASY_LEAGUE_AVATAR_DIMENSION
  ) {
    return { message: "Изображение должно быть квадратным. Попробуй другой файл.", ok: false };
  }

  const avatarPath = getFantasyLeagueAvatarStoragePath(leagueId);
  const updatedAt = new Date().toISOString();
  const { error: uploadError } = await admin.storage
    .from(FANTASY_LEAGUE_AVATAR_BUCKET)
    .upload(avatarPath, bytes, {
      cacheControl: "3600",
      contentType: "image/webp",
      upsert: true,
    });

  if (uploadError) {
    return { message: "Не получилось загрузить изображение. Попробуй ещё раз.", ok: false };
  }

  const { error: leagueError } = await admin
    .from("prediction_leagues")
    .update({ avatar_path: avatarPath, avatar_updated_at: updatedAt })
    .eq("id", leagueId)
    .eq("owner_user_id", user.id);

  if (leagueError) {
    return { message: "Не получилось сохранить изображение лиги.", ok: false };
  }

  revalidateLeagueAvatarViews(leagueId);

  return {
    avatarUrl: getFantasyLeagueAvatarUrl({ avatarPath, avatarUpdatedAt: updatedAt, leagueId }),
    message: "Обложка лиги обновлена.",
    ok: true,
  };
}

export async function removeFantasyLeagueAvatar(
  leagueId: string,
): Promise<FantasyLeagueAvatarActionResult> {
  const user = await requireUser();
  const admin = createSupabaseAdminClient();

  if (!admin || !leagueId) {
    return { message: "Удаление временно недоступно.", ok: false };
  }

  const { data: league } = await admin
    .from("prediction_leagues")
    .select("owner_user_id")
    .eq("id", leagueId)
    .maybeSingle();

  if (!league || league.owner_user_id !== user.id) {
    return { message: "Удалить обложку может только создатель лиги.", ok: false };
  }

  const { error } = await admin
    .from("prediction_leagues")
    .update({ avatar_path: null, avatar_updated_at: null })
    .eq("id", leagueId)
    .eq("owner_user_id", user.id);

  if (error) {
    return { message: "Не получилось удалить обложку.", ok: false };
  }

  await admin.storage
    .from(FANTASY_LEAGUE_AVATAR_BUCKET)
    .remove([getFantasyLeagueAvatarStoragePath(leagueId)]);
  revalidateLeagueAvatarViews(leagueId);

  return { avatarUrl: null, message: "Обложка лиги удалена.", ok: true };
}

function revalidateLeagueAvatarViews(leagueId: string) {
  revalidatePath("/fantasy");
  revalidatePath(`/fantasy/leagues/${leagueId}`);
}
