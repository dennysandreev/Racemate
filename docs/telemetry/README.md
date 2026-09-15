# Telemetry Hub: локальная проверка

## Средний гоночный темп

В завершённых гоночных сессиях селектор круга содержит вариант «Средний темп гонки». Worker получает и кэширует диапазон `car_data` выбранного пилота за гонку, нормализует каждый пригодный круг на общую дистанцию и строит один средний профиль времени, скорости, газа, торможения и оборотов; передача выбирается по наиболее частому значению в каждой точке. Из расчёта исключаются круг заезда в боксы, следующий круг выезда, помеченные OpenF1 pit-out круги, удалённые и неполные круги, а также круги под жёлтым или красным флагом, SC и VSC. В карточке сравнения показывается фактическое количество использованных кругов.

## Полный редизайн

После дополнительного запроса пользователя полностью изменены композиция и визуальная система: компактная боковая навигация, графитовый фон, общая панель пилотов с портретами, отдельные панели графиков и карты, интерактивные сводки по секторам. Стартовый экран получил предпросмотр выбранных пилотов. На телефоне шапка и панель сравнения адаптируются к активному представлению.

Проверены восемь представлений на шести размерах: 375×667, 390×844, 768×1024, 1024×768, 1280×720, 1440×900. Переключение темы, настройки, создание сравнения, выбор сектора и поворота работают. Typecheck, lint, 16 тестов и production-сборка прошли. Проверка локальная, в Chromium.

Актуальные изображения: [сравнение](redesign-desktop.png), [стартовый экран](redesign-setup.png), [телефон](redesign-mobile.png), [карта на телефоне](redesign-mobile-track.png), [светлая тема](redesign-light.png).

## Изменения интерфейса от 12 сентября 2026

По уточнению пользователя экран `/telemetry` занимает высоту окна и не показывает общий подвал. Настройки после загрузки доступны через «Изменить», подробные расчёты — во вкладке «Анализ», условия и источники — во вкладке «Условия». На телефоне канал выбирается списком. Длинные таблицы и настройки прокручиваются внутри своей панели; страница остаётся неподвижной.

Геометрия карты исправлена: из controller-моделей берутся `worldX/worldY`, а не высота `worldZ`. Вертикальная ось отражается для SVG; масштаб по обеим осям одинаков. Обновлены 14 карт, введена версия `telemetry-2`. Старые сохранённые сравнения получают исправленный контур при чтении без изменения измерений.

Воспроизводимая генерация: `node scripts/sync-telemetry-track-geometry.mjs` (Node с поддержкой TypeScript stripping, как в текущем окружении проекта).

Проверки:

- `pnpm typecheck` — успешно.
- `pnpm lint` — успешно.
- `node --test worker/telemetry/*.test.mjs` — 16 проверок успешно, включая соответствие плоскости всех карт исходным моделям и пропорции Монцы.
- Браузер: 375×667, 768×1024, 1024×768, 1440×900, 1280×600. Во всех восьми представлениях размеры документа совпадают с окном, горизонтальной и вертикальной прокрутки страницы нет.
- Проверены создание сравнения GAS/RUS, открытие/закрытие настроек, переключение вкладок, мобильный выбор представления и доступность всех 11 поворотов Монцы.
- Проверки API выполнялись на отдельном локальном PostgreSQL/PostgREST с реальными сохранёнными ответами OpenF1, без изменений production.

Изображения: [desktop](desktop-viewport.png), [mobile](mobile-viewport.png), [Monza mobile](mobile-track.png).

## Известные границы проверки

Проверен Chromium с эмуляцией размеров; физические iOS/Android и Safari в этой проверке не использовались. Границы анализа поворотов приблизительные, дистанция оценивается интегрированием скорости; это обозначено в интерфейсе. Исправление контура само по себе не подтверждает инженерную точность положения машины.

Миграция `20260912125010_raceside_telemetry_hub.sql` подготовлена и проверена в изолированной базе. Публичный запуск и миграция production в этой работе не выполнялись.

### UI corrections — 12 September 2026

