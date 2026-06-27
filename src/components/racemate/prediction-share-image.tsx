/* eslint-disable @next/next/no-img-element */
import type {
  PredictionShareDriverPick,
  PublicPredictionShare,
} from "@/types/racemate";

type PredictionShareImageProps = {
  share: PublicPredictionShare;
  variant: "og" | "story";
};

const baseFont = "Arial, Helvetica, sans-serif";
const monoFont = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

export function PredictionShareImage({ share, variant }: PredictionShareImageProps) {
  const isStory = variant === "story";
  const width = isStory ? 1080 : 1200;
  const height = isStory ? 1350 : 630;
  const topDrivers = isStory ? share.picks.top10 : share.picks.top10.slice(0, 3);

  return (
    <div
      style={{
        background: "linear-gradient(135deg, #070707 0%, #111 45%, #240906 100%)",
        color: "#f8f5f2",
        display: "flex",
        flexDirection: "column",
        fontFamily: baseFont,
        height,
        overflow: "hidden",
        padding: isStory ? 72 : 58,
        position: "relative",
        width,
      }}
    >
      <div
        style={{
          background: "radial-gradient(circle, rgba(225,6,0,0.36), transparent 58%)",
          display: "flex",
          height: isStory ? 620 : 420,
          position: "absolute",
          right: -150,
          top: -160,
          width: isStory ? 620 : 500,
        }}
      />
      <div
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          display: "flex",
          flex: 1,
          flexDirection: "column",
          padding: isStory ? 48 : 36,
          position: "relative",
        }}
      >
        <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
          <div style={{ alignItems: "center", display: "flex", gap: 16 }}>
            <div
              style={{
                background: "#e10600",
                display: "flex",
                height: 30,
                width: 8,
              }}
            />
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontFamily: monoFont, fontSize: isStory ? 26 : 22, fontWeight: 800, letterSpacing: 3 }}>
                RaceMate
              </span>
              <span style={{ color: "#b9b0ac", fontSize: isStory ? 19 : 16 }}>
                прогноз этапа
              </span>
            </div>
          </div>
          <span
            style={{
              border: "1px solid rgba(225,6,0,0.45)",
              color: "#ff453d",
              fontFamily: monoFont,
              fontSize: isStory ? 20 : 16,
              fontWeight: 800,
              letterSpacing: 2,
              padding: "10px 14px",
              textTransform: "uppercase",
            }}
          >
            {share.scope === "qualification" ? "квалификация" : "гонка"}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: isStory ? 58 : 34 }}>
          <span style={{ color: "#e10600", fontFamily: monoFont, fontSize: isStory ? 22 : 17, fontWeight: 900, letterSpacing: 4 }}>
            {share.race.season} {share.race.round ? `· Раунд ${share.race.round}` : ""}
          </span>
          <h1
            style={{
              fontSize: isStory ? 78 : 58,
              fontWeight: 950,
              letterSpacing: "-0.04em",
              lineHeight: 0.96,
              margin: "18px 0 0",
              maxWidth: isStory ? 850 : 760,
            }}
          >
            {share.race.name}
          </h1>
          <p style={{ color: "#d8d0cc", fontSize: isStory ? 30 : 24, fontWeight: 700, margin: "18px 0 0" }}>
            Прогноз от {share.displayName}
            {share.leagueName ? ` · ${share.leagueName}` : ""}
          </p>
        </div>

        <div style={{ display: "flex", flex: 1, gap: isStory ? 34 : 28, marginTop: isStory ? 54 : 34 }}>
          <div style={{ display: "flex", flex: 1, flexDirection: "column", gap: isStory ? 14 : 12 }}>
            <SectionTitle>{share.scope === "qualification" ? "Стартовая решетка" : isStory ? "Топ-10 гонки" : "Топ-3 гонки"}</SectionTitle>
            {topDrivers.length ? topDrivers.map((driver, index) => (
              <DriverRow driver={driver} index={index} key={`${driver.id}-${index}`} story={isStory} />
            )) : (
              <EmptyLine text="Выбор появится после сохранения" />
            )}
          </div>

          <div style={{ display: "flex", flex: isStory ? 0.8 : 0.9, flexDirection: "column", gap: isStory ? 16 : 12 }}>
            <SectionTitle>Дополнительно</SectionTitle>
            <PickLine label="Поул" value={share.picks.pole?.name ?? "—"} />
            {share.scope === "race" ? (
              <>
                <PickLine label="Лучший круг" value={share.picks.fastestLap?.name ?? "—"} />
                <PickLine label="Первый сход" value={share.picks.dnfKind === "none" ? "Без DNF" : share.picks.dnf?.name ?? "—"} />
                {isStory ? (
                  <>
                    <PickLine label="Команда этапа" value={share.picks.topScoringTeam?.name ?? "—"} />
                    <PickLine label="Пит-стоп" value={share.picks.fastestPitStopTeam?.name ?? "—"} />
                  </>
                ) : null}
              </>
            ) : null}
          </div>
        </div>

        <div
          style={{
            alignItems: "center",
            borderTop: "1px solid rgba(255,255,255,0.12)",
            display: "flex",
            justifyContent: "space-between",
            marginTop: isStory ? 44 : 24,
            paddingTop: isStory ? 30 : 20,
          }}
        >
          <span style={{ color: "#f8f5f2", fontSize: isStory ? 28 : 22, fontWeight: 850 }}>
            Сделай свой прогноз на RaceMate
          </span>
          <span style={{ color: "#e10600", fontFamily: monoFont, fontSize: isStory ? 22 : 17, fontWeight: 900 }}>
            racemate.ru
          </span>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <div
      style={{
        color: "#ff453d",
        display: "flex",
        fontFamily: monoFont,
        fontSize: 18,
        fontWeight: 900,
        letterSpacing: 3,
        marginBottom: 4,
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
}

function DriverRow({
  driver,
  index,
  story,
}: {
  driver: PredictionShareDriverPick;
  index: number;
  story: boolean;
}) {
  const color = driver.team?.color ?? "#e10600";

  return (
    <div
      style={{
        alignItems: "center",
        background: "rgba(255,255,255,0.055)",
        border: "1px solid rgba(255,255,255,0.09)",
        display: "flex",
        gap: story ? 16 : 12,
        minHeight: story ? 72 : 58,
        padding: story ? "12px 16px" : "10px 12px",
      }}
    >
      <span
        style={{
          color,
          fontFamily: monoFont,
          fontSize: story ? 24 : 20,
          fontWeight: 950,
          width: story ? 54 : 44,
        }}
      >
        P{driver.position ?? index + 1}
      </span>
      <div
        style={{
          background: color,
          display: "flex",
          height: story ? 44 : 36,
          width: 5,
        }}
      />
      <div
        style={{
          alignItems: "center",
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 999,
          display: "flex",
          height: story ? 46 : 38,
          justifyContent: "center",
          overflow: "hidden",
          width: story ? 46 : 38,
        }}
      >
        {driver.avatarUrl ? (
          <img alt="" height={story ? 46 : 38} src={driver.avatarUrl} style={{ objectFit: "cover" }} width={story ? 46 : 38} />
        ) : (
          <span style={{ color: "#f8f5f2", fontFamily: monoFont, fontSize: story ? 16 : 13, fontWeight: 900 }}>
            {driver.number ?? driver.code ?? "RM"}
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span style={{ color: "#fff", fontSize: story ? 26 : 20, fontWeight: 850, lineHeight: 1.05 }}>
          {driver.name}
        </span>
        <span style={{ color: "#b9b0ac", fontSize: story ? 18 : 15, marginTop: 4 }}>
          {driver.team?.name ?? "Команда уточняется"}
        </span>
      </div>
    </div>
  );
}

function PickLine({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.055)",
        border: "1px solid rgba(255,255,255,0.09)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "16px 18px",
      }}
    >
      <span style={{ color: "#9d918c", fontFamily: monoFont, fontSize: 15, fontWeight: 900, letterSpacing: 2, textTransform: "uppercase" }}>
        {label}
      </span>
      <span style={{ color: "#fff", fontSize: 23, fontWeight: 850, lineHeight: 1.12 }}>
        {value}
      </span>
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <div
      style={{
        alignItems: "center",
        background: "rgba(255,255,255,0.055)",
        border: "1px solid rgba(255,255,255,0.09)",
        color: "#b9b0ac",
        display: "flex",
        fontSize: 24,
        minHeight: 84,
        padding: "16px 18px",
      }}
    >
      {text}
    </div>
  );
}
