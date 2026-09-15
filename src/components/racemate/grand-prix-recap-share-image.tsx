/* eslint-disable @next/next/no-img-element */

import type { CSSProperties, ReactNode } from "react";

import {
  getGrandPrixRecapImageLayout,
  getGrandPrixRecapStrategyLayout,
  type GrandPrixRecapData,
} from "@/lib/grand-prix-recap";

type GrandPrixRecapShareImageData = Omit<GrandPrixRecapData, "bestTeam" | "podium" | "track"> & {
  bestTeam: GrandPrixRecapData["bestTeam"] & { carImageUrl: string | null };
  breakthroughIconUrl: string | null;
  dhlLogoUrl: string | null;
  podium: Array<GrandPrixRecapData["podium"][number] & { avatarUrl: string | null }>;
  track: GrandPrixRecapData["track"] & { imageUrl: string | null };
  timerIconUrl: string | null;
};

const colors = {
  background: "#070707",
  border: "#353538",
  muted: "#b8b5b2",
  primary: "#e10600",
  surface: "#111113",
  text: "#f5f4f2",
};

export function GrandPrixRecapShareImage({ data }: { data: GrandPrixRecapShareImageData }) {
  const podiumByPosition = new Map(data.podium.map((entry) => [entry.position, entry]));
  const podiumOrder = [2, 1, 3] as const;
  const hasSprintPodium = Boolean(data.sprintPodium?.length);
  const titleLayout = getGrandPrixRecapImageLayout(data.raceName);

  return (
    <div
      style={{
        backgroundColor: colors.background,
        backgroundImage: "radial-gradient(circle at 50% 28%, #1b1b1e 0%, #090909 34%, #050505 72%)",
        color: colors.text,
        display: "flex",
        flexDirection: "column",
        fontFamily: "Geist",
        height: "100%",
        padding: "32px 34px 0",
        position: "relative",
        width: "100%",
      }}
    >
      <div style={{ backgroundColor: colors.primary, height: 7, left: 0, position: "absolute", top: 0, width: "100%" }} />

      <header
        style={{
          alignItems: "center",
          borderBottom: `1px solid ${colors.primary}`,
          display: "flex",
          height: 58,
          justifyContent: "space-between",
          paddingBottom: 14,
        }}
      >
        <RaceSideLogo />
        <div style={{ color: colors.muted, display: "flex", fontSize: 20, fontWeight: 900, letterSpacing: "0.07em", textTransform: "uppercase" }}>
          Сезон {data.season} · Этап {data.round}
        </div>
      </header>

      <section style={{ display: "flex", height: titleLayout.heroHeight, justifyContent: "space-between", paddingTop: 22 }}>
        <div style={{ display: "flex", flexDirection: "column", width: 610 }}>
          <div style={{ color: colors.primary, display: "flex", fontSize: 22, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Итоги
          </div>
          <div style={{ display: "flex", fontSize: titleLayout.titleFontSize, fontWeight: 900, height: titleLayout.titleHeight, letterSpacing: "-0.035em", lineHeight: titleLayout.titleLineHeight, marginTop: 6, textTransform: "uppercase" }}>
            {data.raceName}
          </div>
          <div style={{ alignItems: "center", color: colors.muted, display: "flex", fontSize: 20, fontWeight: 900, letterSpacing: "0.035em", marginTop: titleLayout.titleMetaMarginTop, textTransform: "uppercase" }}>
            {data.dateLabel} · {data.circuitName}
          </div>
          <div style={{ alignItems: "center", color: colors.muted, display: "flex", fontSize: 20, fontWeight: 900, marginTop: 10, textTransform: "uppercase" }}>
            <WeatherIcon rainy={data.weather.label === "Дождь"} />
            <span style={{ marginLeft: 9 }}>{data.weather.label}</span>
            {data.weather.temperatureC !== null ? <span> · {formatTemperature(data.weather.temperatureC)} °C</span> : null}
          </div>
        </div>

        <TrackVisual data={data} />
      </section>

      <section style={{ alignItems: "flex-end", display: "flex", height: 396, justifyContent: "center", padding: "0 8px" }}>
        {podiumOrder.map((position) => {
          const entry = podiumByPosition.get(position);

          if (!entry) {
            return null;
          }

          return <PodiumEntry entry={entry} key={position} />;
        })}
      </section>

      <section
        style={{
          alignItems: "center",
          borderBottom: `1px solid ${colors.border}`,
          borderTop: `1px solid ${colors.border}`,
          display: "flex",
          height: 188,
          justifyContent: "space-between",
        }}
      >
        <div style={{ alignItems: "center", display: "flex", flex: 1, height: "100%", justifyContent: "space-between", padding: "14px 14px 10px" }}>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: hasSprintPodium ? 270 : 350 }}>
            <div style={eyebrowStyle}>Команда этапа</div>
            <div style={{ display: "flex", fontSize: hasSprintPodium ? 27 : 30, fontWeight: 900, lineHeight: 1.05, marginTop: 8, textTransform: "uppercase" }}>
              {data.bestTeam.name}
            </div>
            <div style={{ alignItems: "center", display: "flex", fontSize: 21, fontWeight: 900, marginTop: 9, textTransform: "uppercase" }}>
              <span style={{ backgroundColor: data.bestTeam.color, display: "flex", height: 4, marginRight: 10, width: 28 }} />
              {formatPoints(data.bestTeam.points)}
            </div>
            <div style={{ color: colors.muted, display: "flex", fontSize: 18, fontWeight: 900, letterSpacing: "0.07em", marginTop: 7, textTransform: "uppercase" }}>
              {data.bestTeam.pointsLabel}
            </div>
          </div>
          <div style={{ alignItems: "center", display: "flex", height: 164, justifyContent: "flex-end", position: "relative", width: hasSprintPodium ? 410 : 640 }}>
            {data.bestTeam.carImageUrl ? (
              <>
                <div
                  style={{
                    backgroundImage: `radial-gradient(ellipse at center, ${data.bestTeam.color} 0%, ${data.bestTeam.color} 24%, transparent 76%)`,
                    bottom: -5,
                    display: "flex",
                    height: 48,
                    opacity: 0.9,
                    position: "absolute",
                    right: 0,
                    width: hasSprintPodium ? 390 : 590,
                  }}
                />
                <img alt="" height="158" src={data.bestTeam.carImageUrl} style={{ height: 158, objectFit: "contain", objectPosition: "center right", position: "relative", width: hasSprintPodium ? 405 : 630 }} width={hasSprintPodium ? "405" : "630"} />
              </>
            ) : (
              <div style={{ color: colors.muted, display: "flex", fontSize: 20, fontWeight: 800 }}>Изображение болида готовится</div>
            )}
          </div>
        </div>
        {hasSprintPodium ? <SprintPodium entries={data.sprintPodium ?? []} /> : null}
      </section>

      <section style={{ display: "flex", height: 218, marginTop: 12 }}>
        <StatPanel icon={<StatIcon alt="Таймер" src={data.timerIconUrl} />} label="Поул" value={data.pole?.driver ?? "Уточняется"} detail={data.pole?.time ?? null} />
        <StatPanel icon={<StatIcon alt="Прорыв" src={data.breakthroughIconUrl} />} label="Прорыв дня" value={data.heroHighlight?.driver ?? "Уточняется"} detail={data.heroHighlight?.value ?? null} />
        <StatPanel icon={<StatIcon alt="Таймер" src={data.timerIconUrl} />} label="Лучший круг" value={data.fastestLap?.driver ?? "Уточняется"} detail={formatFastestLap(data.fastestLap)} />
        <PitStopPanel data={data.fastestPitStop} logoUrl={data.dhlLogoUrl} />
      </section>

      <section
        style={{
          alignItems: "center",
          border: `1px solid ${colors.border}`,
          display: "flex",
          height: 88,
          justifyContent: "space-between",
          marginTop: 12,
          padding: "0 26px",
        }}
      >
        <div style={{ ...eyebrowStyle, flexShrink: 0, width: 210 }}>Основные стратегии</div>
        <div style={{ alignItems: "center", display: "flex", flex: 1, minWidth: 0 }}>
          {data.strategies.length ? data.strategies.slice(0, 2).map((strategy, index) => (
            <Strategy sequence={strategy.sequence} drivers={strategy.drivers} index={index} key={`${strategy.sequence.join("-")}-${index}`} />
          )) : <span style={{ color: colors.muted, display: "flex", fontSize: 19, fontWeight: 800 }}>Стратегии уточняются</span>}
        </div>
      </section>

      <section
        style={{
          alignItems: "center",
          border: `1px solid ${colors.border}`,
          display: "flex",
          height: 60,
          justifyContent: "center",
          marginTop: 12,
        }}
      >
        <span style={{ color: colors.text, display: "flex", fontSize: 19, fontWeight: 900, letterSpacing: "0.09em", textTransform: "uppercase" }}>
          🏁 &nbsp; {formatYellowFlags(data.raceFlow.yellowFlags)} · {data.raceFlow.safetyCars} SC · {data.raceFlow.virtualSafetyCars} VSC · {formatRedFlags(data.raceFlow.redFlags)}
        </span>
      </section>

      <footer
        style={{
          alignItems: "center",
          backgroundColor: colors.primary,
          bottom: 0,
          display: "flex",
          height: 68,
          justifyContent: "space-between",
          left: 0,
          padding: "0 42px",
          position: "absolute",
          width: "100%",
        }}
      >
        <span style={{ display: "flex", fontSize: 29, fontWeight: 900 }}>raceside.online</span>
        <span style={{ display: "flex", fontSize: 17, fontWeight: 900, letterSpacing: "0.045em", textTransform: "uppercase" }}>
          Новости, аналитика и статистика мира автоспорта
        </span>
      </footer>
    </div>
  );
}