- Restored the standard RaceSide sidebar; Telemetry follows Current Weekend. Footer stays hidden and the workspace fits the viewport.
- Replaced oversized setup with a compact session strip and driver/lap selections. Removed duplicate routes to best/manual/teammate comparisons; current fixture lap IDs themselves were unique.
- Corner detail now has four local metrics and a local time advantage, matched by corner number. Removed the 27-row mixture of lap and corner statistics from this panel.
- Added corner apex markers to every chart above the distance ticks, including zoom filtering and staggered nearby labels.
- Browser evidence: `settings-v4-desktop.png`, `settings-v4-mobile.png`, `corner-detail-v4.png`, `graph-corners-1440.png`, `graph-corners-375.png`. First and last corner values were checked against the saved comparison. Desktop and mobile document bounds match their viewport.

### Stage-style panels and share cards — 12 September 2026

The telemetry container now matches `/weekend`: at 1440px viewport, both start at x=288 and have 1120px content width. The entry title, setup and recent comparisons are framed consistently; the comparison title and driver strip share one panel. Grand Prix names come from the cached meeting catalog, including saved pages. The Conditions tab was removed and the map renamed «Карта трассы».

Share cards use the existing RaceSide logo component, embedded local portraits and Geist fonts, with distinct overview/chart/map/corner/insight compositions. The three sizes remain 1600×900, 1080×1350 and 1080×1920. A versioned preview URL refreshes the former cached design. Corner cards report corner times rather than whole-lap times. Seven representative format/variant combinations returned PNG successfully and were visually inspected. Lint, typecheck, 16 telemetry tests and production build passed. These checks used the isolated local preview and cached Monza comparison, not a production deployment.

The Analysis tab now always shows the whole lap, regardless of a corner selected on the Track tab. Corner switches and generated insight paragraphs were removed from Analysis. Verified in the browser by selecting corner 1, then opening Analysis: whole-lap metrics present, zero corner buttons, no insight text.

### Corner navigation and shared cursor

Replaced the Whole Lap action with a shared corner menu and previous/next arrows, removed the duplicate corner row and zoom/pan selector. Whole-lap Analysis remains independent. The controlled distance slider, readout, chart cursors and track dots share one subscribed position. Cursor cleanup resets the cancelled animation frame so later subscribers continue receiving updates. A regression test is included in `pnpm test:telemetry`. Browser checks covered 3000m positioning on the map, corner 5 → 6 → 5, whole-lap reset, and the mobile dropdown.

### 12 September — compact data workspace and image-only sharing

- Combined gear/RPM in one «Мотор и передачи» view and removed DRS from the Hub display contract, charts and analysis. Existing raw provider cache is unchanged.
- Grand Prix options use short names (for example «Италии»); comparison headings retain the complete race name.
- Driver summaries are 70px tall at 1440px, with 32px portraits. Setup portraits and spacing are also reduced. Sector rows align with the bottom of the map.
- All 15 share format/variant combinations rendered HTTP 200 on the local Monza comparison. Corner labels appear on the track and distance axis. Cards contain no route breadcrumb or website URL.
- Share dialog prepares a PNG before the click and passes only `files` to native sharing. File sharing was checked with a browser API stub; no real social post was sent. Unsupported browsers download PNG and explain how to attach it. Download fallback was verified in Chromium.
- Browser checks at 375, 768, 1024 and 1440px confirmed no document overflow. Gear/RPM, DRS absence in analysis, and shortened Grand Prix options were checked.
- Screenshots: `compact-v7-desktop.png`, `compact-v7-mobile.png`, `share-v7-{landscape,post,story}-{overview,telemetry,advantage,corner,insight}.png`.

Validation for this update: `pnpm lint`, the final targeted ESLint run, `pnpm typecheck`, and all 17 telemetry tests passed. Format changes and closing/reopening the share dialog were verified with a 1080×1350 PNG and no alerts. Production build is not confirmed: the default Turbopack run stalled; `next build --webpack` failed on the unrelated existing client import chain `admin-schedule-list.tsx → admin-job-catalog.ts → node:crypto`. Those admin files were not changed in this task. No deployment or real social post was performed.

### Analytics export and shared page introduction

Added «Аналитика круга» in all three export sizes, with map/chart corner labels and nine whole-lap rows (no gears or DRS). Screen and image use `lapAnalysisRows` so missing data and values are consistent. PNG renders and dialog selection were checked locally. Header typography and padding were compared with `/social` computed styles: 30px/800 desktop title, 14px/400 description with 24px line-height, red stitch-label and 20px padding. Recent history was removed, including storage reads/writes and CSS. Header has content-based height, and the red label remains in saved comparisons. Browser confirmed 20px top inset, no history even with old localStorage entries, and no mobile page overflow.

