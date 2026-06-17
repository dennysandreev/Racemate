import { CalendarDays, MapPin } from "lucide-react";
import Link from "next/link";

import { AppShell } from "@/components/racemate/app-shell";
import { PageHeading } from "@/components/racemate/page-heading";
import { RaceFlag } from "@/components/racemate/race-flag";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCalendarEvents } from "@/data/racemate-repository";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const calendarEvents = await getCalendarEvents();

  return (
    <AppShell>
      <PageHeading
        badge="Календарь"
        title="Календарь сезона"
      />

      <section className="grid gap-4 py-8 lg:grid-cols-2">
        {calendarEvents.map((event) => {
          const href = event.status === "Текущий этап" ? "/weekend" : event.href;

          return (
            <Link
              className="block h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href={href}
              key={`${event.season}-${event.round}`}
            >
              <Card
                className={`h-full transition-colors hover:bg-accent ${
                  event.status === "Текущий этап"
                    ? "border-primary bg-primary/10 shadow-sm"
                    : ""
                }`}
              >
                <CardHeader className="md:flex-row md:items-start md:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <CalendarDays aria-hidden="true" data-icon="inline-start" />
                      {event.race}
                    </CardTitle>
                    <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin aria-hidden="true" data-icon="inline-start" />
                      <RaceFlag countryCode={event.countryCode} label={event.country} value={event.countryFlag} />
                      {event.circuit}, {event.country}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">Раунд {event.round}</Badge>
                    <Badge
                      variant={
                        event.status === "Текущий этап" ? "warning" : "secondary"
                      }
                    >
                      {event.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-2">
                  <p className="font-mono text-sm text-muted-foreground">{event.date}</p>
                  {event.status === "Завершен" && event.winner ? (
                    <p className="text-sm font-medium">Победитель: {event.winner}</p>
                  ) : null}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </section>
    </AppShell>
  );
}