function RaceSideLogo() {
  return (
    <div style={{ alignItems: "center", display: "flex", gap: 8 }}>
      <svg aria-hidden="true" height="36" viewBox="0 0 136 64" width="77">
        <path
          d="M5 59 18 7h27c12 0 19 6 19 15 0 10-8 17-20 17H27l23 20"
          fill="none"
          stroke={colors.primary}
          strokeLinecap="square"
          strokeLinejoin="round"
          strokeWidth="10"
        />
        <path
          d="M129 8H95c-10 0-16 5-16 13 0 7 6 11 15 11h19c10 0 16 5 16 13 0 8-6 13-16 13H76"
          fill="none"
          stroke={colors.primary}
          strokeLinecap="square"
          strokeLinejoin="round"
          strokeWidth="10"
        />
      </svg>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ display: "flex", fontSize: 25, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1 }}>
          RaceSide
        </span>
        <span style={{ color: colors.muted, display: "flex", fontFamily: "Geist Mono", fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", marginTop: 4 }}>
          Гоночный центр
        </span>
      </div>
    </div>
  );
}

function TrackVisual({ data }: { data: GrandPrixRecapShareImageData }) {
  const fittedViewBox = data.track.svgPath ? getFittedTrackViewBox(data.track.svgPath) : null;

  return (
    <div style={{ alignItems: "center", display: "flex", height: 170, justifyContent: "center", width: 360 }}>
      {data.track.imageUrl ? (
        <img alt="" height="160" src={data.track.imageUrl} style={{ height: 160, objectFit: "contain", opacity: 0.9, width: 350 }} width="350" />
      ) : data.track.svgPath && fittedViewBox ? (
        <svg height="160" preserveAspectRatio="none" viewBox={fittedViewBox} width="350">
          <path d={data.track.svgPath} fill="none" stroke="#a8a8aa" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" vectorEffect="non-scaling-stroke" />
        </svg>
      ) : null}
    </div>
  );
}