Lint, TypeScript and 17 telemetry tests passed. The production build still fails in the unrelated admin client import of `node:crypto` (`admin-job-catalog.ts`); no admin changes or deployment were made.

### Shared desktop sidebar density

Reduced AppShell sidebar spacing and navigation row heights site-wide. Browser checks at 1440px wide and 500/600/650/700/768/900px high confirmed all nine public links fit with no scrolling; account/theme controls stay visible. CSS admin overflow was verified by inserting a local DOM-only Admin link in an isolated browser context (no access or roles were changed). The admin row remains controlled by the existing server permission check. Also checked keyboard focus on the last link at 1280×600 and unchanged mobile menu at 375×667.

Full lint and TypeScript passed. Four existing season-navigation tests passed when run directly without the obsolete `--experimental-default-type=module` flag rejected by installed Node 26. The production Webpack build failed with a Next.js uncaught TypeError (`Cannot read properties of undefined (reading 'length')`); production build remains unconfirmed and no deployment was made.

### Tab overflow and loading indicator

Removed the shared TabsTrigger underline pseudo-element from telemetry's bordered tabs: its negative bottom offset made both 40px rows have 42px scroll height. Both strips now measure 40/40px, with vertical overflow disabled and an inset keyboard focus outline. Checked setup and all six comparison views at 375, 768, 1024, 1280 and 1440px widths; horizontal tab navigation remains available where needed.

Replaced the skeleton grid with a compact status panel, a rotating Lucide gear and «Готовим данные / Первый запуск может занять немного времени». The panel reserves its height so it stays visible during preparation, including at 1280×600 and 375×667. Mocked 202 responses in an isolated browser context verified initial loading and preparation after submitting a comparison, zero skeletons, no document overflow, and reduced-motion support. Screenshots: `tabs-no-scroll-desktop.png`, `loading-gear-desktop.png`, `loading-gear-1280.png`, `loading-gear-375.png`.

Full lint, TypeScript and all 17 telemetry tests passed. Webpack production build remains blocked by the unrelated admin client import chain `admin-schedule-list.tsx → admin-job-catalog.ts → node:crypto`. No deployment was made.

### Team colors across telemetry

Charts, cursor values, driver accents, analysis headings, track segments and share exports now use the cached OpenF1 driver team color. The first trace is solid, the second dashed; matching colors receive a background outline below the second chart trace so complete overlaps retain a visible dash pattern. Legends use the same solid/dashed convention, and map cursors are filled/hollow. Hex validation keeps provider colors safe for generated SVG and missing colors fall back to neutral gray. Share preview cache version is now 5.

Browser checks covered every chart channel with Alpine/Mercedes data, a mocked same-color/full-overlap comparison (no stored data changed), mobile width 375px, and track/legend patterns. Overview, analysis and telemetry share cards returned valid PNGs with team colors. Full lint, final scoped lint, TypeScript and 19 tests passed, including color ordering, matching colors and unsafe/missing color inputs. Production Webpack build still fails on the existing unrelated admin `node:crypto` import. No deployment was made.

### 13 September — setup mode switch and header height

Replaced the three uppercase mode buttons with a single segmented control, sentence-case labels, desktop icons and a raised active segment. Removed the obsolete mode-tab overrides. Setup header now matches News at 160px on desktop and uses its 184px minimum on smaller screens; the comparison header remains 131.5px tall on desktop. Browser checks covered 1440×900, 1280×600, 768×800 and 375×667: all three mode selections and keyboard arrows work, tab client/scroll heights match, and the document does not overflow. Screenshots: `mode-switch-1440.png` and `mode-switch-375.png`.

Lint, TypeScript and 19 telemetry tests passed. Production build remains blocked by the unrelated existing admin client import of `node:crypto`; no deployment was made.

The loading panel was subsequently enlarged to a 180px minimum with a 48px rotating gear and centered 16px title/13px description. Browser checks with a pending comparison at 1440×900, 1280×600 and 375×667 confirmed the entire panel remains visible without document overflow. Screenshots: `loading-large-1440.png`, `loading-large-1280.png`, `loading-large-375.png`.

### 13 September — editing flow, teammate colors and analysis clarity

Catalog loading during comparison editing now stays in the open dialog: the current workspace remains visible, controls are temporarily disabled and the action reads «Обновляем выбор». Selecting a driver requires no request or loading state. Submitting closes the dialog and uses the full loading panel once for the new comparison. The browser flow verified all three states with a real uncached session/catalog request.

