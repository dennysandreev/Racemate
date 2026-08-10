"use server";

import { revalidatePath } from "next/cache";

import { finishAdminAudit, startAdminAudit } from "@/lib/admin-audit";
import {
  getAdminAiPromptDefinition,
  makeAdminAiPromptChecksum,
  validateAdminAiPromptContent,
  validateAdminAiRuntime,
} from "@/lib/admin-ai-prompts";
import { getAdminJobDefinition } from "@/lib/admin-job-catalog";
import { enqueueAdminJob } from "@/lib/admin-jobs-server";
import {
  buildNewsEditorialUpdate,
  canReplacePollOptions,
  canTransitionAdminStatus,
} from "@/lib/admin-policies";
import { requireAdmin } from "@/lib/auth";
import { loadOpenRouterModels } from "@/lib/openrouter-models";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { AdminActionResult } from "@/types/admin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function transitionAdminFindingAction(
  _previousState: AdminActionResult,
  formData: FormData,
): Promise<AdminActionResult> {
  const user = await requireAdmin();
  const admin = createSupabaseAdminClient();
  const findingId = uuid(formData, "findingId");
  const status = enumValue(formData, "status", ["acknowledged", "resolved", "ignored"]);
  const resolution = optionalText(formData, "resolution", 1_000);

  if (!admin || !findingId || !status) return { ok: false, message: "Находка не найдена." };
  const { data: before, error } = await admin
    .from("admin_findings")
    .select("id, status, severity, title")
    .eq("id", findingId)
    .maybeSingle();
  if (error || !before) return { ok: false, message: "Находка не найдена." };
  const auditId = await startAdminAudit(admin, {
    actorUserId: user.id,
    action: `finding.${status}`,
    entityType: "admin_finding",
    entityId: findingId,
    beforeData: before,
  });

  try {
    const { error: transitionError } = await admin.rpc("transition_admin_finding", {
      p_finding_id: findingId,
      p_status: status,
      p_actor_kind: "human",
      p_actor_user_id: user.id,
      p_resolution: resolution,
    });
    if (transitionError) throw transitionError;
    await finishAdminAudit(admin, auditId, {
      outcome: "succeeded",
      afterData: { status, resolution },
    });
    revalidateAdminPaths(["/admin", "/admin/findings"]);
    return {
      ok: true,
      message: status === "acknowledged"
        ? "Находка принята в работу."
        : status === "resolved"
          ? "Находка отмечена как исправленная."
          : "Находка больше не требует действий.",
    };
  } catch (transitionError) {
    await finishAdminAudit(admin, auditId, { outcome: "failed", error: transitionError });
    return actionError(transitionError, "Не удалось обновить находку.");
  }
}

export async function saveAdminAgentSettingsAction(
  _previousState: AdminActionResult,
  formData: FormData,
): Promise<AdminActionResult> {
  const user = await requireAdmin();
  const admin = createSupabaseAdminClient();
  const mode = enumValue(formData, "mode", ["shadow", "recommend"]);
  const isEnabled = text(formData, "isEnabled", 8) === "true";
  const telegramAlertsEnabled = text(formData, "telegramAlertsEnabled", 8) === "true";

  if (!admin || !mode) return { ok: false, message: "Проверь настройки наблюдения." };
  const { data: before, error } = await admin
    .from("admin_agent_settings")
    .select("is_enabled, mode, telegram_alerts_enabled, r2_actions_enabled, shadow_started_at")
    .eq("singleton", true)
    .single();
  if (error) return { ok: false, message: "Настройки наблюдения недоступны." };
  const auditId = await startAdminAudit(admin, {
    actorUserId: user.id,
    action: "agent.settings.update",
    entityType: "admin_agent_settings",
    entityId: "singleton",
    beforeData: before,
  });
  const update = {
    is_enabled: isEnabled,
    mode,
    telegram_alerts_enabled: telegramAlertsEnabled,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  };
  const { error: updateError } = await admin
    .from("admin_agent_settings")
    .update(update)
    .eq("singleton", true);

  if (updateError) {
    await finishAdminAudit(admin, auditId, { outcome: "failed", error: updateError });
    return actionError(updateError, "Не удалось сохранить настройки.");
  }
  await finishAdminAudit(admin, auditId, { outcome: "succeeded", afterData: update });
  revalidateAdminPaths(["/admin/findings"]);
  return {
    ok: true,
    message: isEnabled ? "Наблюдение включено." : "Наблюдение остановлено.",
  };
}

export async function runAdminJobAction(
  _previousState: AdminActionResult,
  formData: FormData,
): Promise<AdminActionResult> {
  const user = await requireAdmin();
  const admin = createSupabaseAdminClient();

  if (!admin) return { ok: false, message: "Серверный клиент недоступен." };
  const jobName = text(formData, "jobName", 120);
  const definition = getAdminJobDefinition(jobName);
  const rateLimit = consumeRateLimit("admin:queue-job", `user:${user.id}`, 12, 60_000);

  if (!definition) return { ok: false, message: "Эту задачу нельзя запускать из админки." };
  if (!rateLimit.ok) return { ok: false, message: "Слишком много запусков. Подожди минуту." };

  const args = Object.fromEntries(
    definition.parameters
      .map((parameter) => [parameter.name, formData.get(parameter.name)])
      .filter(([, value]) => value !== null && value !== ""),
  );
  const auditId = await startAdminAudit(admin, {
    actorUserId: user.id,
    action: "job.enqueue",
    entityType: "job",
    entityId: jobName,
    metadata: { args },
  });

  try {
    const queued = await enqueueAdminJob(admin, {
      args,
      jobName,
      requestedBy: user.id,
      requestKey: text(formData, "requestKey", 120) || undefined,
    });

    if (!queued.ok) {
      await finishAdminAudit(admin, auditId, { outcome: "failed", error: queued.message });
      return { ok: false, message: queued.message };
    }
    await finishAdminAudit(admin, auditId, {
      outcome: "succeeded",
      afterData: { jobRunId: queued.jobRunId },
    });
    revalidateAdminPaths(["/admin", "/admin/jobs"]);
    return {
      ok: true,
      message: `«${queued.definition.title}» добавлена в очередь.`,
      data: { jobRunId: queued.jobRunId },
    };
  } catch (error) {
    await finishAdminAudit(admin, auditId, { outcome: "failed", error });
    return actionError(error, "Не удалось добавить задачу в очередь.");
  }
}

