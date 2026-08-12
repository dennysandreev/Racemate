import { AppShell } from "@/components/racemate/app-shell";

export default function DriversLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <AppShell>{children}</AppShell>;
}
