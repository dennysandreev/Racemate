# 12. Автономное администрирование RaceSide

## Статус решения

Этот документ фиксирует согласованный план внедрения Codex как операционного
администратора RaceSide.

В объём входят:

- постоянное наблюдение за публичным сайтом и служебными процессами;
- контроль свежести данных, источников, очередей и расписаний;
- редакционный контроль новостей и социальных публикаций;
- сбор production-ошибок и их приоритизация;
- браузерная проверка ключевых пользовательских сценариев;
- регистрация находок, доказательств и истории решений;
- Telegram-оповещения по операционным событиям;
- ограниченные автоматические действия через существующую allowlist задач;
- исправление подтверждённых багов в отдельной ветке с тестами и draft PR;
- регулярный продуктовый, UX, SEO, accessibility и security-аудит;
- поэтапное расширение автономности только после измеримого безопасного периода.

Codex не получает безусловный доступ к production, произвольному SQL, секретам,
данным пользователей, публикации контента, merge или deploy.

## Цель

RaceSide должен обнаруживать большую часть операционных проблем до обращения
пользователя, сохранять доказательства, выполнять безопасное восстановление там,
где результат предсказуем и обратим, и готовить проверенные исправления к
подтверждению владельцем.

Целевой рабочий цикл:

1. Детерминированные проверки постоянно наблюдают production.
2. Сигнал нормализуется и получает устойчивый fingerprint.
3. Повторяющиеся сигналы объединяются в одну находку.
4. Codex анализирует доказательства и отделяет факт от гипотезы.
5. Разрешённое безопасное действие выполняется через существующую очередь.
6. Для ошибки в коде создаётся отдельная ветка, проходят проверки и открывается
   draft PR.
7. Изменение публичного контента, БД или production подтверждает владелец.
8. После действия система проверяет результат и закрывает либо переоткрывает
   находку.

## Принципы

1. **Сначала детерминированная проверка.** Доступность, свежесть, статусы,
   таймауты и бюджеты считаются обычным кодом. AI объясняет и приоритизирует
   результат, но не заменяет измерение.
2. **Минимальные привилегии.** Codex видит только очищенный операционный снимок и
   вызывает только именованные инструменты.
3. **Никакого произвольного выполнения.** Все worker-действия проходят через
   `src/config/admin-jobs.json`, существующую проверку параметров и `job_runs`.
4. **Проверяемость.** У каждой находки есть время, источник, доказательства,
   fingerprint, приоритет и история действий.
5. **Обратимость.** Пауза, черновик, отклонение и повтор предпочтительнее
   удаления или прямого редактирования данных.
6. **Человек подтверждает влияние.** Публикация, миграция, merge, deploy,
   изменение прав и AI-промпта не выполняются автоматически.
7. **Внешний контент не является инструкцией.** Новости, RSS, социальные посты,
   HTML и тексты ошибок считаются недоверенными данными и не могут менять
   правила агента.
8. **Агент не расширяет собственные права.** Allowlist, policy, секреты и kill
   switch изменяются только человеком через код-ревью.

## Целевая архитектура

```text
Публичный сайт ───────────────┐
Health и heartbeat ──────────┤
Sentry и серверные ошибки ───┤
Admin snapshot ──────────────┤
GitHub и CI ─────────────────┤──> Finding engine ──> admin_findings
Worker, источники, бюджеты ──┤                         │
Browser smoke tests ─────────┘                         ├─> Telegram
                                                       ├─> safe action request
                                                       └─> Codex fix workflow

safe action request -> policy validator -> admin-jobs allowlist -> job_runs

Codex fix workflow -> isolated worktree -> checks -> draft PR -> owner -> deploy
```

Контур делится на два слоя:

- **VPS-наблюдатель** работает круглосуточно и не зависит от открытого Codex
  desktop. Он выполняет дешёвые проверки, сохраняет находки и отправляет алерты.
