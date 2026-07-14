"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionUser, requireUser } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function votePoll(formData: FormData) {
  const user = await requireUser();
  const pollId = String(formData.get("pollId") ?? "");
  const optionId = String(formData.get("optionId") ?? "");
  const result = await recordPollVote({ optionId, pollId, userId: user.id });

  if (!result.ok) {
    redirect(result.reason === "closed" ? "/polls?error=closed" : result.reason === "already-voted" ? "/polls?error=already-voted" : "/polls?error=vote");
  }

  revalidatePath("/");
  revalidatePath("/polls");
  redirect("/polls?voted=1");
}

export async function votePollFromHome(pollId: string, optionId: string) {
  const user = await getSessionUser();

  if (!user) {
    return { ok: false, reason: "auth-required" } as const;
  }

  const result = await recordPollVote({ optionId, pollId, userId: user.id });

  if (result.ok) {
    revalidatePath("/");
    revalidatePath("/polls");
  }

  return result;
}

async function recordPollVote({
  optionId,
  pollId,
  userId,
}: {
  optionId: string;
  pollId: string;
  userId: string;
}): Promise<
  | { ok: true }
  | { ok: false; reason: "already-voted" | "closed" | "invalid" | "rate-limit" | "unavailable" }
> {
  if (!pollId || !optionId) {
    return { ok: false, reason: "invalid" };
  }

  const limit = consumeRateLimit("polls:vote", `user:${userId}`, 20, 60 * 1_000);

  if (!limit.ok) {
    return { ok: false, reason: "rate-limit" };
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return { ok: false, reason: "unavailable" };
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
    return { ok: false, reason: "closed" };
  }

  const { error } = await supabase.from("poll_votes").insert({
    poll_id: pollId,
    option_id: optionId,
    user_id: userId,
  });

  if (error) {
    return { ok: false, reason: error.code === "23505" ? "already-voted" : "unavailable" };
  }

  return { ok: true };
}
