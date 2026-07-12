import Link from "next/link";
import { Flag } from "lucide-react";

const sectionLinks = [
  { href: "/news", label: "Новости" },
  { href: "/social", label: "Соцсети" },
  { href: "/leaderboard", label: "Чемпионат" },
  { href: "/calendar", label: "Календарь" },
  { href: "/weekend", label: "Текущий этап" },
  { href: "/fantasy", label: "Фэнтези-лига" },
  { href: "/polls", label: "Опросы" },
];

const rulesLinks = [
  { href: "/fantasy-rules", label: "Очки fantasy" },
  { href: "/prediction-rules", label: "Правила прогнозов" },
  { href: "/community-rules", label: "Правила сообщества" },
  { href: "/data-sources", label: "Источники данных" },
];

const documentLinks = [
  { href: "/legal/terms", label: "Соглашение" },
  { href: "/legal/privacy", label: "Конфиденциальность" },
  { href: "/legal/cookies", label: "Cookies" },
  { href: "/legal/disclaimer", label: "Отказ от ответственности" },
  { href: "/contacts", label: "Контакты" },
];

export function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-[1440px] px-4 pb-8 sm:px-6 lg:px-8 xl:pl-[18rem]">
      <div className="stitch-panel relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgb(225_6_0_/_0.13),transparent_24rem)]" />

        <div className="relative grid gap-8 p-5 sm:p-7 lg:grid-cols-[1.5fr_repeat(3,minmax(0,1fr))] lg:gap-10">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <Link
                aria-label="RaceMate — на главную"
                className="grid size-11 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground shadow-[0_0_22px_rgb(225_6_0_/_0.24)] transition-transform active:translate-y-px"
                href="/"
                prefetch={false}
              >
                <Flag aria-hidden="true" className="size-5" />
              </Link>
              <div className="min-w-0">
                <p className="font-display text-lg font-extrabold leading-none text-foreground">RaceMate</p>
                <p className="stitch-label mt-2 text-[0.56rem] text-muted-foreground">Гоночный центр</p>
              </div>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
              Прогнозы, статистика чемпионата и повторы гонок Формулы-1 — на русском, в одном месте.
            </p>
            <span className="font-telemetry mt-4 inline-flex items-center gap-2 rounded-md border border-border/70 bg-secondary/30 px-3 py-1.5 text-[0.62rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />
              Сезон 2026
            </span>
          </div>

          <FooterColumn links={sectionLinks} title="Разделы" />
          <FooterColumn links={rulesLinks} title="Правила" />
          <FooterColumn links={documentLinks} title="Документы" />
        </div>

        <div className="relative flex flex-col gap-1.5 border-t stitch-divider px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <p className="text-xs leading-5 text-muted-foreground">
            © 2026 RaceMate. Информация носит справочный и развлекательный характер.
          </p>
          <p className="text-[0.7rem] leading-5 text-muted-foreground/75">
            Проект не связан с Formula 1, FIA, командами, пилотами или правообладателями.
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  links,
  title,
}: {
  links: Array<{ href: string; label: string }>;
  title: string;
}) {
  return (
    <nav aria-label={title} className="min-w-0">
      <h2 className="stitch-label text-muted-foreground">{title}</h2>
      <ul className="mt-3.5 grid gap-2.5">
        {links.map((link) => (
          <li key={`${title}-${link.href}-${link.label}`}>
            <Link
              className="group inline-flex max-w-full items-center gap-2 rounded-sm text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href={link.href}
              prefetch={false}
            >
              <span
                aria-hidden="true"
                className="size-1 shrink-0 rounded-full bg-border transition-all group-hover:w-2.5 group-hover:bg-primary"
              />
              <span className="min-w-0 truncate">{link.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