- **Codex-оператор** запускается по расписанию и по событию, анализирует находки,
  проходит сайт браузером и готовит исправления. Для локальных файлов desktop
  должен быть запущен; для постоянной доступности предпочтителен GitHub/cloud
  workflow с отдельной веткой.

## Граница доступа Codex

### Разрешённые источники

- публичные страницы и публичный минимальный health endpoint;
- очищенный закрытый operational snapshot;
- Sentry issue, stack trace, release и event context после удаления PII;
- GitHub issues, PR, checks и разрешённые логи Actions;
- агрегированные данные `job_runs`, расписаний, источников и AI-бюджетов;
- тексты опубликованных материалов без raw payload и приватных идентификаторов;
- безопасные browser console/network ошибки;
- история `admin_findings`, `admin_action_requests` и `admin_agent_runs`.

### Запрещённые источники

- `SUPABASE_SERVICE_ROLE_KEY`, OpenRouter, Telegram и provider secrets;
- `.env`, session strings и refresh tokens;
- raw payload внешних источников;
- email без маскирования, Telegram `chat_id`, `telegram_user_id`;
- пароли, auth tokens, cookie пользователей;
- произвольные дампы БД и таблицы вне operational snapshot.

### Матрица действий

| Класс | Примеры | Режим |
| --- | --- | --- |
| R0: чтение | health, snapshot, Sentry, GitHub, публичный браузер | автоматически |
| R1: регистрация | создать/обновить находку, приложить доказательство, отправить дайджест | автоматически |
| R2: безопасное восстановление | повтор failed job, retry dedup, повтор AI-обработки одного материала | автоматически после shadow-периода |
| R3: ограничение воздействия | поставить источник на паузу, снять публикацию, повторить уведомление | только подтверждение владельца |
| R4: изменение продукта | код, промпты, schema, конфигурация | draft PR или черновик, затем подтверждение |
| R5: production | merge, deploy, migration, rollback, права | только владелец |
| Запрещено | удаление данных, произвольный SQL/shell, чтение секретов, расширение allowlist | никогда |

R2 разрешается только для явно отмеченного подмножества `admin-jobs.json`.
Публикация исторического архива, repair всего сезона, scoring, dispatch массовых
уведомлений и тяжёлые полные пересчёты в R2 не входят.

## Приоритеты находок

### P0 — критично

- публичный сайт недоступен или отдаёт массовые 5xx;
- нарушена авторизация или раскрываются секреты/персональные данные;
- повреждение или неконтролируемая массовая мутация данных;
- ошибочная массовая рассылка;
- подтверждённая активная уязвимость.

Действие: немедленный Telegram-алерт, kill switch для автодействий, сбор
доказательств. Код, deploy и данные не меняются без владельца.

### P1 — высокий приоритет

- не работает ключевой маршрут или основной пользовательский сценарий;
- worker/cron/admin-job-runner не подаёт heartbeat;
- результаты, календарь или standings существенно устарели;
- очередь системно растёт или задача циклически падает;
- публикационный pipeline остановлен;
- превышен AI-бюджет или быстро растёт стоимость.

Действие: быстрый алерт, разрешённый R2 retry при выполнении policy, диагностика и
draft PR.

### P2 — средний приоритет

- отдельная сломанная страница, изображение или ссылка;
- единичная зависшая публикация;
- заметный дубль, плохая редактура или неверный тег;
- UX, accessibility или SEO-регрессия без остановки сценария;
- ошибка одного внешнего источника при наличии остальных.

Действие: дневной отчёт, исправление или редакционное предложение.

### P3 — улучшение

- продуктовая возможность, оптимизация, консистентность UI;
- незначительное предупреждение, технический долг;
- улучшение промпта, экономия токенов, повышение качества текста.

Действие: недельный backlog с ожидаемым влиянием и стоимостью.

## Новые данные

Добавить additive-миграцию без изменения существующих публичных моделей.

### `admin_agent_runs`

Один запуск наблюдателя или Codex:

