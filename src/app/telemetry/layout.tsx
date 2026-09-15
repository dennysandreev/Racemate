import { notFound } from "next/navigation";
import { AppShell } from "@/components/racemate/app-shell";
import { telemetryFlags } from "@/features/telemetry/lib/flags";
import "@/features/telemetry/components/telemetry.css";
export default function TelemetryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!telemetryFlags.telemetryHub) notFound();
  return <AppShell viewport>{children}</AppShell>;
}
