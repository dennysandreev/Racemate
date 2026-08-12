/* eslint-disable @next/next/no-img-element */
import { RaceSideShareLogo } from "@/components/racemate/driver-comparison-share-image";
import { formatGrandPrixNameRu } from "@/lib/race-display";
import type { DriverComparisonDriver } from "@/types/racemate";

const colors = {
  background: "#090909",
  border: "#29292c",
  muted: "#aaa6a3",
  primary: "#e10600",
  surface: "#121214",
  text: "#f5f4f2",
};

const sansFont = "Geist, Arial, Helvetica, sans-serif";
const monoFont = "Geist Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

export function DriverComparisonOgImage({
  left,
  raceName,
  right,
  round,
  season,
}: {
  left: DriverComparisonDriver;
  raceName: string;
  right: DriverComparisonDriver;
  round: number;
  season: number;
}) {
  const grandPrixName = formatGrandPrixNameRu(raceName);

  return (
    <div
      style={{
        background: colors.background,
        color: colors.text,
        display: "flex",
        flexDirection: "column",
        fontFamily: sansFont,
        height: 630,
        overflow: "hidden",
        padding: "38px 48px 0",
        width: 1200,
      }}
    >
      <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
        <RaceSideShareLogo />
        <div style={{ alignItems: "flex-end", display: "flex", flexDirection: "column" }}>
          <span style={{ color: colors.primary, display: "flex", fontFamily: monoFont, fontSize: 17, fontWeight: 900, letterSpacing: 1.6 }}>
            СЕЗОН {season} · ЭТАП {round}
          </span>
          <span style={{ color: colors.muted, display: "flex", fontSize: 16, fontWeight: 700, marginTop: 7 }}>
            {truncate(grandPrixName, 52)}
          </span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: 32 }}>
        <span style={{ color: colors.primary, display: "flex", fontFamily: monoFont, fontSize: 15, fontWeight: 900, letterSpacing: 2.2 }}>
          СРАВНЕНИЕ ПИЛОТОВ
        </span>
        <span style={{ display: "flex", fontSize: 35, fontWeight: 900, letterSpacing: "-0.035em", marginTop: 8 }}>
          Кто сильнее после {truncate(grandPrixName, 48)}?
        </span>
      </div>

      <div style={{ alignItems: "stretch", display: "flex", flex: 1, marginTop: 28 }}>
        <OgDriver align="left" driver={left} />
        <div style={{ alignItems: "center", display: "flex", flexDirection: "column", justifyContent: "center", width: 126 }}>
          <span style={{ color: colors.primary, display: "flex", fontFamily: monoFont, fontSize: 22, fontWeight: 900 }}>VS</span>
          <span style={{ background: colors.border, display: "flex", height: 86, marginTop: 14, width: 1 }} />
        </div>
        <OgDriver align="right" driver={right} />
      </div>

      <div
        style={{
          alignItems: "center",
          background: colors.primary,
          display: "flex",
          height: 82,
          justifyContent: "space-between",
          marginLeft: -48,
          marginRight: -48,
          marginTop: 24,
          padding: "0 48px",
        }}
      >
        <span style={{ display: "flex", fontSize: 23, fontWeight: 900 }}>Сравнение на RaceSide</span>
        <span style={{ display: "flex", fontFamily: monoFont, fontSize: 17, fontWeight: 900 }}>raceside.online</span>
      </div>
    </div>
  );
}

function OgDriver({
  align,
  driver,
}: {
  align: "left" | "right";
  driver: DriverComparisonDriver;
}) {
  const color = normalizeColor(driver.team.color);

  return (
    <div
      style={{
        alignItems: align === "right" ? "flex-end" : "flex-start",
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        display: "flex",
        flex: 1,
        flexDirection: "column",
        justifyContent: "center",
        padding: "24px 30px",
        textAlign: align,
      }}
    >
      <div style={{ alignItems: "center", display: "flex", flexDirection: align === "right" ? "row-reverse" : "row", gap: 24 }}>
        <span style={{ border: `4px solid ${color}`, borderRadius: 999, display: "flex", height: 154, overflow: "hidden", width: 154 }}>
          {driver.avatarUrl ? (
            <img alt="" height="148" src={driver.avatarUrl} style={{ height: 148, objectFit: "cover", width: 148 }} width="148" />
          ) : null}
        </span>
        <div style={{ alignItems: align === "right" ? "flex-end" : "flex-start", display: "flex", flexDirection: "column", maxWidth: 260 }}>
          <span style={{ display: "flex", fontSize: getNameSize(driver.fullName), fontWeight: 900, letterSpacing: "-0.035em", lineHeight: 1.02 }}>
            {truncate(driver.fullName, 28)}
          </span>
          <span style={{ color, display: "flex", fontFamily: monoFont, fontSize: 14, fontWeight: 900, marginTop: 14 }}>
            № {driver.number ?? "?"} · {truncate(driver.team.name, 18)}
          </span>
        </div>
      </div>
    </div>
  );
}

function normalizeColor(value?: string | null) {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : colors.primary;
}

function getNameSize(value: string) {
  if (value.length > 24) return 25;
  if (value.length > 18) return 29;
  return 33;
}

function truncate(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1).trimEnd()}…`;
}
