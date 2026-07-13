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
      <div className="relative overflow-hidden rounded-lg border border-border/75 bg-background/70 px-4 py-3.5 sm:px-5">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
        <div className="relative grid gap-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <Link
              aria-label="RaceMate — на главную"
              className="grid size-7 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground transition-transform active:translate-y-px"
              href="/"
              prefetch={false}
            >
              <Flag aria-hidden="true" className="size-3.5" />
            </Link>
            <p className="min-w-0 text-[0.72rem] leading-4 text-muted-foreground">
              <span className="font-display text-xs font-bold text-foreground">RaceMate</span>
              <span> · © 2026 · Проект не связан с Formula 1, FIA, командами, пилотами или правообладателями</span>
              <span className="hidden sm:inline"> · Информация носит справочный и развлекательный характер</span>
            </p>
          </div>
          <nav aria-label="Ссылки подвала" className="flex flex-wrap gap-x-3.5 gap-y-1 sm:pl-[2.375rem]">
            {footerLinks.map((link) => (
              <Link
                className="whitespace-nowrap rounded-sm text-[0.7rem] leading-4 text-muted-foreground/85 underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={link.href}
                key={link.href}
                prefetch={false}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
