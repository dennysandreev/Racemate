"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function votePoll(formData: FormData) {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect("/polls");
  }

  const limit = consumeRateLimit("polls:vote", `user:${user.id}`, 20, 60 * 1_000);

  if (!limit.ok) {
    redirect("/polls?error=vote");
  }

  const pollId = String(formData.get("pollId") ?? "");
  const optionId = String(formData.get("optionId") ?? "");

  if (!pollId || !optionId) {
    redirect("/polls");
  }

  const [{ data: poll }, { data: option }] = await Promise.all([
    supabase
      .from("polls")
      .select("id, status, closes_at, races(status)")
      .eq("id", pollId)
      .maybeSingle(),
    supabase
      .from("poll_options")
      .select("id")
      .eq("id", optionId)
      .eq("poll_id", pollId)
      .maybeSingle(),
  ]);
  const race = Array.isArray(poll?.races) ? poll.races[0] : poll?.races;
  const closesAt = poll?.closes_at ? new Date(poll.closes_at).getTime() : null;
  const pollClosed =
    !poll ||
    !option ||
    poll.status !== "published" ||
    race?.status === "completed" ||
    race?.status === "finished" ||
    (closesAt !== null && closesAt <= Date.now());

  if (pollClosed) {
    redirect("/polls?error=closed");
  }

  const { error } = await supabase.from("poll_votes").insert({
    poll_id: pollId,
    option_id: optionId,
    user_id: user.id,
  });

  if (error) {
    redirect(error.code === "23505" ? "/polls?error=already-voted" : "/polls?error=vote");
  }

  revalidatePath("/polls");
  redirect("/polls?voted=1");
}