export async function retryAdminJobAction(
  _previousState: AdminActionResult,
  formData: FormData,
): Promise<AdminActionResult> {
  const user = await requireAdmin();
  const admin = createSupabaseAdminClient();
  const jobRunId = uuid(formData, "jobRunId");

  if (!admin || !jobRunId) return { ok: false, message: "Запуск не найден." };
  const { data: previous, error } = await admin
    .from("job_runs")
    .select("id, job_name, status, metadata, queue_version")
    .eq("id", jobRunId)
    .maybeSingle();

  if (error || !previous) return { ok: false, message: "Запуск не найден." };
  if (previous.status !== "failed" && !(previous.status === "queued" && previous.queue_version !== 1)) {
    return { ok: false, message: "Повтор доступен только для ошибки или прежнего запроса." };
  }
  const args = isRecord(previous.metadata) && isRecord(previous.metadata.args)
    ? previous.metadata.args
    : {};
  const auditId = await startAdminAudit(admin, {
    actorUserId: user.id,
    action: "job.retry",
    entityType: "job_run",
    entityId: jobRunId,
    beforeData: { status: previous.status, jobName: previous.job_name },
  });

  try {
    const queued = await enqueueAdminJob(admin, {
      args,
      jobName: previous.job_name,
      requestedBy: user.id,
      retryOf: previous.id,
    });
    if (!queued.ok) {
      await finishAdminAudit(admin, auditId, { outcome: "failed", error: queued.message });
      return { ok: false, message: queued.message };
    }
    await finishAdminAudit(admin, auditId, {
      outcome: "succeeded",
      afterData: { jobRunId: queued.jobRunId },
    });
    revalidateAdminPaths(["/admin", "/admin/jobs"]);
    return { ok: true, message: "Повтор добавлен в очередь." };
  } catch (retryError) {
    await finishAdminAudit(admin, auditId, { outcome: "failed", error: retryError });
    return actionError(retryError, "Не удалось повторить задачу.");
  }
}

export async function saveNewsArticleAction(
  _previousState: AdminActionResult,
  formData: FormData,
): Promise<AdminActionResult> {
  const user = await requireAdmin();
  const admin = createSupabaseAdminClient();
  const articleId = uuid(formData, "articleId");
  const publicationStatus = enumValue(formData, "publicationStatus", ["draft", "published", "rejected"]);
  const title = optionalText(formData, "title", 240);
  const summary = optionalText(formData, "summary", 1_500);
  const body = optionalText(formData, "body", 20_000);
  const tagNames = parseTags(text(formData, "tags", 800));

  if (!admin || !articleId || !publicationStatus) {
    return { ok: false, message: "Проверь материал и выбранное действие." };
  }
  const { data: before, error } = await admin
    .from("news_articles")
    .select("id, slug, ai_title_ru, ai_summary_ru, ai_summary_long_ru, publication_status, published_at")
    .eq("id", articleId)
    .maybeSingle();
  if (error || !before) return { ok: false, message: "Материал не найден." };
  const currentEditorialStatus = ["draft", "published", "rejected"].includes(before.publication_status)
    ? before.publication_status
    : "draft";
  if (!canTransitionAdminStatus("news", currentEditorialStatus, publicationStatus)) {
    return { ok: false, message: "Такое изменение состояния материала не разрешено." };
  }
  const auditId = await startAdminAudit(admin, {
    actorUserId: user.id,
    action: "news.update",
    entityType: "news_article",
    entityId: articleId,
    beforeData: before,
  });

  try {
    const now = new Date().toISOString();
    const editorialUpdate = buildNewsEditorialUpdate({
      actorUserId: user.id,
      body,
      currentPublishedAt: before.published_at,
      currentSlug: before.slug,
      nextStatus: publicationStatus,
      now,
      summary,
      title,
    });
    const { error: updateError } = await admin
      .from("news_articles")
      .update(editorialUpdate.update)
      .eq("id", articleId);
    if (updateError) throw updateError;
    await replaceAdminNewsTags(admin, articleId, tagNames);
    await finishAdminAudit(admin, auditId, {
      outcome: "succeeded",
      afterData: { publicationStatus, title, summary, body, tagNames, slug: before.slug },
    });
    revalidateAdminPaths(["/admin", "/admin/news", "/news", `/news/${before.slug}`]);
    return {
      ok: true,
      message: publicationStatus === "published"
        ? "Материал опубликован."
        : publicationStatus === "draft"
          ? "Материал снят с публикации."
          : "Материал отклонён.",
    };
  } catch (saveError) {
    await finishAdminAudit(admin, auditId, { outcome: "failed", error: saveError });
    return actionError(saveError, "Не удалось сохранить материал.");
  }
}

export async function reprocessNewsArticleAction(
  _previousState: AdminActionResult,
  formData: FormData,
): Promise<AdminActionResult> {
  const user = await requireAdmin();
  const admin = createSupabaseAdminClient();
  const articleId = uuid(formData, "articleId");
  const mode = enumValue(formData, "mode", ["ai", "dedup"]);

  if (!admin || !articleId || !mode) return { ok: false, message: "Материал не найден." };
  const jobName = mode === "ai" ? "ai.process_news" : "news.retry_dedup";
  const { data: before, error: readError } = await admin
    .from("news_articles")
    .select("status, publication_status, duplicate_of, dedup_status")
    .eq("id", articleId)
    .maybeSingle();
  if (readError || !before) return { ok: false, message: "Материал не найден." };
  const auditId = await startAdminAudit(admin, {
    actorUserId: user.id,
    action: mode === "ai" ? "news.reprocess_ai" : "news.reprocess_dedup",
    entityType: "news_article",
    entityId: articleId,
    beforeData: before,
  });
  let articleUpdated = false;

  try {
    const { error } = await admin
      .from("news_articles")
      .update(
        mode === "ai"
          ? { status: "pending", publication_status: "processing", duplicate_of: null }
          : { status: "processed", publication_status: "processing_dedup", dedup_status: "pending" },
      )
      .eq("id", articleId);
    if (error) throw error;
    articleUpdated = true;
    const queued = await enqueueAdminJob(admin, {
      args: { articleId },
      jobName,
      requestedBy: user.id,
    });
    if (!queued.ok) throw new Error(queued.message);
    await finishAdminAudit(admin, auditId, {
      outcome: "succeeded",
      afterData: { jobRunId: queued.jobRunId },
    });
    revalidateAdminPaths(["/admin/news", "/admin/jobs"]);
    return { ok: true, message: "Материал добавлен в повторную обработку." };
  } catch (reprocessError) {
    if (articleUpdated) {
      await admin
        .from("news_articles")
        .update(before)
        .eq("id", articleId);
    }
    await finishAdminAudit(admin, auditId, { outcome: "failed", error: reprocessError });
    return actionError(reprocessError, "Не удалось запустить повторную обработку.");
  }
}