- `id`;
- `run_kind`: `watcher`, `browser_smoke`, `editorial`, `bug_triage`, `weekly_audit`;
- `trigger_kind`: `schedule`, `deploy`, `manual`, `finding`;
- `status`: `running`, `succeeded`, `partial`, `failed`;
- `started_at`, `finished_at`;
- безопасные counters и duration;
- версия ruleset и release SHA;
- ошибка без secret/PII;
- стоимость AI, если она известна.

### `admin_findings`

- `id`;
- устойчивый `fingerprint`;
- `category`: availability, data, job, content, browser, security, cost, ux, seo;
- `severity`: P0–P3;
- `status`: open, acknowledged, action_pending, fixing, monitoring, resolved,
  ignored;
- короткий пользовательский заголовок и описание;
- `first_seen_at`, `last_seen_at`, `occurrence_count`;
- safe evidence JSON;
- route/entity/job/release references;
- `owner_kind`: agent или human;
- ссылка на GitHub issue/PR;
- resolution и время закрытия.

Partial unique index не допускает две активные находки с одним fingerprint.

### `admin_finding_events`

Неизменяемая история:

- detected;
- repeated;
- severity_changed;
- action_requested;
- action_started;
- action_succeeded/failed;
- fix_pr_opened;
- acknowledged/resolved/reopened.

Payload проходит ту же рекурсивную очистку, что `admin_audit_log`.

### `admin_action_requests`

- finding и запрошенное действие;
- точное имя allowlisted job и проверенные параметры;
- risk class;
- статус `proposed`, `approved`, `running`, `succeeded`, `failed`, `rejected`;
- idempotency key;
- кто запросил и кто подтвердил;
- связанный `job_run_id`;
- timestamps и безопасный результат.

R2 может атомарно перейти из `proposed` в `approved` только через policy RPC.
R3–R5 требуют human actor из `admin_users`.

### `ops_service_heartbeats`

Последний heartbeat для:

- web;
- worker;
- cron;
- admin-job-runner;
- watcher.

Запись содержит service name, instance id, release SHA, checked time и короткий
safe status. История не нужна: актуальная строка обновляется upsert, длительные
события сохраняются как findings.

## API и инструменты агента

### Публичный health

Расширить `/api/health`, сохранив минимальный безопасный ответ:

- HTTP 200, когда web и БД доступны;
- HTTP 503 при подтверждённой основной неисправности;
- app, environment, release, checkedAt;
- без названий таблиц, ошибок провайдера, URL и секретов.

Публичный health не должен зависеть от всех внешних API, иначе отказ одного
источника ошибочно сделает весь сайт недоступным.

### Закрытый snapshot

Добавить закрытый read-only endpoint/tool `read_ops_snapshot`:

- service heartbeat;
- свежесть источников и спортивных данных;
- due/failed/stuck jobs;
- длина очередей;
- проблемные публикации;
- notification failures;
- AI-расходы и процент лимита;
- активные P0–P2 findings;
- release SHA и последняя успешная проверка.

Snapshot формируется сервером из заранее определённых запросов. Клиент не может
передать имя таблицы, SQL, select или произвольный фильтр.

### Private RaceSide Operations MCP/plugin

После стабилизации snapshot создать приватный plugin с skill и MCP-инструментами:

- `read_ops_snapshot`;
- `list_findings`;
- `get_finding`;
- `record_finding_evidence`;
- `request_safe_action`;
- `verify_action_result`;
- `acknowledge_finding`;
- `resolve_finding`;
- `get_publication_review_sample`;
- `submit_editorial_suggestion`.

Не предоставлять generic database query, generic HTTP, shell, raw logs, secret
lookup, arbitrary job name или arbitrary mutation.

Авторизация хранится в secret storage подключённого инструмента, не в prompt,
репозитории или UI. Запросы ограничиваются по времени, частоте и размеру. Все
mutating tools требуют idempotency key и попадают в audit.

## Наблюдатель на VPS

Добавить отдельный Docker service `ops-watcher` на том же production image.
Он вызывает только внутренние команды Node worker и не содержит AI-логики.

Рекомендуемый ритм:

