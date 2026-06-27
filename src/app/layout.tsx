import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import Script from "next/script";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://racemate.ru"),
  title: "RaceMate",
  description:
    "Русскоязычный F1-хаб с новостями, AI-сводками, календарем, прогнозами и лигами.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" data-scroll-behavior="smooth">
      <head>
        <Script id="racemate-theme-init" strategy="beforeInteractive">
          {`try { document.documentElement.dataset.theme = localStorage.getItem('racemate-theme') === 'light' ? 'light' : 'dark'; } catch { document.documentElement.dataset.theme = 'dark'; }`}
        </Script>
      </head>
      <body className={`${GeistSans.variable} ${GeistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