export async function toggleNewsSourceAction(
  _previousState: AdminActionResult,
  formData: FormData,
): Promise<AdminActionResult> {
  const user = await requireAdmin();
  const admin = createSupabaseAdminClient();
  const sourceId = uuid(formData, "sourceId");
  if (!admin || !sourceId) return { ok: false, message: "Источник не найден." };
  const { data: source } = await admin.from("news_sources").select("id, name, is_active").eq("id", sourceId).maybeSingle();
  if (!source) return { ok: false, message: "Источник не найден." };
  const auditId = await startAdminAudit(admin, {
    actorUserId: user.id,
    action: source.is_active ? "news_source.pause" : "news_source.resume",
    entityType: "news_source",
    entityId: sourceId,
    beforeData: source,
  });
  const { error } = await admin.from("news_sources").update({ is_active: !source.is_active }).eq("id", sourceId);
  if (error) {
    await finishAdminAudit(admin, auditId, { outcome: "failed", error });
    return actionError(error, "Не удалось изменить источник.");
  }
  await finishAdminAudit(admin, auditId, { outcome: "succeeded", afterData: { isActive: !source.is_active } });
  revalidateAdminPaths(["/admin", "/admin/news"]);
  return { ok: true, message: source.is_active ? "Источник поставлен на паузу." : "Источник включён." };
}

export async function moderateSocialPostAction(
  _previousState: AdminActionResult,
  formData: FormData,
): Promise<AdminActionResult> {
  const user = await requireAdmin();
  const admin = createSupabaseAdminClient();
  const postId = uuid(formData, "postId");
  const action = enumValue(formData, "moderationAction", ["publish", "reject", "retry"]);
  const topic = enumValue(formData, "topic", [
    "social-race-weekend",
    "social-technical",
    "social-transfers",
    "social-statements",
    "social-incidents",
    "social-rumors",
    "social-discussion",
  ]);
  if (!admin || !postId || !action) return { ok: false, message: "Публикация не найдена." };
  const { data: before } = await admin.from("social_posts").select("id, status, platform, ai_title_ru").eq("id", postId).maybeSingle();
  if (!before) return { ok: false, message: "Публикация не найдена." };
  const auditId = await startAdminAudit(admin, {
    actorUserId: user.id,
    action: `social.${action}`,
    entityType: "social_post",
    entityId: postId,
    beforeData: before,
  });

  try {
    if (topic) {
      const topicNames: Record<string, string> = {
        "social-race-weekend": "Этап и результаты",
        "social-technical": "Техника и регламент",
        "social-transfers": "Трансферы и контракты",
        "social-statements": "Комментарии команд и гонщиков",
        "social-incidents": "Инциденты и штрафы",
        "social-rumors": "Слухи",
        "social-discussion": "Обсуждения",
      };
      const { data: tag, error: tagError } = await admin
        .from("tags")
        .upsert({ type: "social_topic", slug: topic, name: topicNames[topic] }, { onConflict: "slug" })
        .select("id")
        .single();
      if (tagError) throw tagError;
      const { data: relations, error: relationsError } = await admin
        .from("social_post_tags")
        .select("tag_id")
        .eq("post_id", postId);
      if (relationsError) throw relationsError;
      const relationTagIds = (relations ?? []).map((relation) => relation.tag_id);
      const { data: relationTags, error: relationTagsError } = relationTagIds.length
        ? await admin.from("tags").select("id, type").in("id", relationTagIds)
        : { data: [], error: null };
      if (relationTagsError) throw relationTagsError;
      const previousTopicIds = (relationTags ?? []).filter((tagItem) => tagItem.type === "social_topic").map((tagItem) => tagItem.id);
      if (previousTopicIds.length) {
        const { error: deleteError } = await admin.from("social_post_tags").delete().eq("post_id", postId).in("tag_id", previousTopicIds);
        if (deleteError) throw deleteError;
      }
      const { error: relationError } = await admin.from("social_post_tags").upsert({
        post_id: postId,
        tag_id: tag.id,
        confidence: 1,
        method: "admin",
        is_primary: true,
      }, { onConflict: "post_id,tag_id" });
      if (relationError) throw relationError;
    }
    if (action === "retry") {
      const { error } = await admin.from("social_posts").update({ status: "pending", next_retry_at: new Date().toISOString(), last_processing_error: null }).eq("id", postId);
      if (error) throw error;
      const queued = await enqueueAdminJob(admin, {
        args: { postId },
        jobName: "social.process_ai",
        requestedBy: user.id,
      });
      if (!queued.ok) throw new Error(queued.message);
    } else {
      const { error } = await admin.from("social_posts").update({ status: action === "publish" ? "published" : "rejected", next_retry_at: null }).eq("id", postId);
      if (error) throw error;
    }
    await finishAdminAudit(admin, auditId, { outcome: "succeeded", afterData: { action, topic } });
    revalidateAdminPaths(["/admin", "/admin/social", "/social"]);
    return { ok: true, message: action === "publish" ? "Публикация вышла в ленту." : action === "reject" ? "Публикация отклонена." : "Повторная обработка запущена." };
  } catch (moderationError) {
    await finishAdminAudit(admin, auditId, { outcome: "failed", error: moderationError });
    return actionError(moderationError, "Не удалось обработать публикацию.");
  }
}

export async function saveSocialSourceAction(
  _previousState: AdminActionResult,
  formData: FormData,
): Promise<AdminActionResult> {
  const user = await requireAdmin();
  const admin = createSupabaseAdminClient();
  const platform = enumValue(formData, "platform", ["x", "reddit", "telegram"]);
  const name = text(formData, "name", 120);
  const rawUrl = text(formData, "url", 2_048);
  const externalKey = text(formData, "externalKey", 160).replace(/^@/, "");
  const publicationMode = enumValue(formData, "publicationMode", ["auto", "review"]) ?? "review";
  const interval = clampNumber(text(formData, "fetchIntervalMinutes", 10), 5, 1_440, 15);

  if (!admin || !platform || !name || !externalKey) {
    return { ok: false, message: "Проверь площадку, название и адрес источника." };
  }
  const url = normalizeSocialSourceUrl(platform, rawUrl, externalKey);
  if (!url) return { ok: false, message: "Адрес источника не похож на рабочую ссылку." };
  const adapter = platform === "x"
    ? "x-api-user"
    : platform === "reddit"
      ? "reddit-oauth"
      : "telegram-mtproto";
  const auditId = await startAdminAudit(admin, {
    actorUserId: user.id,
    action: "social_source.save",
    entityType: "social_source",
    metadata: { platform, name, url, publicationMode, interval },
  });
  try {
    const { data, error } = await admin.from("social_sources").upsert({
      platform,
      name,
      url,
      external_key: externalKey,
      adapter,
      source_type: "api",
      feed_kind: platform === "reddit" ? "new" : platform === "x" ? "user" : "channel",
      trust_level: platform === "reddit" ? "community" : "media",
      publication_mode: publicationMode,
      fetch_interval_minutes: interval,
      initial_backfill_days: 30,
      include_reposts: formData.get("includeReposts") === "on",
      include_replies: formData.get("includeReplies") === "on",
      next_fetch_at: new Date().toISOString(),
      is_active: true,
    }, { onConflict: "platform,url" }).select("id").single();
    if (error) throw error;
    await finishAdminAudit(admin, auditId, { outcome: "succeeded", afterData: { sourceId: data.id } });
    revalidateAdminPaths(["/admin", "/admin/social"]);
    return { ok: true, message: "Источник сохранён." };
  } catch (sourceError) {
    await finishAdminAudit(admin, auditId, { outcome: "failed", error: sourceError });
    return actionError(sourceError, "Не удалось сохранить источник.");
  }
}

