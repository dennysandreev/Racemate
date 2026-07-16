# RaceMate

Дата фиксации MVP-прохода: 2026-06-10

## Что это

RaceMate — веб-приложение для русскоязычных фанатов Формулы 1. Оно собирает новости из RSS/API, делает краткие русскоязычные AI-сводки, показывает календарь, результаты, standings, race weekend hub, прогнозы, мини-лиги, опросы и реакции.

Текущий стек:
- Next.js App Router;
- Supabase Auth + Postgres + RLS;
- OpenRouter для AI-сводок;
- Jolpica, OpenF1 и Open-Meteo для F1/погодных данных;
- отдельный Node worker для VPS.

## Главные решения

1. Новости берем через RSS/API, не HTML-скрейпинг.
2. AI используем через OpenRouter.
3. Теги по пилотам/командам/темам в MVP делаем обычными правилами.
4. Данные F1 берем через Jolpica и бесплатную историческую OpenF1.
5. Live-режим в MVP не делаем.
6. FastF1/OpenF1 используем для аналитики после гонки, не для live.
7. YouTube в MVP не делаем.
8. Авторизация — email OTP/passwordless, без хранения паролей.
9. Telegram входит в текущий MVP; web push и другие каналы уведомлений отложены.
10. Бесплатный уровень продукта делаем сразу.
11. Все внешние данные кешируем в собственной БД.

## Файлы

- `PRODUCT.md` — главный продуктовый контекст RaceMate.
- `DESIGN.md` — дизайн-система и UI-направление RaceMate.
- `SKILLS.md` — закрепленный набор скиллов для разработки проекта.
- `supabase/migrations` — актуальная схема и seed для Supabase.
- `worker/index.mjs` — worker CLI для ingestion, AI, sync и scoring.
- `01_product_and_scope.md` — исторический документ продукта и MVP.
- `02_features_matrix.md` — таблица фич, источников, стоимости и реализации.
- `03_architecture.md` — архитектура и рекомендуемый стек.
- `04_auth_telegram.md` — авторизация и безопасная привязка Telegram.
- `05_database_schema.sql` — первичная схема БД.
- `06_ai_pipeline.md` — AI-пайплайн и промты.
- `07_bot_spec.md` — исторический документ; бот отложен из V1.
- `.env.example` — пример переменных окружения.

## Локальный запуск

```bash
corepack pnpm install
corepack pnpm dev
```

Проверки:

```bash
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm build
```

Worker:

```bash
corepack pnpm worker:rss
corepack pnpm worker:ai
corepack pnpm worker:calendar
corepack pnpm worker:results
corepack pnpm worker:score
```

Для worker нужен `SUPABASE_SERVICE_ROLE_KEY`. OpenRouter требует `OPENROUTER_API_KEY` и `AI_SUMMARY_MAX_TOKENS` для текстовой обработки новостей. OpenF1 используем в бесплатном режиме: исторические данные загружаются без ключа, а во время live-окна API может временно закрывать endpoints до окончания сессии.

### Предпросмотр сезонов 2020–2025

Исторические сезоны можно проверить до публичного релиза, не меняя
`is_published`. Для этого должны быть применены исторические миграции, а
пользователь, вошедший на сайт, должен состоять в `admin_users`.

Подготовка данных и ассетов для предпросмотра:

```bash
corepack pnpm worker:history:prepare
```

Команда последовательно заполняет сезоны 2020–2025, синхронизирует доступные
ассеты и запускает проверку готовности, но не публикует сезоны. После неё войдите
на локальный сайт администратором и откройте, например,
`/calendar?season=2024`. Та же сессия даёт доступ к чемпионату, командам и
профилям выбранного года. Обычный пользователь и анонимное окно продолжают
видеть только опубликованные сезоны — это ограничение обеспечивает RLS.

`SUPABASE_SERVICE_ROLE_KEY` используется только worker-процессом и не должен
попадать в браузерные переменные или клиентский код.

Настройка Supabase Auth для массовой passwordless-авторизации:

```bash
corepack pnpm supabase:auth
```

Команда читает `.env`/`.env.local`, включает custom SMTP и поднимает лимиты Auth. Нужны `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SMTP_ADMIN_EMAIL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SENDER_NAME`, а также лимиты `AUTH_SMTP_MAX_FREQUENCY`, `AUTH_RATE_LIMIT_EMAIL_SENT`, `AUTH_RATE_LIMIT_OTP`, `AUTH_RATE_LIMIT_VERIFY` и `AUTH_RATE_LIMIT_TOKEN_REFRESH`.

## Как использовать в Codex

1. Начинать с `PRODUCT.md`, `DESIGN.md` и `SKILLS.md`.
2. Для БД использовать `supabase/migrations`.
3. Для worker смотреть `worker/index.mjs`.
4. Старые numbered docs читать как архив решений, не как текущий source of truth.
