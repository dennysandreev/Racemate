export type NewsEditorialMeta = {
  article_type?: string;
  source_authors?: string[];
  status?: string;
  context?: { kind: string; subject: string; value: string | number; scope: string; as_of?: string }[];
};
export const NEWS_ARTICLE_TYPE_OPTIONS = ["news", "breaking_news", "report", "interview", "opinion", "column", "analysis", "rumour", "legal", "historical", "technical_analysis"] as const;

export function newsArticleTypeLabel(type?: string) {
  return ({ breaking_news: "Срочная новость", news: "Новость", report: "Репортаж", interview: "Интервью", opinion: "Мнение", column: "Авторская колонка", analysis: "Анализ", rumour: "Неподтверждённая информация", legal: "Судебное разбирательство", historical: "История", technical_analysis: "Технический разбор" } as Record<string, string>)[type ?? ""] ?? "Новость";
}

export function formatNewsDate(value?: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" }).format(new Date(value));
}

export function newsReviewIssueLabel(issue: string) {
  const labels: Record<string, string> = {
    sensitive_material: "Чувствительная тема: проверь формулировки и оговорки источника.",
    analysis_requires_editor: "Перед публикацией проверь аргументы, условные формулировки и отсутствие пересказа чужих мнений.",
    invalid_extraction: "Не удалось надёжно связать факты с фрагментами оригинала.",
    invalid_verification: "Проверка текста не завершилась.",
    quality_threshold_not_met: "Текст не прошёл проверку точности и полноты.",
    essential_fact_missing: "В пересказе пропущена важная подробность источника.",
    driver_team_conflict: "Команда пилота не совпадает с актуальными данными.",
    raceside_opinion: "Чужое мнение приписано RaceSide.",
    opinion_attribution_missing: "Мнение автора подано как обычная новость.",
    source_meta_narration: "Передай суть материала без фраз об авторах и редакции источника.",
    unnatural_language: "Перепиши неестественные обороты простым русским языком.",
    rumour_attribution_missing: "Не указано, что информация не подтверждена.",
    context_claim_mismatch: "Контекст статьи расходится с данными сайта.",
    unknown_source_fact: "Не удалось подтвердить происхождение одного из утверждений.",
    repeated_lead: "Начало статьи повторяет лид.",
    headline_scope_changed: "Заголовок обобщает частный случай на всю аудиторию.",
    incomplete_draft: "Текст статьи получен не полностью.",
    irrelevant_source: "Материал не подходит для новостной ленты.",
    update_target_changed: "Исходная статья изменилась во время подготовки обновления.",
  };
  if (issue.startsWith("invented_number:")) return `В источнике не найдено число ${issue.slice("invented_number:".length)}.`;
  return labels[issue] ?? (/[а-яё]/i.test(issue) ? issue : "Требуется сверка с оригиналом.");
}

export function formatNewsContext(fact: NonNullable<NewsEditorialMeta["context"]>[number]) {
  const scope = fact.scope.match(/^season_(\d{4})_after_round_(\d+)$/);
  if (!scope) return null;
  const detail = ({ championship_position: `${fact.value}-е место`, championship_points: `${fact.value} очк.`, championship_wins: `Побед: ${fact.value}` } as Record<string, string>)[fact.kind];
  return detail ? `${fact.subject} — ${detail}. Сезон ${scope[1]}, после ${scope[2]}-го этапа.` : null;
}