export async function toggleSocialSourceAction(
  _previousState: AdminActionResult,
  formData: FormData,
): Promise<AdminActionResult> {
  const user = await requireAdmin();
  const admin = createSupabaseAdminClient();
  const sourceId = uuid(formData, "sourceId");
  if (!admin || !sourceId) return { ok: false, message: "Источник не найден." };
  const { data: source } = await admin.from("social_sources").select("id, platform, name, is_active").eq("id", sourceId).maybeSingle();
  if (!source) return { ok: false, message: "Источник не найден." };
  const auditId = await startAdminAudit(admin, {
    actorUserId: user.id,
    action: source.is_active ? "social_source.pause" : "social_source.resume",
    entityType: "social_source",
    entityId: sourceId,
    beforeData: source,
  });
  const { error } = await admin.from("social_sources").update({ is_active: !source.is_active }).eq("id", sourceId);
  if (error) {
    await finishAdminAudit(admin, auditId, { outcome: "failed", error });
    return actionError(error, "Не удалось изменить источник.");
  }
  await finishAdminAudit(admin, auditId, { outcome: "succeeded", afterData: { isActive: !source.is_active } });
  revalidateAdminPaths(["/admin", "/admin/social", "/social"]);
  return { ok: true, message: source.is_active ? "Источник поставлен на паузу." : "Источник включён." };
}

export async function addManualXPostAction(
  _previousState: AdminActionResult,
  formData: FormData,
): Promise<AdminActionResult> {
  const user = await requireAdmin();
  const admin = createSupabaseAdminClient();
  const url = normalizeHttpsUrl(text(formData, "url", 2_048));
  const author = optionalText(formData, "author", 100);
  const title = optionalText(formData, "title", 500);
  const imageUrl = normalizeHttpsUrl(text(formData, "imageUrl", 2_048)) || null;
  if (!admin || !url || !isXUrl(url)) return { ok: false, message: "Нужна ссылка на публикацию в X." };
  const auditId = await startAdminAudit(admin, {
    actorUserId: user.id,
    action: "social.manual_x",
    entityType: "social_post",
    metadata: { url, author, title, imageUrl },
  });
  try {
    const { data: source, error: sourceError } = await admin.from("social_sources").upsert({
      platform: "x",
      name: "Ручные публикации X",
      source_type: "manual",
      url: "manual:x",
      adapter: "manual",
      feed_kind: "manual",
      is_active: true,
    }, { onConflict: "platform,url" }).select("id").single();
    if (sourceError) throw sourceError;
    const { data: post, error } = await admin.from("social_posts").upsert({
      platform: "x",
      source_id: source.id,
      external_id: url.match(/\/status\/(\d+)/i)?.[1] ?? url,
      author,
      title: title ?? "Публикация из X",
      body: title,
      original_url: url,
      image_url: imageUrl,
      published_at: new Date().toISOString(),
      popularity_score: 0,
      status: "review",
      last_synced_at: new Date().toISOString(),
    }, { onConflict: "platform,external_id" }).select("id").single();
    if (error) throw error;
    await finishAdminAudit(admin, auditId, { outcome: "succeeded", afterData: { postId: post.id } });
    revalidateAdminPaths(["/admin/social", "/social"]);
    return { ok: true, message: "Публикация добавлена на проверку." };
  } catch (postError) {
    await finishAdminAudit(admin, auditId, { outcome: "failed", error: postError });
    return actionError(postError, "Не удалось добавить публикацию.");
  }
}

export async function saveGrandPrixReportAction(
  _previousState: AdminActionResult,
  formData: FormData,
): Promise<AdminActionResult> {
  const user = await requireAdmin();
  const admin = createSupabaseAdminClient();
  const reportId = uuid(formData, "reportId");
  const summary = optionalText(formData, "summary", 8_000);
  const isHidden = formData.get("isHidden") === "true";
  if (!admin || !reportId) return { ok: false, message: "Отчёт не найден." };
  const { data: before } = await admin.from("grand_prix_reports").select("id, race_slug, ai_summary, is_hidden, status").eq("id", reportId).maybeSingle();
  if (!before) return { ok: false, message: "Отчёт не найден." };
  const auditId = await startAdminAudit(admin, {
    actorUserId: user.id,
    action: "report.update",
    entityType: "grand_prix_report",
    entityId: reportId,
    beforeData: before,
  });
  const { error } = await admin.from("grand_prix_reports").update({
    ai_summary: summary,
    is_hidden: isHidden,
    summary_status: summary ? "edited" : "pending",
    status: summary ? "ready" : "partial",
  }).eq("id", reportId);
  if (error) {
    await finishAdminAudit(admin, auditId, { outcome: "failed", error });
    return actionError(error, "Не удалось сохранить отчёт.");
  }
  await finishAdminAudit(admin, auditId, { outcome: "succeeded", afterData: { summary, isHidden } });
  revalidateAdminPaths(["/admin", "/admin/reports", "/", "/calendar", `/calendar/${before.race_slug}`]);
  return { ok: true, message: "Отчёт сохранён." };
}

export async function saveDigestAction(
  _previousState: AdminActionResult,
  formData: FormData,
): Promise<AdminActionResult> {
  const user = await requireAdmin();
  const admin = createSupabaseAdminClient();
  const digestId = uuid(formData, "digestId");
  const title = text(formData, "title", 240);
  const body = text(formData, "body", 20_000);
  const status = enumValue(formData, "status", ["draft", "published", "hidden"]);
  if (!admin || !digestId || !title || !body || !status) return { ok: false, message: "Проверь заголовок, текст и состояние сводки." };
  const { data: before } = await admin.from("digests").select("id, title, body_md, status").eq("id", digestId).maybeSingle();
  if (!before) return { ok: false, message: "Сводка не найдена." };
  const auditId = await startAdminAudit(admin, {
    actorUserId: user.id,
    action: "digest.update",
    entityType: "digest",
    entityId: digestId,
    beforeData: before,
  });
  const { error } = await admin.from("digests").update({ title, body_md: body, status }).eq("id", digestId);
  if (error) {
    await finishAdminAudit(admin, auditId, { outcome: "failed", error });
    return actionError(error, "Не удалось сохранить сводку.");
  }
  await finishAdminAudit(admin, auditId, { outcome: "succeeded", afterData: { title, body, status } });
  revalidateAdminPaths(["/admin/news", "/admin/reports", "/news"]);
  return { ok: true, message: "Сводка сохранена." };
}

