import type { LucideIcon } from "lucide-react";
import {
  ChartNoAxesCombined,
  CloudSun,
  Database,
  ExternalLink,
  ImageIcon,
  Newspaper,
} from "lucide-react";

import { AppShell } from "@/components/racemate/app-shell";
import { Badge } from "@/components/ui/badge";
import creditsManifest from "@/data/fantasy-track-photo-credits.json";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  description: "Спортивные, редакционные и визуальные источники данных RaceSide.",
  path: "/data-sources",
  title: "Источники данных",
});

type DataSource = {
  description: string;
  href?: string;
  label: string;
  name: string;
};

type DataSourceGroup = {
  description: string;
  icon: LucideIcon;
  sources: DataSource[];
  title: string;
};

const dataSourceGroups: DataSourceGroup[] = [
  {
    title: "Календарь и результаты",
    description: "Базовые данные сезона сверяются между несколькими источниками и сохраняются в RaceSide.",
    icon: Database,
    sources: [
      {
        name: "Formula1.com",
        label: "Официальные материалы",
        href: "https://www.formula1.com/",
        description: "Страницы этапов, актуальные схемы трасс и отдельные официальные таблицы результатов.",
      },
      {
        name: "Jolpica F1 API",
        label: "Сезонные данные",
        href: "https://jolpi.ca/",
        description: "Календарь, участники, классификации, зачёты и архив сезонов.",
      },
      {
        name: "OpenF1",
        label: "Данные сессий",
        href: "https://openf1.org/",
        description: "Сессии, круги, пит-стопы, погода и сообщения дирекции гонки для отчётов и повторов.",
      },
      {
        name: "Open-Meteo",
        label: "Прогноз погоды",
        href: "https://open-meteo.com/",
        description: "Прогноз по координатам трассы. Это не официальные измерения команд или FIA.",
      },
    ],
  },
  {
    title: "Новости и соцсети",
    description: "У каждой публикации сохраняется первоисточник, а ссылка ведёт к оригинальному материалу.",
    icon: Newspaper,
    sources: [
      {
        name: "Новостные редакции",
        label: "RSS и API",
        description: "Заголовки и материалы поступают из подключённых лент изданий с указанием ресурса и оригинала.",
      },
      {
        name: "X, Telegram и Reddit",
        label: "Социальная лента",
        href: "/social",
        description: "Публикации выбранных аккаунтов, каналов и сообществ после проверки релевантности.",
      },
      {
        name: "OpenRouter",
        label: "AI-обработка",
        href: "https://openrouter.ai/",
        description: "Перевод, краткие сводки и классификация. AI помогает обработать текст, но не является источником фактов.",
      },
    ],
  },
  {
    title: "Вероятности и механики",
    description: "Рыночные оценки отделены от собственных расчётов и пользовательских данных RaceSide.",
    icon: ChartNoAxesCombined,
    sources: [
      {
        name: "Polymarket",
        label: "Рыночные вероятности",
        href: "https://polymarket.com/",
        description: "Снимки вероятностей на титул и отдельные события, только когда рынок уверенно сопоставлен с этапом.",
      },
      {
        name: "RaceSide",
        label: "Собственные расчёты",
        description: "Очки прогнозов, fantasy-лиги, опросы, реакции и производные показатели считаются внутри продукта.",
      },
    ],
  },
  {
    title: "Визуальные материалы",
    description: "Карты и изображения хранят сезонный контекст и проходят проверку перед публикацией.",
    icon: ImageIcon,
    sources: [
      {
        name: "Formula1.com",
        label: "Схемы трасс",
        href: "https://www.formula1.com/en/racing/2026",
        description: "Официальные карты этапов с актуальной конфигурацией и разметкой зон обгона.",
      },
      {
        name: "Wikimedia Commons",
        label: "Фотографии трасс",
        href: "https://commons.wikimedia.org/",
        description: "Фотографии с открытыми лицензиями. Автор и лицензия каждого изображения указаны ниже.",
      },
    ],
  },
];