Removed dashed telemetry traces throughout the hub and share exports. Different teams keep their OpenF1 colors; teammates and two laps of one driver use the team color plus neutral `#9aa1ad`. Track segments with near-equal pace use a darker gray so the neutral driver remains distinguishable. Browser validation with Norris/Piastri confirmed orange and neutral solid lines, matching legends, no page overflow and no `stroke-dasharray` on data traces.

Whole-lap analysis now calls the braking metric «Путь под торможением» and explains that it is the sum of sections where the brake is pressed beyond halfway. Gear 0 is omitted. The stronger value is bold for speed, full-throttle, sector and gear-share comparisons; braking distance and braking positions stay neutral because lower or later is not inherently better. The same ranking is used by the analytics share card, whose cache version is 6. Mobile validation confirmed no horizontal overflow. Full lint, TypeScript, 17 telemetry tests and five focused formatting tests passed. The generated 1600×900 analytics PNG was inspected. Production Webpack build remains blocked by the existing unrelated admin client import of `node:crypto`; no deployment was made.

### 13 September — sectors and delta in share cards

Share maps now place readable numbered corner markers with collision handling and label all three sectors. Whole-lap graphs show S1–S3, sector boundaries and corner numbers on the distance axis. The «Аналитика круга» export always uses a delta graph with a signed seconds scale and a visible zero line. OpenF1/source metadata was removed from every telemetry image, and the recovered footer space is used by the data panels.

The dense 22-corner Madring comparison and the 11-corner Monza comparison were rendered as 1600×900 PNGs. Madring analytics was also checked at 1080×1350 and 1080×1920, plus the overview card. Lint, TypeScript, all 17 telemetry tests and five formatting tests passed. Production Webpack build remains blocked by the existing unrelated admin client import chain `admin-schedule-list.tsx → admin-job-catalog.ts → node:crypto`; no deployment was made.

Corner-number overlays were subsequently removed from share maps and graph axes to reduce visual noise; S1–S3 remain as the only spatial annotations. Graphs use the released axis space for a taller data plot. The dedicated corner card still names its selected corner because that context is required to understand the local comparison. The red acquisition band follows the Fantasy share layout with a two-line telemetry message on the left and `raceside.online/telemetry` plus a compact invitation on the right. Madring exports use «Гран-при Испании» as the primary title and keep Madring in the secondary circuit line. Share preview cache version is 9.

Share graph labels use small font-independent vector glyphs instead of SVG text. This keeps the delta scale, distance labels and S1–S3 headings readable in every `ImageResponse` render process, including environments where nested SVG fonts are ignored. Map sector pills were removed; two short perpendicular cuts now cross the circuit at the exact starts of sectors 2 and 3. Share preview cache version is 11.

The comparison view switch («Обзор», «Скорость», «Педали», «Мотор и передачи», «Трасса», «Анализ») now reuses the setup mode's segmented surface, Geist Sans labels and raised active state. At widths below 900px the existing compact select takes over before the long row can clip. Browser checks at 1024, 900 and 768px confirmed complete labels, working tab selection and no horizontal control overflow.

### 15 September — two fixed sharing dashboards

Telemetry sharing now offers only horizontal 1600×900 and vertical 1080×1920 cards. Variant and graph selectors were removed from the dialog and image route. Both orientations contain the complete comparison dashboard: weather and circuit length, two drivers, finish delta, delta/speed/throttle/braking/gear/RPM plots, track map with corner positions and sector results, and the whole-lap analysis table. Graph headers omit the live or summary values shown in the design references. Legacy `landscape`, `post` and `story` query values remain mapped to one of the two current orientations so existing links do not fail. Share preview cache version is 13.

Both dashboard images were generated from the saved Norris/Antonelli Madring qualifying comparison and inspected at their full output sizes. The share dialog was checked in a browser: switching orientation replaces the preview and keeps native sharing plus PNG download as the only actions. Graph distance ticks were subsequently removed and corner numbers moved to the lower axis. The vertical lap-analysis table uses larger labels and values.

Sector gaps now use the provider's lap-sector times, matching «Разбор круга». Telemetry elapsed time at the geometric sector boundaries is retained only as a fallback when complete lap-sector timing is unavailable. The renderer derives gaps again from stored lap timing, so comparisons saved before this change also display consistent sector results. Share graph corner labels use bare numbers without the `T` prefix. Share preview cache version is 14.