export async function savePollAction(
  _previousState: AdminActionResult,
  formData: FormData,
): Promise<AdminActionResult> {
  const user = await requireAdmin();
  const admin = createSupabaseAdminClient();
  const pollId = optionalUuid(formData, "pollId");
  const question = text(formData, "question", 320);
  const status = enumValue(formData, "status", ["draft", "published", "closed"]);
  const closesAt = optionalText(formData, "closesAt", 60);
  const options = parseLines(text(formData, "options", 2_000), 8, 160);
  if (!admin || !question || !status || options.length < 2) {
    return { ok: false, message: "Нужен вопрос и хотя бы два варианта ответа." };
  }
  const before = pollId
    ? (await admin.from("polls").select("id, question, status, closes_at").eq("id", pollId).maybeSingle()).data
    : null;
  const auditId = await startAdminAudit(admin, {
    actorUserId: user.id,
    action: pollId ? "poll.update" : "poll.create",
    entityType: "poll",
    entityId: pollId,
    beforeData: before ?? {},
  });

  try {
    let targetPollId = pollId;
    if (pollId) {
      const { count } = await admin.from("poll_votes").select("poll_id", { count: "exact", head: true }).eq("poll_id", pollId);
      const currentPollStatus = before && ["draft", "published", "closed"].includes(before.status)
        ? before.status
        : "draft";
      if (!canTransitionAdminStatus("poll", currentPollStatus, status)) {
        throw new Error("Такое изменение состояния опроса не разрешено.");
      }
      const { error } = await admin.from("polls").update({ question, status, closes_at: closesAt || null }).eq("id", pollId);
      if (error) throw error;
      if (canReplacePollOptions(count ?? 0)) {
        const { error: deleteError } = await admin.from("poll_options").delete().eq("poll_id", pollId);
        if (deleteError) throw deleteError;
        const { error: optionsError } = await admin.from("poll_options").insert(
          options.map((label, sortOrder) => ({ poll_id: pollId, label, sort_order: sortOrder })),
        );
        if (optionsError) throw optionsError;
      }
    } else {
      const { data, error } = await admin.from("polls").insert({
        question,
        status,
        closes_at: closesAt || null,
        poll_kind: "fan",
        generated_by_ai: false,
      }).select("id").single();
      if (error) throw error;
      targetPollId = data.id;
      const { error: optionsError } = await admin.from("poll_options").insert(
        options.map((label, sortOrder) => ({ poll_id: data.id, label, sort_order: sortOrder })),
      );
      if (optionsError) throw optionsError;
    }
    await finishAdminAudit(admin, auditId, {
      outcome: "succeeded",
      afterData: { pollId: targetPollId, question, status, closesAt, options },
    });
    revalidateAdminPaths(["/admin/community", "/polls"]);
    return { ok: true, message: pollId ? "Опрос сохранён." : "Опрос создан." };
  } catch (pollError) {
    await finishAdminAudit(admin, auditId, { outcome: "failed", error: pollError });
    return actionError(pollError, "Не удалось сохранить опрос.");
  }
}

export async function retryNotificationAction(
  _previousState: AdminActionResult,
  formData: FormData,
): Promise<AdminActionResult> {
  const user = await requireAdmin();
  const admin = createSupabaseAdminClient();
  const queueId = uuid(formData, "queueId");
  if (!admin || !queueId) return { ok: false, message: "Уведомление не найдено." };
  const { data: before } = await admin.from("notification_queue").select("id, status, attempts, event_type, sent_at").eq("id", queueId).maybeSingle();
  if (!before || before.status !== "failed" || before.sent_at) {
    return { ok: false, message: "Повтор доступен только для подтверждённо неотправленной записи." };
  }
  const auditId = await startAdminAudit(admin, {
    actorUserId: user.id,
    action: "notification.retry",
    entityType: "notification_queue",
    entityId: queueId,
    beforeData: before,
  });
  const { error } = await admin.from("notification_queue").update({ status: "queued", available_at: new Date().toISOString(), last_error: null }).eq("id", queueId).eq("status", "failed").is("sent_at", null);
  if (error) {
    await finishAdminAudit(admin, auditId, { outcome: "failed", error });
    return actionError(error, "Не удалось вернуть уведомление в очередь.");
  }
  await finishAdminAudit(admin, auditId, { outcome: "succeeded", afterData: { status: "queued" } });
  revalidateAdminPaths(["/admin/notifications"]);
  return { ok: true, message: "Уведомление вернулось в очередь." };
}

export async function disconnectTelegramAction(
  _previousState: AdminActionResult,
  formData: FormData,
): Promise<AdminActionResult> {
  const user = await requireAdmin();
  const admin = createSupabaseAdminClient();
  const targetUserId = uuid(formData, "userId");
  if (!admin || !targetUserId) return { ok: false, message: "Профиль не найден." };
  const { data: before } = await admin.from("telegram_accounts").select("user_id, is_active, connected_at, last_delivery_at, last_error").eq("user_id", targetUserId).maybeSingle();
  if (!before) return { ok: false, message: "Telegram не подключён." };
  const auditId = await startAdminAudit(admin, {
    actorUserId: user.id,
    action: "telegram.disconnect",
    entityType: "profile",
    entityId: targetUserId,
    beforeData: before,
  });
  const { error } = await admin.from("telegram_accounts").update({ is_active: false, disconnected_at: new Date().toISOString() }).eq("user_id", targetUserId);
  if (error) {
    await finishAdminAudit(admin, auditId, { outcome: "failed", error });
    return actionError(error, "Не удалось отключить Telegram.");
  }
  await finishAdminAudit(admin, auditId, { outcome: "succeeded", afterData: { isActive: false } });
  revalidateAdminPaths(["/admin/users", "/admin/notifications"]);
  return { ok: true, message: "Проблемная связь отключена." };
}