- каждые 1–2 минуты: HTTP availability и heartbeats;
- каждые 5 минут: stuck/failed jobs, очереди, расписания;
- каждые 15 минут: свежесть RSS/social pipeline и processing-материалов;
- каждый час: календарь, standings, результаты, уведомления и AI-бюджет;
- после ожидаемого окончания сессии: адаптивная проверка результатов;
- раз в сутки: целостность публикаций, изображений и ссылок;
- раз в неделю: длительные тренды и неразобранные findings.

Watcher не перезапускает Docker и не выполняет shell-команды. Он может создать
finding и R2 action request; существующий `admin-job-runner` остаётся единственным
исполнителем worker-задач.

## Детерминированные правила

### Availability и runtime

- публичный health неуспешен N последовательных проверок;
- route возвращает 5xx;
- heartbeat старше установленного окна;
- release SHA различается между ожидаемыми сервисами;
- cron не создаёт плановые job runs;
- runner не забирает доступную очередь.

### Очередь и расписания

- `running` дольше timeout конкретной задачи;
- `queued` дольше ожидаемого времени;
- повторные failed runs одного job;
- schedule просрочен, хотя включён;
- одновременно растут queue depth и age;
- превышено число попыток;
- auto-retry уже выполнялся для fingerprint.

### Источники и данные

- `last_success_at` старше допустимого интервала;
- одинаковая ошибка повторяется у источника;
- нет календаря или результатов ожидаемой завершённой сессии;
- standings не обновились после подтверждённых результатов;
- отчёт не вышел из adaptive refresh window;
- обязательный сезонный asset отсутствует;
- внешний источник деградировал, но fallback работает.

### Контент

- material слишком долго находится в processing/processing_dedup;
- опубликованный material не имеет slug, источника, заголовка или summary;
- изображение недоступно или имеет недопустимый URL;
- duplicate confidence выше порога, но обе публикации видимы;
- manual override конфликтует с поздней автоматической обработкой;
- связанный race/team/driver не существует или не опубликован.

### Стоимость

- 80% дневного/30-дневного лимита — P2 warning;
- 100% лимита — P1 и запрет новых применимых AI-вызовов;
- резкий рост средней стоимости одного материала;
- неизвестная цена растёт и мешает оценить бюджет.

## AI-редакционный контроль

AI-аудит получает только уже очищенный текст материала и разрешённые метаданные.
Он проверяет:

- естественный русский язык;
- соответствие заголовка центральному факту;
- отсутствие кликбейта и неподтверждённых утверждений;
- согласованность summary и details;
- достаточность оговорок при неполном источнике;
- вероятный смысловой дубль;
- корректность тегов и связи с этапом;
- наличие текста, похожего на служебную инструкцию или prompt injection.

Результат — строго структурированный JSON: score, flags, evidence fragments,
suggested edit и confidence. Оценка сама по себе не меняет publication status.

Низкая уверенность создаёт редакционное предложение. Высокая уверенность в
опасной проблеме создаёт P1/P2 finding, но снятие публикации остаётся R3.

## Browser QA

### Smoke-маршруты

- `/`;
- `/news` и одна свежая `/news/[slug]`;
- `/calendar` и текущий этап;
- `/weekend`;
- `/leaderboard` для пилотов и команд;
- `/teams` и профили команды/гонщика;
- `/social`;
- `/fantasy`, `/polls`;
- auth entry points;
- `/admin` только в отдельной безопасной admin-сессии.

### Проверки

- HTTP и видимый error state;
- console errors и failed network requests;
- основные кнопки и переходы;
- отсутствие горизонтального overflow;
- ключевой контент на 375, 768, 1024 и 1440 px;
- клавиатура и видимый focus;
- light/dark;
- loading, empty, error и stale states;
- изображения, metadata, canonical и robots expectations;
- reduced motion для затронутых сценариев.

Скриншоты сохраняются только для failed check или визуального diff с порогом.
Cookie, токены и персональные данные на скриншотах запрещены.

## Sentry и телеметрия