export default function DataSourcesPage() {
  return (
    <AppShell>
      <section className="grid gap-5 py-5">
        <header className="stitch-panel p-5 sm:p-7">
          <p className="stitch-label text-primary">Открыто и проверяемо</p>
          <h1 className="mt-3 font-display text-balance text-3xl font-extrabold tracking-[-0.04em] sm:text-5xl">
            Источники данных
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
            RaceSide объединяет официальные публикации, открытые API, редакционные ленты и
            собственные расчёты. Мы сохраняем ссылку на первоисточник и не выдаём AI-сводку или
            прогноз рынка за официальный результат.
          </p>
        </header>

        <div className="grid items-start gap-5 lg:grid-cols-2">
          {dataSourceGroups.map((group) => (
            <DataSourceSection group={group} key={group.title} />
          ))}
        </div>

        <section className="stitch-panel overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3 p-5 sm:p-7">
            <div>
              <p className="stitch-label text-primary">Фентази · сезон {creditsManifest.season}</p>
              <h2 className="mt-2 font-display text-xl font-bold">Фотографии трасс и лицензии</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Фотографии кадрированы и уменьшены без генеративного редактирования. Для каждого
                изображения ниже указаны автор, лицензия и страница оригинала.
              </p>
            </div>
            <Badge variant="secondary">{creditsManifest.tracks.length} этапа</Badge>
          </div>

          <div className="grid border-t border-border sm:grid-cols-2 xl:grid-cols-3">
            {creditsManifest.tracks.map((track) => (
              <a
                className="group min-w-0 border-b border-border p-4 transition-colors hover:bg-muted/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:border-r"
                href={track.sourcePageUrl}
                key={track.round}
                rel="noreferrer"
                target="_blank"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                    <ImageIcon aria-hidden="true" className="size-4" />
                  </span>
                  <ExternalLink
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
                  />
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <p className="font-telemetry text-xs font-bold text-muted-foreground">
                    Этап {String(track.round).padStart(2, "0")}
                  </p>
                  {track.reviewStatus === "context-only" ? (
                    <Badge variant="outline">Контекст</Badge>
                  ) : null}
                </div>
                <p className="mt-1 truncate text-sm font-bold">{track.visibleSegment}</p>
                <p className="mt-2 truncate text-xs text-muted-foreground">
                  {track.author} · {track.license}
                </p>
              </a>
            ))}
          </div>
        </section>

        <section className="stitch-panel flex items-start gap-4 p-5 sm:p-6">
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
            <CloudSun aria-hidden="true" className="size-4.5" />
          </span>
          <div>
            <h2 className="font-display text-base font-bold">Как читать эти данные</h2>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-muted-foreground">
              Скорость обновления зависит от источника. После завершения сессии RaceSide повторяет
              проверку, пока классификация не станет доступна, а официальные решения и штрафы могут
              появиться позднее. При расхождении ориентируйтесь на первоисточник.
            </p>
          </div>
        </section>
      </section>
    </AppShell>
  );
}

function DataSourceSection({ group }: { group: DataSourceGroup }) {
  const Icon = group.icon;

  return (
    <section className="stitch-panel overflow-hidden">
      <div className="flex items-start gap-4 p-5 sm:p-6">
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
          <Icon aria-hidden="true" className="size-4.5" />
        </span>
        <div>
          <h2 className="font-display text-xl font-bold">{group.title}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{group.description}</p>
        </div>
      </div>
      <div className="divide-y divide-border border-t border-border">
        {group.sources.map((source) => {
          const content = (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h3 className="text-sm font-bold text-foreground">{source.name}</h3>
                <span className="font-telemetry text-[0.65rem] font-bold uppercase text-primary">
                  {source.label}
                </span>
              </div>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{source.description}</p>
            </>
          );

          return source.href ? (
            <a
              className="group relative block px-5 py-4 pr-12 transition-colors hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:px-6 sm:pr-14"
              href={source.href}
              key={source.name}
              rel={source.href.startsWith("http") ? "noreferrer" : undefined}
              target={source.href.startsWith("http") ? "_blank" : undefined}
            >
              {content}
              <ExternalLink
                aria-hidden="true"
                className="absolute right-5 top-5 size-4 text-muted-foreground transition-colors group-hover:text-primary sm:right-6"
              />
            </a>
          ) : (
            <div className="px-5 py-4 sm:px-6" key={source.name}>
              {content}
            </div>
          );
        })}
      </div>
    </section>
  );
}