export async function sendTestNotificationAction(
  _previousState: AdminActionResult,
  formData: FormData,
): Promise<AdminActionResult> {
  const user = await requireAdmin();
  const admin = createSupabaseAdminClient();
  const targetUserId = uuid(formData, "userId");
  if (!admin || !targetUserId) return { ok: false, message: "Профиль не найден." };
  const { data: account } = await admin.from("telegram_accounts").select("user_id, is_active").eq("user_id", targetUserId).maybeSingle();
  if (!account?.is_active) return { ok: false, message: "Сначала подключи активный Telegram." };
  const now = new Date();
  const dedupeKey = `admin-test:${targetUserId}:${now.toISOString().slice(0, 16)}`;
  const auditId = await startAdminAudit(admin, {
    actorUserId: user.id,
    action: "notification.test",
    entityType: "profile",
    entityId: targetUserId,
  });
  const { error } = await admin.from("notification_queue").insert({
    user_id: targetUserId,
    event_type: "admin_test",
    entity_type: "profile",
    entity_id: targetUserId,
    payload: { kind: "admin_test", title: "Проверка RaceSide", body: "Telegram подключён и готов получать уведомления." },
    available_at: now.toISOString(),
    status: "queued",
    dedupe_key: dedupeKey,
    attempts: 0,
  });
  if (error) {
    await finishAdminAudit(admin, auditId, { outcome: "failed", error });
    return actionError(error, "Не удалось добавить тестовое уведомление.");
  }
  await finishAdminAudit(admin, auditId, { outcome: "succeeded", afterData: { queued: true } });
  revalidateAdminPaths(["/admin/users", "/admin/notifications"]);
  return { ok: true, message: "Тестовое уведомление добавлено в очередь." };
}