### RaceSide

Подключить Sentry к Next.js server/client и Node worker:

- environment и release SHA;
- source maps через защищённый release workflow;
- error boundary и unhandled rejection;
- job name, run id и safe entity type как tags;
- sampling для performance без записи приватных payload;
- `beforeSend` scrub для email, Telegram/provider IDs, auth headers и URL query;
- отдельные alerts для web, worker и notification pipeline.

Sentry plugin Codex используется только для чтения issue и event context. Он не
заменяет SDK внутри RaceSide.

### Codex

Включить OpenTelemetry для наблюдаемости агентских запусков:

- prompts остаются redacted;
- фиксируются run/tool duration, success/failure и approval decisions;
- exporter не получает secret output и содержимое внешних публикаций;
- retention и доступ документируются отдельно.

## Telegram-оповещения

Создать отдельную административную destination/configuration, не смешивая её с
пользовательскими уведомлениями.

- P0: немедленно;
- P1: немедленно после подтверждения несколькими проверками;
- P2: дневной дайджест;
- P3: недельный отчёт.

Сообщение содержит: приоритет, понятное описание, время, затронутую поверхность,
короткое доказательство, текущий статус и ссылку в `/admin/findings`.

В Telegram не отправляются raw stack trace, email, IDs пользователей, payload и
секреты. Повторы одной находки обновляют счётчик и не создают spam.

## Исправление кода

Для каждой подтверждённой code finding:

1. Зафиксировать воспроизведение и evidence.
2. Найти существующий похожий паттерн.
3. Создать worktree и ветку `codex/ops-<finding-id>-<slug>`.
4. Внести минимальное локальное исправление.
5. Добавить регрессионный тест, если ошибка проверяема кодом.
6. Запустить точечные проверки.
7. Запустить `lint`, `typecheck`, релевантные tests и `build`.
8. Выполнить browser smoke затронутого сценария.
9. Проверить diff на секреты, случайные артефакты и несвязанные изменения.
10. Открыть draft PR с cause, change, evidence, checks, risk и rollback.
11. Дождаться владельца; не делать merge/deploy автоматически.
12. После deploy проверить production и перевести finding в monitoring.
13. Закрыть finding только после стабильного окна.

Текущая рабочая копия содержит незакоммиченные изменения. До первого
автоматического code workflow необходимо либо зафиксировать текущий baseline,
либо всегда создавать отдельный чистый worktree от подтверждённого commit SHA.

## CI и выпуск

Добавить GitHub Actions без изменения package manager:

- install с lockfile;
- lint;
- typecheck;
- unit/integration tests по затронутым зонам и полный обязательный набор;
- build;
- security boundary tests;
- secret scan доступным средством;
- Playwright smoke для preview/staging после появления стабильного окружения.

Production deploy остаётся отдельным подтверждаемым workflow. Миграции
применяются до web-кода только когда они backward-compatible; rollback и backup
проверяются до запуска.

## Kill switch и circuit breakers

Обязательные ограничения:

- глобальный `agent_actions_enabled`;
- отдельный toggle для каждого R2 action;
- максимум одно автодействие на fingerprint за окно;
- максимум N R2 actions в час и сутки;
- запрет действия при P0 security/data incident;
- запрет при неизвестном release/schema mismatch;
- запрет, если audit недоступен;
- запрет повторного retry после failed verification;
- автоматический переход в read-only при аномальном количестве findings;
- ручная пауза из `/admin/findings` и `/admin/systems`.

Kill switch хранится в БД с RLS и меняется только человеком. ENV используется
как аварийный верхнеуровневый запрет, но не как обычная настройка UI.

## Этапы разработки

### Этап 0. Baseline и production inventory

Задачи:

- определить подтверждённый commit SHA production;
- проверить применённые Supabase migration versions;
- зафиксировать текущие Docker services, ingress, TLS, backup и deploy flow;
- прогнать существующие lint, typecheck, tests и build;
- определить staging/preview стратегию;
- сохранить baseline публичных smoke-сценариев;
- решить судьбу текущих незакоммиченных изменений до agent branches.

