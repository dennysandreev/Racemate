"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function addFavoriteDriver(formData: FormData) {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const driverId = String(formData.get("driverId") ?? "");
  const season = String(formData.get("season") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const profileHref = slug
    ? `/drivers/${slug}${/^\d{4}$/.test(season) ? `?season=${season}` : ""}`
    : "/";

  if (!supabase || !driverId || !slug) {
    redirect(profileHref);
  }

  const { data } = await supabase
    .from("user_favorite_drivers")
    .select("driver_id")
    .eq("user_id", user.id);
  const favoriteIds = (data ?? []).map((row) => row.driver_id);

  if (!favoriteIds.includes(driverId) && favoriteIds.length < 2) {
    await supabase.from("user_favorite_drivers").insert({
      user_id: user.id,
      driver_id: driverId,
    });
  }

  revalidatePath(`/drivers/${slug}`);
  revalidatePath("/account");
  redirect(profileHref);
}