export async function uploadDriverAvatarAction(
  _previousState: AdminActionResult,
  formData: FormData,
): Promise<AdminActionResult> {
  const user = await requireAdmin();
  const admin = createSupabaseAdminClient();
  const driverId = uuid(formData, "driverId");
  const slug = text(formData, "slug", 120);
  const file = formData.get("avatar");
  if (!admin || !driverId || !slug || !(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Выбери изображение гонщика." };
  }
  if (!["image/webp", "image/png", "image/jpeg"].includes(file.type) || file.size > 2_097_152) {
    return { ok: false, message: "Нужен PNG, JPEG или WebP до 2 МБ." };
  }
  const { data: before } = await admin.from("drivers").select("id, slug, ai_avatar_url").eq("id", driverId).maybeSingle();
  if (!before) return { ok: false, message: "Гонщик не найден." };
  const auditId = await startAdminAudit(admin, {
    actorUserId: user.id,
    action: "driver.avatar_upload",
    entityType: "driver",
    entityId: driverId,
    beforeData: before,
    metadata: { contentType: file.type, size: file.size },
  });
  try {
    const extension = file.type === "image/png" ? "png" : file.type === "image/jpeg" ? "jpg" : "webp";
    const path = `${driverId}/${Date.now()}.${extension}`;
    const { error: uploadError } = await admin.storage.from("driver-avatars").upload(path, file, { contentType: file.type, upsert: true });
    if (uploadError) throw uploadError;
    const { data } = admin.storage.from("driver-avatars").getPublicUrl(path);
    const { error } = await admin.from("drivers").update({ ai_avatar_url: data.publicUrl }).eq("id", driverId);
    if (error) throw error;
    await finishAdminAudit(admin, auditId, { outcome: "succeeded", afterData: { avatarChanged: true } });
    revalidateAdminPaths(["/admin/sport", `/drivers/${slug}`]);
    return { ok: true, message: "Аватар обновлён." };
  } catch (avatarError) {
    await finishAdminAudit(admin, auditId, { outcome: "failed", error: avatarError });
    return actionError(avatarError, "Не удалось загрузить аватар.");
  }
}

export async function saveAiBudgetAction(
  _previousState: AdminActionResult,
  formData: FormData,
): Promise<AdminActionResult> {
  const user = await requireAdmin();
  const admin = createSupabaseAdminClient();
  const scope = enumValue(formData, "scope", ["default", "social_x"]);
  const dailyLimit = Number(text(formData, "dailyLimitUsd", 20));
  const monthlyLimit = Number(text(formData, "monthlyLimitUsd", 20));
  if (
    !admin ||
    !scope ||
    !Number.isFinite(dailyLimit) ||
    !Number.isFinite(monthlyLimit) ||
    dailyLimit <= 0 ||
    monthlyLimit <= 0 ||
    dailyLimit > monthlyLimit ||
    monthlyLimit > 100_000
  ) {
    return { ok: false, message: "Проверь лимиты. Дневной лимит должен быть меньше месячного." };
  }
  const { data: before } = await admin.from("admin_ai_budgets").select("daily_limit_usd, monthly_limit_usd").eq("scope", scope).maybeSingle();
  const auditId = await startAdminAudit(admin, {
    actorUserId: user.id,
    action: "ai_budget.update",
    entityType: "ai_budget",
    entityId: scope,
    beforeData: before ?? {},
  });
  const { error } = await admin.from("admin_ai_budgets").upsert({
    scope,
    daily_limit_usd: dailyLimit,
    monthly_limit_usd: monthlyLimit,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    await finishAdminAudit(admin, auditId, { outcome: "failed", error });
    return actionError(error, "Не удалось сохранить лимиты.");
  }
  await finishAdminAudit(admin, auditId, { outcome: "succeeded", afterData: { dailyLimit, monthlyLimit } });
  revalidateAdminPaths(["/admin", "/admin/ai"]);
  return {
    ok: true,
    message: scope === "social_x"
      ? "Лимит обработки публикаций из X сохранён."
      : "Общий AI-бюджет сохранён.",
  };
}

export async function saveAiPromptVersionAction(
  _previousState: AdminActionResult,
  formData: FormData,
): Promise<AdminActionResult> {
  const user = await requireAdmin();
  const admin = createSupabaseAdminClient();
  const promptKey = text(formData, "promptKey", 120);
  const intent = enumValue(formData, "intent", ["draft", "publish"]);
  const definition = getAdminAiPromptDefinition(promptKey);
  const systemPrompt = text(formData, "systemPrompt", 20_000);
  const userTemplate = text(formData, "userTemplate", 30_000);
  const model = text(formData, "model", 160);
  const maxTokens = Number(text(formData, "maxTokens", 10));
  const changeNote = text(formData, "changeNote", 500);
  const rateLimit = consumeRateLimit("admin:save-ai-prompt", `user:${user.id}`, 20, 60_000);

  if (!admin || !definition || !intent) {
    return { ok: false, message: "AI-задача не найдена." };
  }
  if (!rateLimit.ok) {
    return { ok: false, message: "Слишком много изменений. Подожди минуту." };
  }

  const validation = validateAdminAiPromptContent(
    definition,
    systemPrompt,
    userTemplate,
  );
  if (!validation.ok) {
    return validation;
  }
  const availableModels = await loadOpenRouterModels().catch(() => []);
  const runtimeValidation = validateAdminAiRuntime(
    model,
    maxTokens,
    availableModels,
  );
  if (!runtimeValidation.ok) {
    return runtimeValidation;
  }

  const checksum = makeAdminAiPromptChecksum({
    promptKey,
    systemPrompt: validation.systemPrompt,
    userTemplate: validation.userTemplate,
    model: runtimeValidation.model,
    maxTokens: runtimeValidation.maxTokens,
  });
  const { data: before } = await admin
    .from("ai_prompt_versions")
    .select("id, version, status, checksum, model, max_tokens")
    .eq("prompt_key", promptKey)
    .in("status", ["published", "draft"])
    .order("version", { ascending: false })
    .limit(3);
  const auditId = await startAdminAudit(admin, {
    actorUserId: user.id,
    action: intent === "publish" ? "ai_prompt.publish" : "ai_prompt.save_draft",
    entityType: "ai_prompt",
    entityId: promptKey,
    beforeData: {
      versions: (before ?? []).map((version) => ({
        id: version.id,
        version: version.version,
        status: version.status,
        checksum: version.checksum,
      })),
    },
    metadata: {
      changedFields: ["systemPrompt", "userTemplate", "model", "maxTokens"],
      hasChangeNote: Boolean(changeNote),
    },
  });
  const { data, error } = await admin.rpc("save_admin_ai_prompt_version", {
    p_prompt_key: promptKey,
    p_system_prompt: validation.systemPrompt,
    p_user_template: validation.userTemplate,
    p_model: runtimeValidation.model,
    p_max_tokens: runtimeValidation.maxTokens,
    p_change_note: changeNote,
    p_actor: user.id,
    p_publish: intent === "publish",
    p_checksum: checksum,
  });

  if (error || !data?.[0]) {
    await finishAdminAudit(admin, auditId, {
      outcome: "failed",
      error: error ?? "prompt_version_not_saved",
    });
    return {
      ok: false,
      message: intent === "publish"
        ? "Не удалось опубликовать новую версию. Проверь текст и попробуй ещё раз."
        : "Не удалось сохранить черновик. Проверь текст и попробуй ещё раз.",
    };
  }

  const saved = data[0];
  await finishAdminAudit(admin, auditId, {
    outcome: "succeeded",
    afterData: {
      promptKey,
      versionId: saved.saved_id,
      version: saved.saved_version,
      status: saved.saved_status,
      checksum,
      model: runtimeValidation.model,
      maxTokens: runtimeValidation.maxTokens,
    },
  });
  revalidateAdminPaths(["/admin", "/admin/ai", "/admin/audit"]);

  return {
    ok: true,
    message: intent === "publish"
      ? `Версия ${saved.saved_version} опубликована. Новые обработки начнут использовать её в течение минуты.`
      : `Черновик версии ${saved.saved_version} сохранён.`,
    data: {
      promptKey,
      version: saved.saved_version,
      published: intent === "publish",
    },
  };
}

export async function saveAdminScheduleAction(
  _previousState: AdminActionResult,
  formData: FormData,
): Promise<AdminActionResult> {
  const user = await requireAdmin();
  const admin = createSupabaseAdminClient();
  const scheduleId = uuid(formData, "scheduleId");
  const scheduleKind = enumValue(formData, "scheduleKind", ["interval", "daily", "adaptive"]);
  const intervalMinutes = Number(text(formData, "intervalMinutes", 10));
  const dailyTimeUtc = text(formData, "dailyTimeUtc", 5);
  const maxAttempts = Number(text(formData, "maxAttempts", 2));
  const isEnabled = formData.get("isEnabled") === "on";

  if (!admin || !scheduleId || !scheduleKind) {
    return { ok: false, message: "Расписание не найдено." };
  }
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
    return {
      ok: false,
      message: "Проверь число повторов.",
      fieldErrors: { maxAttempts: ["Можно выбрать от 1 до 10 попыток."] },
    };
  }
  if (
    scheduleKind === "interval" &&
    (!Number.isInteger(intervalMinutes) || intervalMinutes < 2 || intervalMinutes > 10_080)
  ) {
    return {
      ok: false,
      message: "Проверь интервал.",
      fieldErrors: { intervalMinutes: ["Интервал — от 2 минут до 7 дней."] },
    };
  }
  if (
    scheduleKind === "daily" &&
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(dailyTimeUtc)
  ) {
    return {
      ok: false,
      message: "Проверь время запуска.",
      fieldErrors: { dailyTimeUtc: ["Укажи время в UTC, например 12:00."] },
    };
  }

  const { data: before, error: beforeError } = await admin
    .from("admin_job_schedules")
    .select("id, schedule_key, job_name, schedule_kind, interval_minutes, daily_time_utc, max_attempts, is_enabled, next_run_at")
    .eq("id", scheduleId)
    .maybeSingle();
  const definition = before ? getAdminJobDefinition(before.job_name) : null;
  if (beforeError || !before || !definition) {
    return {
      ok: false,
      message: "Расписание не найдено или задача больше недоступна.",
    };
  }
  if (
    (before.schedule_kind === "adaptive" && scheduleKind !== "adaptive") ||
    (scheduleKind === "adaptive" && !definition.adaptiveSchedule)
  ) {
    return {
      ok: false,
      message: "Адаптивный режим этой проверки нельзя заменить фиксированным интервалом.",
    };
  }

  const nextRunAt = scheduleKind === "adaptive"
    ? isEnabled && !before.is_enabled
      ? new Date().toISOString()
      : before.next_run_at
    : getNextScheduleRun({
      scheduleKind,
      intervalMinutes,
      dailyTimeUtc,
    });
  const auditId = await startAdminAudit(admin, {
    actorUserId: user.id,
    action: "schedule.update",
    entityType: "job_schedule",
    entityId: before.schedule_key,
    beforeData: before,
  });
  const update = {
    schedule_kind: scheduleKind,
    interval_minutes: scheduleKind === "interval"
      ? intervalMinutes
      : scheduleKind === "adaptive"
        ? 1_440
        : null,
    daily_time_utc: scheduleKind === "daily" ? dailyTimeUtc : null,
    max_attempts: maxAttempts,
    is_enabled: isEnabled,
    next_run_at: nextRunAt,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  };
  const { error } = await admin
    .from("admin_job_schedules")
    .update(update)
    .eq("id", scheduleId);

  if (error) {
    await finishAdminAudit(admin, auditId, { outcome: "failed", error });
    return actionError(error, "Не удалось сохранить расписание.");
  }
  await finishAdminAudit(admin, auditId, {
    outcome: "succeeded",
    afterData: update,
  });
  revalidateAdminPaths([
    "/admin",
    "/admin/schedules",
    "/admin/systems",
    "/admin/audit",
  ]);
  return {
    ok: true,
    message: isEnabled
      ? "Расписание сохранено."
      : "Расписание поставлено на паузу.",
  };
}

export async function runAdminScheduleNowAction(
  _previousState: AdminActionResult,
  formData: FormData,
): Promise<AdminActionResult> {
  const user = await requireAdmin();
  const admin = createSupabaseAdminClient();
  const scheduleId = uuid(formData, "scheduleId");

  if (!admin || !scheduleId) {
    return { ok: false, message: "Расписание не найдено." };
  }
  const { data: schedule, error } = await admin
    .from("admin_job_schedules")
    .select("id, schedule_key, job_name, args")
    .eq("id", scheduleId)
    .maybeSingle();
  if (error || !schedule || !getAdminJobDefinition(schedule.job_name)) {
    return {
      ok: false,
      message: "Эту проверку нельзя запустить из админки.",
    };
  }
  const auditId = await startAdminAudit(admin, {
    actorUserId: user.id,
    action: "schedule.run_now",
    entityType: "job_schedule",
    entityId: schedule.schedule_key,
  });

  try {
    const queued = await enqueueAdminJob(admin, {
      args: isRecord(schedule.args) ? schedule.args : {},
      jobName: schedule.job_name,
      requestedBy: user.id,
      requestKey: `schedule-manual:${schedule.schedule_key}:${Date.now()}`,
    });
    if (!queued.ok) {
      await finishAdminAudit(admin, auditId, {
        outcome: "failed",
        error: queued.message,
      });
      return { ok: false, message: queued.message };
    }
    await finishAdminAudit(admin, auditId, {
      outcome: "succeeded",
      afterData: { jobRunId: queued.jobRunId },
    });
    revalidateAdminPaths([
      "/admin",
      "/admin/jobs",
      "/admin/schedules",
      "/admin/systems",
    ]);
    return { ok: true, message: "Проверка добавлена в очередь." };
  } catch (runError) {
    await finishAdminAudit(admin, auditId, {
      outcome: "failed",
      error: runError,
    });
    return actionError(runError, "Не удалось запустить проверку.");
  }
}

export async function clearDriverAvatarAction(
  _previousState: AdminActionResult,
  formData: FormData,
): Promise<AdminActionResult> {
  const user = await requireAdmin();
  const admin = createSupabaseAdminClient();
  const driverId = uuid(formData, "driverId");
  const slug = text(formData, "slug", 120);
  if (!admin || !driverId || !slug) return { ok: false, message: "Гонщик не найден." };
  const { data: before } = await admin.from("drivers").select("id, slug, ai_avatar_url").eq("id", driverId).maybeSingle();
  if (!before) return { ok: false, message: "Гонщик не найден." };
  const auditId = await startAdminAudit(admin, {
    actorUserId: user.id,
    action: "driver.avatar_clear",
    entityType: "driver",
    entityId: driverId,
    beforeData: before,
  });
  const { error } = await admin.from("drivers").update({ ai_avatar_url: null }).eq("id", driverId);
  if (error) {
    await finishAdminAudit(admin, auditId, { outcome: "failed", error });
    return actionError(error, "Не удалось убрать аватар.");
  }
  await finishAdminAudit(admin, auditId, { outcome: "succeeded", afterData: { avatarChanged: true } });
  revalidateAdminPaths(["/admin/sport", `/drivers/${slug}`]);
  return { ok: true, message: "Аватар убран из профиля." };
}

async function replaceAdminNewsTags(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  articleId: string,
  names: string[],
) {
  const { data: relations, error: relationsError } = await admin
    .from("news_article_tags")
    .select("tag_id")
    .eq("article_id", articleId);
  if (relationsError) throw relationsError;
  const tagIds = (relations ?? []).map((relation) => relation.tag_id);
  const { data: existingTags, error: tagsError } = tagIds.length
    ? await admin.from("tags").select("id, type").in("id", tagIds)
    : { data: [], error: null };
  if (tagsError) throw tagsError;
  const managedTagIds = (existingTags ?? []).filter((tag) => tag.type === "admin_topic").map((tag) => tag.id);
  if (managedTagIds.length) {
    const { error } = await admin.from("news_article_tags").delete().eq("article_id", articleId).in("tag_id", managedTagIds);
    if (error) throw error;
  }
  for (const name of names) {
    const slug = `topic-${slugify(name)}`;
    const { data: tag, error } = await admin.from("tags").upsert({ type: "admin_topic", slug, name }, { onConflict: "slug" }).select("id").single();
    if (error) throw error;
    const { error: relationError } = await admin.from("news_article_tags").upsert({ article_id: articleId, tag_id: tag.id, confidence: 1, method: "admin" }, { onConflict: "article_id,tag_id" });
    if (relationError) throw relationError;
  }
}

function revalidateAdminPaths(paths: string[]) {
  for (const path of paths) revalidatePath(path);
}

function text(formData: FormData, key: string, maxLength: number) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function optionalText(formData: FormData, key: string, maxLength: number) {
  return text(formData, key, maxLength) || null;
}

function uuid(formData: FormData, key: string) {
  const value = text(formData, key, 64);
  return UUID_PATTERN.test(value) ? value : null;
}

function optionalUuid(formData: FormData, key: string) {
  const value = text(formData, key, 64);
  return value ? (UUID_PATTERN.test(value) ? value : null) : null;
}

function enumValue<const T extends string>(formData: FormData, key: string, values: readonly T[]) {
  const value = text(formData, key, 60);
  return values.includes(value as T) ? value as T : null;
}

function parseTags(value: string) {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))].slice(0, 8);
}

