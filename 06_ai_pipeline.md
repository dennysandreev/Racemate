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

## Pipeline news (editorial version 1)

1. RSS ingestion and technical URL/GUID/content deduplication.
2. Source snapshot with URL, author, date and coverage.
3. `news.extract`: attributed facts, exact evidence, caveats, article type and primary entities.
4. Current RaceSide context from sporting tables, scoped by season and round/session.
5. `news.article`: Russian draft using fact/context IDs, with no invented details or filler.
6. Deterministic checks plus independent `news.verify`. One rewrite at most.
7. Private provenance and quality scores in `news_editorial_reviews`. Sensitive or uncertain material, columns and analysis wait for manual review. Live Gemini checks did not establish sufficiently reliable automatic handling of opinion prose.
8. Semantic deduplication under a publication lock, up to 10 candidates over 72 hours by default. New stages and independent angles remain separate.
9. Same-stage updates can combine up to three sources, re-run verification and atomically update the original article while preserving URL and publication date.
10. Only verified drafts proceed to automated publication; a database trigger prevents retry jobs from bypassing verification. Manual editing/publication remains audited.

`src/config/ai-prompts.json` is the authoritative prompt/response contract for extraction, writing, verification, deduplication and daily digests. Published admin overrides must be checked when deploying a new contract.

Daily digests group events and preserve article IDs. Code constructs links and rejects invented numbers or repeated events; an independent verifier checks the result. The fallback uses existing article text without generation.

Public queries still require `status = processed`, `publication_status = published` and no `duplicate_of`. Existing history is preserved; there is no automatic mass regeneration. Pages show sources, exact publication/update times and verified statistical context. Original authors and classification remain in editorial metadata, admin and structured data. Reader-facing headlines and prose convey the actual idea without narrating a journalist's opinion; proposals stay conditional and official decisions retain their actual decision maker. Raw source snapshots and reviews stay private.

See [news editorial runbook](docs/news-editorial-runbook.md) for rollout, checks, limitations, costs and the historical-content strategy.

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

Extraction, writing and verification use separate `google/gemini-2.5-flash` requests. Default token limits and runtime overrides are defined by the prompt catalog. Each call, including a retry, goes through the existing usage and budget guard. Model output is treated as untrusted structured input and validated before storage/publication.

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