Gate:

- известен source-to-production mapping;
- есть проверенный backup/restore путь;
- baseline checks записаны;
- дальнейшая работа изолирована от текущей `main` working tree.

### Этап 1. Наблюдаемость и heartbeat

Задачи:

- расширить безопасный `/api/health`;
- добавить `ops_service_heartbeats`;
- передавать release SHA в web/worker/cron/runner;
- подключить Sentry и PII scrubbing;
- добавить внешний uptime check;
- добавить базовые Telegram P0/P1 alerts без AI.

Gate:

- искусственная остановка каждого сервиса обнаруживается;
- alert не содержит секретов;
- public health не раскрывает внутреннюю архитектуру;
- Sentry группирует web и worker ошибки по release.

### Этап 2. Findings и admin UI

Задачи:

- создать новые таблицы, indexes, RLS и RPC;
- реализовать fingerprint/dedup lifecycle;
- добавить `/admin/findings`;
- вывести summary на `/admin` и `/admin/systems`;
- связать findings с jobs, articles, sources, releases и PR;
- добавить audit events и retention policy.

Gate:

- повтор одной ошибки обновляет existing finding;
- обычный пользователь ничего не читает и не пишет;
- raw payload/PII не сохраняются;
- reopen и monitoring работают предсказуемо.

### Этап 3. VPS watcher и deterministic rules

Задачи:

- добавить `ops-watcher` service и CLI-команды;
- реализовать availability/runtime, queue, schedule, freshness, content и cost
  rules;
- настроить thresholds из versioned config, не из произвольного UI;
- добавить verification после восстановления;
- сформировать дневной и недельный Telegram digest.

Gate:

- watcher работает 7 суток без AI и без mutations;
- false duplicate findings ниже согласованного порога;
- нагрузка на БД и внешние API ограничена;
- все P0/P1 тестовые сценарии обнаруживаются.

### Этап 4. Безопасный agent snapshot

Задачи:

- реализовать очищенный snapshot builder;
- добавить bounded read tools;
- настроить service authentication, rate limit и audit;
- провести тесты prompt injection и попыток запросить произвольные данные;
- документировать rotation/revocation доступа.

Gate:

- Codex видит достаточно данных для triage;
- через interface нельзя выбрать таблицу, SQL или raw payload;
- secret/PII fixtures удаляются тестами;
- отзыв доступа не требует deploy кода.

### Этап 5. Codex skill/plugin и scheduled routines

Задачи:

- создать private RaceSide Operations plugin;
- добавить skill с severity, evidence и action policies;
- подключить GitHub, Sentry и RaceSide MCP;
- настроить scheduled daily triage, editorial audit и weekly product review;
- настроить post-deploy browser smoke trigger;
- включить OTel агентских запусков.

Gate:

- первые запуски выполняются только read-only;
- каждая гипотеза явно отделена от наблюдаемого факта;
- отсутствующий источник данных указывается в отчёте;
- агент не создаёт внешние mutations без отдельного разрешённого tool.

### Этап 6. Browser QA и редакционный аудит

Задачи:

- формализовать smoke-сценарии и test accounts;
- добавить responsive, console/network, keyboard и theme checks;
- реализовать content-review sample и structured output;
- добавить editorial suggestions в admin UI;
- создать правила SEO, image и link integrity.

Gate:

- известные browser/content fixtures обнаруживаются;
- тестовые аккаунты не имеют production admin mutations;
- скриншоты очищены от персональных данных;
- AI-оценка не меняет публикацию.

### Этап 7. Исправления через GitHub

Задачи:

- добавить CI;
- автоматизировать worktree/branch/draft PR workflow;
- связать PR с finding;
- включить обязательный regression evidence и rollback note;
- добавить post-deploy verification.

Gate:

- агент не работает в грязной основной копии;
- draft PR не может автоматически merge/deploy;
- required checks блокируют выпуск;
- неуспешный production verify переоткрывает finding.