function parseLines(value: string, maxItems: number, maxLength: number) {
  return [...new Set(value.split(/\r?\n/).map((item) => item.trim().slice(0, maxLength)).filter(Boolean))].slice(0, maxItems);
}

function slugify(value: string) {
  return value.toLocaleLowerCase("ru-RU").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9а-яё]+/gi, "-").replace(/^-+|-+$/g, "") || "tag";
}

function normalizeHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function normalizeSocialSourceUrl(platform: "reddit" | "telegram" | "x", rawUrl: string, externalKey: string) {
  if (platform === "telegram") {
    if (/^-?\d+$/.test(externalKey)) return `telegram:${externalKey}`;
    if (/^[A-Za-z][A-Za-z0-9_]{3,}$/.test(externalKey)) return `https://t.me/${externalKey}`;
    return "";
  }
  const url = normalizeHttpsUrl(rawUrl);
  if (!url) return "";
  const hostname = new URL(url).hostname.toLowerCase();
  if (platform === "x" && !["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(hostname)) return "";
  if (platform === "reddit" && !["reddit.com", "www.reddit.com", "old.reddit.com"].includes(hostname)) return "";
  return url;
}

function getNextScheduleRun(input: {
  scheduleKind: "interval" | "daily";
  intervalMinutes: number;
  dailyTimeUtc: string;
}) {
  if (input.scheduleKind === "interval") {
    return new Date(Date.now() + input.intervalMinutes * 60_000).toISOString();
  }

  const [hours, minutes] = input.dailyTimeUtc.split(":").map(Number);
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(hours, minutes, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

function isXUrl(value: string) {
  const hostname = new URL(value).hostname.toLowerCase();
  return ["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(hostname);
}

function clampNumber(value: string, min: number, max: number, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function actionError(error: unknown, fallback: string): AdminActionResult {
  return {
    ok: false,
    message: error instanceof Error && error.message ? `${fallback} ${error.message}` : fallback,
  };
}