function SprintPodium({ entries }: { entries: NonNullable<GrandPrixRecapData["sprintPodium"]> }) {
  const medalColors = ["#f3c654", "#d2d5d9", "#d38b60"];

  return (
    <div style={{ borderLeft: `1px solid ${colors.border}`, display: "flex", flexDirection: "column", height: "100%", justifyContent: "center", padding: "14px 18px", width: 310 }}>
      <div style={{ ...eyebrowStyle, fontSize: 18 }}>Спринт · топ-3</div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 9 }}>
        {entries.slice(0, 3).map((entry, index) => (
          <div style={{ alignItems: "center", display: "flex", height: 39 }} key={`${entry.position}-${entry.driver}`}>
            <span style={{ color: medalColors[index] ?? colors.text, display: "flex", fontSize: 25, fontWeight: 900, justifyContent: "center", width: 30 }}>{entry.position}</span>
            <span style={{ backgroundColor: entry.teamColor, display: "flex", height: 3, margin: "0 10px", width: 20 }} />
            <span style={{ display: "flex", fontSize: 18, fontWeight: 900, lineHeight: 1, textTransform: "uppercase" }}>{getStatName(entry.driver)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PodiumEntry({ entry }: { entry: GrandPrixRecapShareImageData["podium"][number] }) {
  const isWinner = entry.position === 1;
  const height = isWinner ? 204 : entry.position === 2 ? 164 : 150;
  const width = isWinner ? 340 : 290;
  const avatarSize = isWinner ? 184 : 146;
  const medalColor = isWinner ? "#f3c654" : entry.position === 2 ? "#d2d5d9" : "#d38b60";

  return (
    <div style={{ alignItems: "center", display: "flex", flexDirection: "column", width }}>
      <div
        style={{
          alignItems: "center",
          backgroundColor: "#151517",
          border: `3px solid ${entry.teamColor}`,
          borderRadius: "999px",
          display: "flex",
          height: avatarSize,
          justifyContent: "center",
          overflow: "hidden",
          width: avatarSize,
        }}
      >
        {entry.avatarUrl ? (
          <img alt="" height={avatarSize} src={entry.avatarUrl} style={{ height: avatarSize, objectFit: "cover", width: avatarSize }} width={avatarSize} />
        ) : (
          <span style={{ display: "flex", fontSize: 40, fontWeight: 900 }}>{getInitials(entry.driver)}</span>
        )}
      </div>
      <div
        style={{
          alignItems: "center",
          backgroundColor: colors.surface,
          border: `1px solid ${colors.border}`,
          borderTop: `4px solid ${medalColor}`,
          display: "flex",
          flexDirection: "column",
          height,
          justifyContent: "flex-start",
          marginTop: 7,
          padding: "10px 12px 0",
          width: "100%",
        }}
      >
        <span style={{ color: medalColor, display: "flex", fontSize: isWinner ? 52 : 43, fontWeight: 900, lineHeight: 1 }}>{entry.position}</span>
        <span style={{ display: "flex", fontSize: isWinner ? 25 : 22, fontWeight: 900, lineHeight: 1.04, marginTop: 4, textAlign: "center", textTransform: "uppercase" }}>{getPodiumName(entry.driver)}</span>
        <span style={{ color: entry.teamColor, display: "flex", fontSize: 18, fontWeight: 900, letterSpacing: "0.065em", marginTop: 7, textTransform: "uppercase" }}>{entry.team}</span>
        {entry.gapToWinner ? (
          <span style={{ color: colors.text, display: "flex", fontSize: 18, fontWeight: 900, letterSpacing: "0.04em", marginTop: 7, textTransform: "uppercase" }}>{entry.gapToWinner}</span>
        ) : null}
        {entry.raceTime ? (
          <div style={{ alignItems: "center", display: "flex", flexDirection: "column", marginTop: 8 }}>
            <span style={{ color: colors.muted, display: "flex", fontSize: 13, fontWeight: 900, letterSpacing: "0.07em", textTransform: "uppercase" }}>
              Время победителя
            </span>
            <span style={{ color: colors.text, display: "flex", fontSize: 18, fontWeight: 900, letterSpacing: "0.025em", marginTop: 3 }}>
              {entry.raceTime}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StatPanel({ detail, icon, label, value }: { detail: string | null; icon: ReactNode; label: string; value: string }) {
  return (
    <div style={{ border: `1px solid ${colors.border}`, display: "flex", flex: 1, flexDirection: "column", padding: "18px 18px 16px" }}>
      <div style={{ alignItems: "center", display: "flex", height: 46 }}>
        {icon}
        <span style={{ ...eyebrowStyle, fontSize: 17, lineHeight: 1.05, marginLeft: 11 }}>{label}</span>
      </div>
      <span style={{ alignItems: "center", display: "flex", fontSize: 22, fontWeight: 900, lineHeight: 1.08, minHeight: 58, textTransform: "uppercase" }}>{getStatName(value)}</span>
      {detail ? <span style={{ color: colors.muted, display: "flex", fontSize: detail.length > 18 ? 17 : 19, fontWeight: 900, lineHeight: 1.15, marginTop: 12 }}>{detail}</span> : null}
    </div>
  );
}

function StatIcon({ alt, src }: { alt: string; src: string | null }) {
  return src ? <img alt={alt} height="34" src={src} style={{ height: 34, width: 34 }} width="34" /> : null;
}

function PitStopPanel({ data, logoUrl }: { data: GrandPrixRecapData["fastestPitStop"]; logoUrl: string | null }) {
  return (
    <div style={{ backgroundColor: "#ffc800", color: "#090909", display: "flex", flex: 1, flexDirection: "column", padding: "22px 18px 14px" }}>
      {logoUrl ? (
        <img alt="DHL" height="30" src={logoUrl} style={{ height: 30, objectFit: "contain", objectPosition: "left center", width: 142 }} width="142" />
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", fontSize: 17, fontWeight: 900, lineHeight: 1.02, marginTop: 10, textTransform: "uppercase" }}>
        <span style={{ display: "flex" }}>Самый быстрый</span>
        <span style={{ display: "flex" }}>пит-стоп</span>
      </div>
      <span style={{ display: "flex", fontSize: 20, fontWeight: 900, lineHeight: 1.08, marginTop: 13, minHeight: 39, textTransform: "uppercase" }}>{data ? data.team : "Уточняется"}</span>
      {data ? <span style={{ color: "#d40511", display: "flex", fontSize: 31, fontWeight: 900, marginTop: 8 }}>{formatPitDuration(data.duration)} с</span> : null}
    </div>
  );
}

function Strategy({ drivers, index, sequence }: { drivers: number; index: number; sequence: string[] }) {
  const layout = getGrandPrixRecapStrategyLayout(sequence.length);

  return (
    <div style={{ alignItems: "center", display: "flex", flex: 1, justifyContent: "center", minWidth: 0 }}>
      <span style={{ color: colors.muted, display: "flex", flexShrink: 0, fontSize: 18, fontWeight: 900, marginRight: 8 }}>{index + 1}</span>
      <div style={{ alignItems: "center", display: "flex", flexShrink: 0 }}>
        {sequence.map((compound, compoundIndex) => (
          <div style={{ alignItems: "center", display: "flex" }} key={`${compound}-${compoundIndex}`}>
            {compoundIndex > 0 ? <span style={{ color: colors.muted, display: "flex", fontSize: layout.arrowFontSize, margin: `0 ${layout.arrowMargin}px` }}>→</span> : null}
            <Tyre compound={compound} size={layout.tyreSize} />
          </div>
        ))}
      </div>
      <span style={{ color: colors.text, display: "flex", flexShrink: 0, fontSize: 16, fontWeight: 900, marginLeft: 8, textTransform: "uppercase" }}>{drivers} пил.</span>
    </div>
  );
}

function Tyre({ compound, size = 54 }: { compound: string; size?: number }) {
  const key = compound.toUpperCase();
  const color = key === "SOFT" || key === "S"
    ? "#ed1c24"
    : key === "MEDIUM" || key === "M"
      ? "#ffd21c"
      : key === "INTERMEDIATE" || key === "I"
        ? "#37b34a"
        : key === "WET" || key === "W"
          ? "#2d80e8"
          : "#f4f4f4";
  const label = key === "SOFT" ? "S" : key === "MEDIUM" ? "M" : key === "HARD" ? "H" : key.slice(0, 1);

  return (
    <div style={{ alignItems: "center", border: `${size < 36 ? 3 : size < 50 ? 4 : 5}px solid ${color}`, borderRadius: "999px", display: "flex", flexShrink: 0, height: size, justifyContent: "center", width: size }}>
      <span style={{ display: "flex", fontSize: size < 32 ? 13 : size < 40 ? 16 : size < 50 ? 19 : 23, fontWeight: 900 }}>{label}</span>
    </div>
  );
}

function WeatherIcon({ rainy }: { rainy: boolean }) {
  return rainy ? (
    <div style={{ color: colors.text, display: "flex", fontSize: 26 }}>☂</div>
  ) : (
    <div style={{ color: "#f7c84a", display: "flex", fontSize: 26 }}>☀</div>
  );
}

const eyebrowStyle: CSSProperties = {
  color: colors.primary,
  display: "flex",
  fontSize: 20,
  fontWeight: 900,
  letterSpacing: "0.065em",
  textTransform: "uppercase",
};

function getPodiumName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? `${parts[0]} ${parts.at(-1)}` : value;
}

function getStatName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? `${parts[0][0]}. ${parts.at(-1)}` : value;
}

function getInitials(value: string) {
  return value.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function formatTemperature(value: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value);
}

function formatPitDuration(value: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3, minimumFractionDigits: 2 }).format(value);
}

function formatPoints(value: number) {
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value)} очков`;
}

function formatFastestLap(value: GrandPrixRecapData["fastestLap"]) {
  if (!value) {
    return null;
  }

  return [value.time, value.lap ? `круг ${value.lap}` : null].filter(Boolean).join(" · ") || null;
}

function formatRedFlags(value: number) {
  if (value === 0) {
    return "без красных флагов";
  }

  return `${value} ${pluralize(value, "красный флаг", "красных флага", "красных флагов")}`;
}

function formatYellowFlags(value: number) {
  if (value === 0) {
    return "без жёлтых флагов";
  }

  return `${value} ${pluralize(value, "жёлтый флаг", "жёлтых флага", "жёлтых флагов")}`;
}

function pluralize(value: number, one: string, few: string, many: string) {
  const modulo100 = Math.abs(value) % 100;
  const modulo10 = modulo100 % 10;

  if (modulo100 >= 11 && modulo100 <= 14) {
    return many;
  }

  if (modulo10 === 1) {
    return one;
  }

  return modulo10 >= 2 && modulo10 <= 4 ? few : many;
}

function getFittedTrackViewBox(svgPath: string) {
  const values = [...svgPath.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));

  if (values.length < 4 || values.length % 2 !== 0) {
    return null;
  }

  const xValues = values.filter((_, index) => index % 2 === 0);
  const yValues = values.filter((_, index) => index % 2 === 1);
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const width = maxX - minX;
  const height = maxY - minY;

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  const paddingX = Math.max(width * 0.04, 2);
  const paddingY = Math.max(height * 0.08, 2);
  return `${minX - paddingX} ${minY - paddingY} ${width + paddingX * 2} ${height + paddingY * 2}`;
}
