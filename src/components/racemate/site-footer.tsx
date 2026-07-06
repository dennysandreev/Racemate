import Link from "next/link";
import { Flag } from "lucide-react";

const productLinks = [
  { href: "/data-sources", label: "Источники данных" },
  { href: "/contacts", label: "Контакты" },
];

const rulesLinks = [
  { href: "/fantasy-rules", label: "Очки fantasy" },
  { href: "/prediction-rules", label: "Правила прогнозов" },
  { href: "/community-rules", label: "Правила сообщества" },
];

const documentLinks = [
  { href: "/legal/terms", label: "Соглашение" },
  { href: "/legal/privacy", label: "Конфиденциальность" },
  { href: "/legal/cookies", label: "Cookies" },
  { href: "/legal/disclaimer", label: "Отказ от ответственности" },
];

export function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-[1440px] px-4 pb-8 sm:px-6 lg:px-8 xl:pl-[18rem]">
      <div className="relative overflow-hidden rounded-lg border border-border/75 bg-background/70">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/65 to-transparent" />
        <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(18rem,0.92fr)_minmax(0,1.38fr)] lg:items-start lg:gap-8">
          <div className="flex items-start gap-3">
            <Link
              className="group grid size-10 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground shadow-[0_0_22px_rgb(225_6_0_/_0.22)] transition-transform active:translate-y-px"
              href="/"
              prefetch={false}
              aria-label="RaceMate"
            >
              <Flag aria-hidden="true" className="size-4" />
            </Link>
            <div className="min-w-0">
              <p className="font-display text-sm font-bold leading-none text-foreground">RaceMate</p>
              <p className="mt-2 hidden text-xs leading-5 text-muted-foreground sm:block">
                © 2026 RaceMate. Проект не связан с Formula 1, FIA, командами, пилотами или правообладателями. Информация на сайте носит справочный и развлекательный характер.
              </p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground sm:hidden">
                © 2026 RaceMate. Проект не связан с Formula 1, FIA, командами, пилотами или правообладателями.
              </p>
            </div>
          </div>

          <div className="grid gap-3 border-t stitch-divider pt-4 lg:border-t-0 lg:pt-0">
            <FooterStrip links={productLinks} title="Связь" />
            <FooterStrip links={rulesLinks} title="Правила" />
            <FooterStrip links={documentLinks} title="Документы" />
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterStrip({
  links,
  title,
}: {
  links: Array<{ href: string; label: string }>;
  title: string;
}) {
  return (
    <nav
      className="grid gap-2 sm:grid-cols-[5.75rem_minmax(0,1fr)] sm:items-center"
      aria-label={title}
    >
      <h2 className="font-telemetry text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </h2>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 lg:justify-end">
        {links.map((link) => (
          <Link
            className="inline-flex max-w-full items-center whitespace-nowrap rounded-sm text-[0.78rem] font-light leading-5 text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-[0.84rem]"
            href={link.href}
            key={`${title}-${link.href}-${link.label}`}
            prefetch={false}
          >
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
