# 06. AI Pipeline

## Provider

OpenRouter.

## Что делает AI

- переводит/адаптирует заголовок на русский;
- делает короткое саммари новости;
- оценивает важность;
- делает дневную сводку;
- делает предгоночную сводку;
- делает постгоночный отчет.

## Что AI не делает в MVP

- не пишет новости без источника;
- не делает полный AI-chat assistant;
- не копирует полные статьи;
- не заменяет правила тегирования, если хватает словарей.

## Pipeline новости

1. RSS item fetched.
2. Normalize URL and calculate a stable content hash.
3. Check technical duplicates by normalized URL, RSS GUID and content hash without an AI call.
4. Save a new article as `publication_status = processing`.
5. Build the Russian article and normalized editorial metadata in one AI call.
6. Validate JSON; retry metadata extraction separately when the first response is incomplete.
7. Select no more than 10 plausible candidates from the previous 24 hours.
8. Under an event lock, classify only those candidates as duplicate, update, confirmation, decision, result, analysis, reaction, related or unrelated.
9. Publish the first ingested version of a fact. A later article is hidden only when relation is `duplicate` and confidence reaches the configured threshold.
10. Save the decision, candidate count, timing and reason in `news_dedup_decisions`.
11. Apply rule-based tags and log AI usage.

После формирования `title_ru` материал получает стабильный публичный `slug`, транслитерированный из короткого редакционного заголовка. Slug фиксируется при публикации: последующее редактирование заголовка не меняет URL. При совпадении заголовков к slug добавляется короткий уникальный суффикс.

Rumor, official confirmation, new decision, result, reaction and analysis remain separate publications even when they concern the same participants. Public queries return only `status = processed`, `publication_status = published` rows without `duplicate_of`.

## Prompt: article summary

System:

```text
Ты редактор фанатского приложения про Формулу 1.

Твоя задача — кратко пересказать новость на русском языке.
Нельзя придумывать факты.
Используй только данные, переданные пользователем.
Если данных недостаточно, сделай осторожное саммари без домыслов.

Верни только валидный JSON.
```

User:

```text
Сделай русскоязычное саммари новости.

Источник: {{source_name}}
Оригинальный заголовок: {{original_title}}
Описание из RSS: {{original_description}}
Дата публикации: {{published_at}}
URL: {{canonical_url}}

Верни JSON:
{
  "title_ru": "короткий заголовок на русском, без кликбейта",
  "summary_ru": "2-4 предложения, своими словами",
  "details_ru": "подробный редакторский пересказ",
  "highlight_phrases_ru": ["фраза, которая дословно есть в тексте"],
  "importance_score": число от 1 до 10,
  "why_it_matters": "1 короткое предложение, почему это важно",
  "confidence": число от 0 до 1,
  "main_fact": "одно предложение с центральным новым фактом",
  "event_type": "стабильный тип события в snake_case",
  "event_stage": "стадия события в snake_case",
  "event_date": "YYYY-MM-DD или null",
  "event_fingerprint": "стабильный ключ события в snake_case на латинице",
  "entities": [
    {
      "type": "team | person | race | organization | other",
      "name": "отображаемое имя",
      "normalized_name": "имя в snake_case на латинице"
    }
  ]
}
```

## Prompt: semantic deduplication

System:

```text
Ты проверяешь новости автоспорта на смысловые дубли.
Определи, сообщает ли новая новость тот же центральный факт, который уже опубликован.
Разница только в формулировке, переводе, заголовке, несущественной цитате или общем контексте означает duplicate.
Официальное подтверждение, решение, наказание, результат, новый статус, самостоятельный анализ, интервью или реакция с новым существенным фактом не являются дублем.
Верни только валидный JSON.
```

Response:

```json
{
  "is_duplicate": true,
  "duplicate_of": "uuid из переданного списка или null",
  "relation": "duplicate | update | official_confirmation | decision | result | analysis | reaction | related | unrelated",
  "confidence": 0.97,
  "reason": "короткое объяснение решения"
}
```

## Prompt: daily digest

System:

```text
Ты редактор фанатского приложения про Формулу 1.
Составь краткую дневную сводку на русском.
Нельзя придумывать факты.
Нужно группировать похожие новости и не повторяться.
У каждой важной истории должны быть источники.
Верни только валидный JSON.
```

User:

