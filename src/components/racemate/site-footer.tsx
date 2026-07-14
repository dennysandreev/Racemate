import Link from "next/link";
import { Flag } from "lucide-react";

const footerLinks = [
  { href: "/fantasy-rules", label: "Очки fantasy" },
  { href: "/prediction-rules", label: "Правила прогнозов" },
  { href: "/community-rules", label: "Правила сообщества" },
  { href: "/data-sources", label: "Источники данных" },
  { href: "/legal/terms", label: "Соглашение" },
  { href: "/legal/privacy", label: "Конфиденциальность" },
  { href: "/legal/cookies", label: "Cookies" },
  { href: "/legal/disclaimer", label: "Отказ от ответственности" },
  { href: "/contacts", label: "Контакты" },
];

export function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-[1440px] px-4 pb-6 sm:px-6 lg:px-8 xl:pl-[18rem]">
      <div className="relative overflow-hidden rounded-lg border border-border/75 bg-background/70">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

        <div className="relative flex flex-col gap-3.5 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
          <Link
            aria-label="RaceMate — на главную"
            className="group flex w-fit shrink-0 items-center gap-2.5"
            href="/"
            prefetch={false}
          >
            <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground shadow-[0_0_18px_rgb(225_6_0_/_0.2)] transition-transform group-active:translate-y-px">
              <Flag aria-hidden="true" className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block font-display text-sm font-extrabold leading-none text-foreground">
                RaceMate
              </span>
              <span className="stitch-label mt-1 block text-[0.5rem] text-muted-foreground">
                Гоночный центр
              </span>
            </span>
          </Link>

          <nav
            aria-label="Ссылки подвала"
            className="flex flex-wrap gap-x-4 gap-y-1.5 lg:justify-end"
          >
            {footerLinks.map((link) => (
              <Link
                className="whitespace-nowrap rounded-sm text-xs font-medium text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={link.href}
                key={link.href}
                prefetch={false}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="relative flex flex-col gap-1 border-t border-border/60 bg-background/40 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="text-[0.68rem] leading-4 text-muted-foreground/85">
            © 2026 RaceMate · Информация носит справочный и развлекательный характер
          </p>
          <p className="text-[0.68rem] leading-4 text-muted-foreground/60">
            Проект не связан с Formula 1, FIA, командами, пилотами или правообладателями
          </p>
        </div>
      </div>
    </footer>
  );
}
