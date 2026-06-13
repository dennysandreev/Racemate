"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const allowedReactions = new Set(["🔥", "🏁", "👀"]);

export async function reactToArticle(formData: FormData) {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect("/news");
  }

  const articleId = String(formData.get("articleId") ?? "");
  const reaction = String(formData.get("reaction") ?? "");

  if (!articleId || !allowedReactions.has(reaction)) {
    redirect("/news");
  }

  const { data: existing } = await supabase
    .from("article_reactions")
    .select("reaction")
    .eq("article_id", articleId)
    .eq("user_id", user.id)
    .eq("reaction", reaction)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("article_reactions")
      .delete()
      .eq("article_id", articleId)
      .eq("user_id", user.id)
      .eq("reaction", reaction);
  } else {
    await supabase.from("article_reactions").insert({
      article_id: articleId,
      user_id: user.id,
      reaction,
    });
  }

  revalidatePath("/news");
  revalidatePath(`/news/${articleId}`);
  redirect(`/news/${articleId}`);
}