### Этап 8. Ограниченные R2 автодействия

Начальная allowlist:

- retry единичного failed `rss.fetch_all`/source fetch после cooldown;
- `news.retry_dedup` для конкретного зависшего material;
- `ai.process_news`/fallback reprocess для конкретного material при доступном
  бюджете;
- `social.retry_failed` с малым limit;
- безопасная повторная проверка results/report readiness без force;
- retry failed job только когда definition и args полностью валидны.

Не входят:

- publish/unpublish/reject;
- source pause/resume;
- notification dispatch/retry пользователю;
- predictions scoring;
- archive publish;
- history prepare/repair всего сезона;
- force report generation;
- prompt publish;
- изменение budget/schedule;
- Docker restart, migration, deploy.

Gate:

- не менее 7 суток успешного shadow recommendation режима;
- 100% action requests имеют audit и idempotency key;
- verification подтверждает восстановление;
- failed verification отключает этот action до ручного разбора;
- владелец может остановить автоматику одной настройкой.

### Этап 9. Security и устойчивость

Задачи:

- threat model agent boundary;
- prompt injection suite;
- authorization/RLS/API tests;
- dependency и secret review;
- fail-closed проверки audit/kill switch;
- backup/restore drill;
- optional Codex Security scan и triage findings;
- incident runbooks P0/P1.

Gate:

- ни один untrusted text не меняет tool policy;
- agent credential не даёт прямой доступ к БД;
- mutation endpoint отклоняет неизвестные action/job/args;
- подтверждён rollback и отзыв всех agent credentials.

### Этап 10. Production rollout

1. **Shadow:** watcher и Codex только наблюдают, 7 дней.
2. **Recommend:** агент предлагает actions/PR, человек выполняет, минимум 7 дней.
3. **Limited:** включены выбранные R2 actions с малыми лимитами.
4. **Steady state:** постоянная работа, ежемесячный review policy и метрик.

Переход между стадиями выполняется только после просмотра false positives,
пропущенных инцидентов, audit completeness и расходов.

## Регламент постоянной работы

### Непрерывно

- availability, heartbeats и P0/P1 deterministic monitoring;
- очереди, расписания, свежесть данных;
- Sentry ingestion и finding dedup;
- circuit breakers и budgets.

### После каждого deploy

- health и release consistency;
- ключевой browser smoke;
- новые Sentry errors;
- проверка затронутых маршрутов;
- перевод связанных findings в monitoring.

### Ежедневно

- triage новых P0–P2 findings;
- failed/stuck jobs и источники;
- свежесть календаря, результатов и standings;
- editorial sample последних публикаций;
- AI-расходы;
- дневной Telegram-дайджест;
- подготовка fix PR для подтверждённых ошибок.

### Еженедельно

- продуктовый и UX-аудит;
- SEO, accessibility, broken links/images;
- повторяющиеся ошибки и медленные места;
- качество источников и AI-промптов;
- неразобранные P2/P3;
- отчёт: что найдено, исправлено, предотвращено и требует решения.

### Ежемесячно

- пересмотр allowlist и thresholds;
- false positive/false negative review;
- credential rotation и access review;
- budget и retention;
- security/dependency review;
- backup/restore и incident runbook review.

## Метрики успеха

- uptime основных публичных маршрутов;
- MTTD и MTTR по P0/P1;
- доля stale sources/data windows;
- число и возраст stuck jobs;
- доля повторно открытых findings;
- false positive rate наблюдателя и AI-аудита;
- доля draft PR, прошедших checks с первой попытки;
- post-deploy regression rate;
- процент публикаций с редакционными дефектами;
- AI cost на material и доля неизвестной стоимости;
- количество автоматических действий и failed verification;
- ноль неаудированных mutations и ноль раскрытых secrets/PII.

Первичные целевые пороги утверждаются после 7-дневного shadow baseline, чтобы не
зафиксировать произвольные значения без production-данных.

## Тестирование

Минимум для каждого этапа:

- unit tests rules, fingerprints, severity и policy;
- integration tests migration/RLS/RPC;
- contract tests snapshot и MCP tools;
- secret/PII scrub fixtures;
- prompt injection fixtures;
- idempotency, rate limit и circuit breaker tests;
- simulated heartbeat/job/source failures;
- browser checks 375, 768, 1024 и 1440 px;
- lint, typecheck, relevant tests, full admin/security tests и build;
- ручная проверка P0/P1 Telegram и kill switch;
- production verification без destructive test data.

## Ожидаемые изменения в проекте

Новые или расширенные зоны:

- `src/app/api/health/route.ts` — минимальный public health;
- `src/app/api/internal/agent/*` или private MCP transport — bounded tools;
- `src/app/admin/findings/*` — новая admin surface;
- `src/data/admin-repository.ts` — очищенные operational queries;
- `src/lib/admin-agent/*` — policy, scrub, fingerprint, snapshot;
- `src/config/admin-agent-rules.json` — versioned thresholds и R2 allowlist;
- `worker/ops-watcher.mjs` — постоянные проверки;
- `worker/index.mjs` — именованные watcher commands;
- `docker-compose.yml` — `ops-watcher` service;
- `supabase/migrations/*_autonomous_admin.sql` — additive schema/RPC/RLS;
- `src/types/admin.ts`, `src/types/supabase.ts` — новые типы;
- `.github/workflows/*` — CI и post-deploy checks;
- приватный RaceSide Operations plugin/skill;
- Sentry configuration для Next.js и worker;
- tests и runbooks.

Новые зависимости допускаются только там, где текущий стек не решает задачу:
Sentry SDK и официальный MCP/plugin runtime при необходимости. Для rules,
fingerprints, scheduling и queue используются текущие Node, Next.js и Postgres.

## Последовательность выпуска

1. Baseline и чистая точка ветвления.
2. Additive migration для heartbeat/findings/action requests.
3. Health, Sentry и watcher в read-only.
4. Admin findings UI.
5. Private snapshot и agent tools.
6. Codex read-only scheduled routines.
7. Browser/editorial audits.
8. GitHub CI и draft PR workflow.
9. Shadow R2 recommendations.
10. Ограниченное включение R2.
11. Security gate и steady-state review.

Web UI разворачивается после совместимой БД. Mutating agent tools не включаются,
пока старые web/worker instances могут работать с новой схемой. Любой этап можно
отключить без остановки публичного RaceSide.

## Официальные ориентиры Codex

- Scheduled tasks могут работать с локальным проектом и отдельным worktree:
  <https://learn.chatgpt.com/docs/automations?surface=app>
- Рекомендуемый bug-triage workflow объединяет Sentry, GitHub, логи и проверки:
  <https://learn.chatgpt.com/use-cases/automation-bug-triage>
- Browser/Computer Use применяется для реального QA пользовательских сценариев:
  <https://learn.chatgpt.com/use-cases/qa-your-app-with-computer-use>
- Codex поддерживает OpenTelemetry для наблюдаемости собственных запусков:
  <https://learn.chatgpt.com/docs/config-file/config-advanced>
- Codex Security может использоваться для отдельного security review:
  <https://learn.chatgpt.com/docs/security>

## Критерий полной готовности

Codex считается внедрённым как администратор RaceSide, когда:

- production наблюдается круглосуточно без зависимости от открытого desktop;
- публичный health, heartbeats, Sentry и browser QA дают согласованные сигналы;
- findings объединяются, приоритизируются и отображаются в админке;
- Telegram сообщает P0/P1 и собирает P2/P3 дайджесты;
- Codex получает только очищенный bounded snapshot;
- safe R2 actions проходят policy, audit, idempotency и verification;
- code fixes создаются только в отдельном worktree и draft PR;
- публикация, промпты, migrations, merge и deploy требуют владельца;
- kill switch, revoke, rollback и backup проверены;
- минимум один shadow и recommend период завершены без неаудированных действий;
- еженедельный отчёт показывает качество, стоимость и влияние работы агента.
