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
2. Normalize.
3. Deduplicate.
4. Apply rule-based tags.
5. If unique — send to AI.
6. Validate JSON.
7. Save AI title, summary, importance score.
8. Log AI usage.
9. Article status = processed.

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
  "importance_score": число от 1 до 10,
  "why_it_matters": "1 короткое предложение, почему это важно",
  "confidence": число от 0 до 1
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

DB:
- `ai_usage_logs`

Rules:
- не генерировать summary повторно без причины;
- не обрабатывать дубли;
- при превышении лимита оставлять статьи pending;
- в админке показывать usage.