```text
Составь "Главное в F1 за день" на основе списка новостей.

Дата: {{date}}
Новости:
{{articles_json}}

Верни JSON:
{
  "title": "Главное в F1 за {{date}}",
  "intro": "1 короткое предложение",
  "items": [
    {
      "headline": "короткий заголовок",
      "summary": "2-3 предложения",
      "related_article_ids": ["uuid"],
      "tags": ["Ferrari", "FIA"]
    }
  ],
  "closing": "короткое завершение без воды"
}
```

## Cost control

ENV:
- `AI_SUMMARY_MODEL`
- `AI_DIGEST_MODEL`
- `AI_DAILY_COST_LIMIT_USD`
- `AI_MONTHLY_COST_LIMIT_USD`
- `AI_MAX_ARTICLES_PER_RUN`
- `NEWS_DEDUP_ENABLED`
- `NEWS_DEDUP_WINDOW_HOURS`
- `NEWS_DEDUP_MAX_CANDIDATES`
- `NEWS_DEDUP_CONFIDENCE_THRESHOLD`
- `NEWS_DEDUP_FAIL_MODE`
- `NEWS_DEDUP_AI_RETRY_COUNT`
- `NEWS_DEDUP_AI_MODEL`

DB:
- `ai_usage_logs`

Rules:
- не генерировать summary повторно без причины;
- не обрабатывать дубли;
- при превышении лимита оставлять статьи pending;
- ошибки всего API-ключа (`401`, `402`, `403` и общий `429`) останавливают пачку
  после первой статьи и завершают worker-задачу со статусом `failed`;
- безопасный код последней ошибки сохраняется у pending-материала и показывается
  в админке, чтобы глобальный лимит не выглядел как успешная обработка с нулём;
- в админке показывать usage.

Учёт usage выполняется сразу после каждого полученного ответа OpenRouter, до разбора
контента и продуктовой валидации. Поэтому оплаченные повторные попытки, ответы с
невалидным JSON и последующие ошибки сохранения также остаются в журнале.
`estimated_cost_usd` берётся из `usage.cost`, а токены из нативных полей
`usage.prompt_tokens` и `usage.completion_tokens`.

Основная редакторская обработка `news.article` использует
`google/gemini-2.5-flash` с лимитом 3200 completion tokens. Этот запас нужен для
валидного JSON с полным текстом статьи и метаданными; короткие задачи метаданных и
дедупликации остаются на Flash Lite со своими меньшими лимитами. Worker принимает
как обычную JSON-строку, так и JSON в контент-блоках или служебной обёртке.
Лимиты остальных промптов сверяются с фактическим 95-м перцентилем usage; для
длинного структурированного ответа сохраняется запас, а короткие классификаторы
не получают завышенный бюджет.

Админская статистика за период агрегируется функцией
`get_admin_ai_usage_summary`, без ограничения PostgREST по числу строк. Старые
записи без сохранённого `usage.cost` учитываются в токенах и вызовах, но отдельно
помечаются как вызовы без цены.

## Версии промптов

`src/config/ai-prompts.json` содержит полный каталог AI-задач, которые реально
вызывает worker. Для каждой задачи зафиксированы понятное назначение, стандартная
системная инструкция, шаблон входной задачи, разрешённые переменные, защищённый
формат ответа, базовая модель и лимит ответа.

В `/admin/ai` администратор может сохранить черновик и опубликовать новую версию
инструкции. Опубликованные версии хранятся в `ai_prompt_versions`. Worker загружает
актуальную версию перед обращением к OpenRouter и не дольше минуты держит её в
памяти. Если таблица недоступна или версия не проходит повторную проверку
переменных, используется стандартный текст из каталога.

Защищённый формат ответа не редактируется: worker всегда добавляет его к
системной инструкции. Это сохраняет обязательные JSON-поля и продуктовую
валидацию новостей, дублей, опросов и соцсетей.

Каждая новая запись `ai_usage_logs` получает `prompt_key` и
`prompt_version_id`. В журнал не попадают исходный материал, собранный prompt,
ответ AI, ключ OpenRouter и другие секреты.

Расходы на получение постов из X не относятся к AI и не записываются в
`ai_usage_logs`. Worker считает уникальные прочитанные посты в
`external_api_usage_events`, применяя цену из `admin_external_api_costs`.
В админке обе серии показаны на одном графике, но имеют независимые лимиты.
