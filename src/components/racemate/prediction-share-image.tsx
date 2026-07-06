/* eslint-disable @next/next/no-img-element */
import type {
  PredictionShareDriverPick,
  PredictionShareTeamPick,
  PublicPredictionShare,
} from "@/types/racemate";

type PredictionShareImageProps = {
  share: PublicPredictionShare;
  variant: "og" | "story";
};

const baseFont = "Arial, Helvetica, sans-serif";
const monoFont = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
const pickLabelColor = "#fff";

export function PredictionShareImage({ share, variant }: PredictionShareImageProps) {
  const isStory = variant === "story";
  const isQualification = share.scope === "qualification";
  const isCompressedQualificationCard = isStory && isQualification;
  const width = isStory ? 1080 : 1200;
  const height = isStory ? 1350 : 630;
  const heroDriver = share.heroDriver ?? (isQualification ? share.picks.pole : share.picks.top10[0] ?? null);
  const heroTeam = share.heroTeam ?? share.picks.topScoringTeam ?? share.picks.fastestPitStopTeam;
  const heroColor = normalizeColor(share.heroColor || heroDriver?.team?.color || heroTeam?.color || "#e10600");
  const topDrivers = isStory ? share.picks.top10 : share.picks.top10.slice(0, 3);

  return (
    <div
      style={{
        background: `radial-gradient(circle at 78% 34%, ${withAlpha(heroColor, 0.36)}, transparent ${isStory ? 430 : 320}px), linear-gradient(135deg, #070707 0%, #101010 54%, #190807 100%)`,
        color: "#f8f5f2",
        display: "flex",
        fontFamily: baseFont,
        height,
        overflow: "hidden",
        padding: isStory ? 56 : 44,
        position: "relative",
        width,
      }}
    >
      <div
        style={{
          background: withAlpha(heroColor, 0.34),
          display: "flex",
          height: isStory ? 980 : 520,
          position: "absolute",
          right: isStory ? -360 : -210,
          top: isStory ? 120 : 44,
          transform: "rotate(-18deg)",
          width: isStory ? 620 : 360,
        }}
      />
      <div
        style={{
          border: "1px solid rgba(255,255,255,0.13)",
          display: "flex",
          flexDirection: "column",
          ...(isCompressedQualificationCard ? { flex: "none", height: 900, width: "100%" } : { flex: 1 }),
          overflow: "hidden",
          padding: isStory ? 44 : 34,
          position: "relative",
        }}
      >
        <Header scope={share.scope} story={isStory} />

        <div style={{ display: "flex", flex: 1, gap: isStory ? 28 : 28, marginTop: isStory ? 42 : 28, minHeight: 0, position: "relative" }}>
          <div
            style={{
              display: "flex",
              flexBasis: isStory ? 660 : "auto",
              flexDirection: "column",
              flexGrow: isStory ? 0 : 1,
              flexShrink: isStory ? 0 : 1,
              minWidth: 0,
              paddingRight: isStory ? 0 : 250,
              width: isStory ? 660 : "auto",
            }}
          >
            <span style={{ color: heroColor, fontFamily: monoFont, fontSize: isStory ? 21 : 16, fontWeight: 900, letterSpacing: 4 }}>
              {share.race.season} {share.race.round ? `· Раунд ${share.race.round}` : ""}
            </span>
            <h1
              style={{
                fontSize: isStory ? 62 : 48,
                fontWeight: 950,
                letterSpacing: "-0.035em",
                lineHeight: 1.06,
                margin: "14px 0 0",
                maxWidth: isStory ? 610 : 610,
              }}
            >
              {share.race.name}
            </h1>
            <p style={{ color: "#d8d0cc", fontSize: isStory ? 25 : 20, fontWeight: 750, lineHeight: 1.18, margin: isStory ? "24px 0 0" : "16px 0 0" }}>
              Прогноз от {share.displayName}
              {share.leagueName ? ` · ${share.leagueName}` : ""}
            </p>

            {isQualification ? (
              <QualificationFocus driver={share.picks.pole} heroColor={heroColor} story={isStory} />
            ) : (
              <RacePicks
                heroColor={heroColor}
                picks={{
                  dnf: share.picks.dnfKind === "none" ? "Без DNF" : share.picks.dnf?.name ?? "—",
                  fastestLap: share.picks.fastestLap,
                  fastestPitStopTeam: share.picks.fastestPitStopTeam,
                  pole: share.picks.pole,
                  topScoringTeam: share.picks.topScoringTeam,
                  topDrivers,
                }}
                story={isStory}
              />
            )}
          </div>

          <HeroDriver driver={heroDriver} heroColor={heroColor} scope={share.scope} story={isStory} team={heroTeam} />
        </div>

        <Footer story={isStory} />
      </div>
    </div>
  );
}

function Header({ scope, story }: { scope: PublicPredictionShare["scope"]; story: boolean }) {
  return (
    <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
      <div style={{ alignItems: "center", display: "flex", gap: story ? 18 : 14 }}>
        <div
          style={{
            alignItems: "center",
            background: "#e10600",
            borderRadius: story ? 12 : 9,
            color: "#fff",
            display: "flex",
            height: story ? 56 : 46,
            justifyContent: "center",
            width: story ? 56 : 46,
          }}
        >
          <div style={{ display: "flex", height: story ? 30 : 25, position: "relative", width: story ? 30 : 25 }}>
            <div style={{ background: "#fff", borderRadius: 999, display: "flex", height: "100%", width: 4 }} />
            <div
              style={{
                border: "3px solid #fff",
                borderLeft: "0",
                borderRadius: "0 9px 9px 0",
                display: "flex",
                height: story ? 18 : 15,
                left: 4,
                position: "absolute",
                top: 1,
                width: story ? 24 : 20,
              }}
            />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
          <span style={{ fontSize: story ? 35 : 28, fontWeight: 950, letterSpacing: "-0.035em" }}>
            RaceMate
          </span>
          <span style={{ color: "#b9b0ac", fontFamily: monoFont, fontSize: story ? 14 : 12, fontWeight: 850, letterSpacing: 3, marginTop: 8, textTransform: "uppercase" }}>
            гоночный центр
          </span>
        </div>
      </div>
      <span
        style={{
          border: "1px solid rgba(225,6,0,0.48)",
          color: "#ff4d45",
          fontFamily: monoFont,
          fontSize: story ? 18 : 14,
          fontWeight: 850,
          letterSpacing: 2,
          padding: story ? "10px 14px" : "8px 12px",
          textTransform: "uppercase",
        }}
      >
        {scope === "qualification" ? "квалификация" : "гонка"}
      </span>
    </div>
  );
}

function QualificationFocus({
  driver,
  heroColor,
  story,
}: {
  driver: PredictionShareDriverPick | null;
  heroColor: string;
  story: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: story ? 8 : 7,
        marginTop: story ? 30 : 20,
        maxWidth: story ? 450 : 380,
      }}
    >
      <SectionTitle color={pickLabelColor}>Прогноз на стартовую решетку</SectionTitle>
      <SharePickLine
        color={driver?.team?.color ?? heroColor}
        detail={driver?.team?.name ?? "Команда уточняется"}
        label="Pole"
        story={story}
        value={driver?.name ?? "Выбор сохранится здесь"}
      />
    </div>
  );
}

function RacePicks({
  heroColor,
  picks,
  story,
}: {
  heroColor: string;
  picks: {
    dnf: string;
    fastestLap: PredictionShareDriverPick | null;
    fastestPitStopTeam: PredictionShareTeamPick | null;
    pole: PredictionShareDriverPick | null;
    topDrivers: PredictionShareDriverPick[];
    topScoringTeam: PredictionShareTeamPick | null;
  };
  story: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: story ? 18 : 16, marginTop: story ? 32 : 26 }}>
      <div
        style={{
          display: "flex",
          flexBasis: story ? 340 : "auto",
          flexDirection: "column",
          flexGrow: story ? 0 : 0.92,
          flexShrink: story ? 0 : 1,
          gap: story ? 10 : 8,
          width: story ? 340 : "auto",
        }}
      >
        <SectionTitle color={pickLabelColor}>{story ? "Топ-10 гонки" : "Топ-3 гонки"}</SectionTitle>
        {picks.topDrivers.length ? picks.topDrivers.map((driver, index) => (
          <DriverLine driver={driver} heroColor={heroColor} index={index} key={`${driver.id}-${index}`} story={story} />
        )) : (
          <EmptyLine text="Выбор появится после сохранения" />
        )}
      </div>

      <div
        style={{
          display: "flex",
          flexBasis: story ? 300 : "auto",
          flexDirection: "column",
          flexGrow: story ? 0 : 1.08,
          flexShrink: story ? 0 : 1,
          gap: story ? 10 : 8,
          minWidth: 0,
          width: story ? 300 : "auto",
        }}
      >
        <SectionTitle color={pickLabelColor}>Дополнительно</SectionTitle>
        <SharePickLine
          color={picks.pole?.team?.color ?? heroColor}
          detail={picks.pole?.team?.name ?? "Квалификация"}
          label="Pole"
          story={story}
          value={picks.pole?.name ?? "—"}
        />
        <SharePickLine
          color={picks.fastestLap?.team?.color ?? heroColor}
          detail={picks.fastestLap?.team?.name ?? "Гонка"}
          label="Fast Lap"
          story={story}
          value={picks.fastestLap?.name ?? "—"}
        />
        <SharePickLine
          color={heroColor}
          detail="Первый сход"
          label="DNF"
          story={story}
          value={picks.dnf}
        />
        {story ? (
          <div style={{ display: "flex", flexDirection: "column", gap: story ? 10 : 8, width: "100%" }}>
            <SharePickLine
              compact={story}
              color={picks.topScoringTeam?.color ?? heroColor}
              detail={picks.topScoringTeam?.code ?? "Команда этапа"}
              label="Team"
              story={story}
              value={picks.topScoringTeam?.name ?? "—"}
            />
            <SharePickLine
              compact={story}
              color={picks.fastestPitStopTeam?.color ?? heroColor}
              detail={picks.fastestPitStopTeam?.code ?? "Быстрый пит-стоп"}
              label="Fast Pit"
              story={story}
              value={picks.fastestPitStopTeam?.name ?? "—"}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function HeroDriver({
  driver,
  heroColor,
  scope,
  story,
  team,
}: {
  driver: PredictionShareDriverPick | null;
  heroColor: string;
  scope: PublicPredictionShare["scope"];
  story: boolean;
  team: PredictionShareTeamPick | null;
}) {
  const isQualification = scope === "qualification";
  const size = story ? (isQualification ? 470 : 520) : (isQualification ? 285 : 310);
  const avatarBottom = story ? (isQualification ? 118 : 8) : (isQualification ? 26 : -18);
  const avatarRight = story ? (isQualification ? 58 : -54) : (isQualification ? 12 : -34);
  const showHeroCaption = !isQualification;

  return (
    <div
      style={{
        alignItems: "flex-end",
        display: "flex",
        justifyContent: "center",
        marginRight: story ? -76 : -42,
        minWidth: story ? 330 : 250,
        position: story ? "absolute" : "relative",
        width: story ? 360 : 285,
        ...(story
          ? {
              bottom: 0,
              right: -80,
              top: 0,
            }
          : {
              alignSelf: "stretch",
            }),
      }}
    >
      <div
        style={{
          background: `radial-gradient(circle, ${withAlpha(heroColor, 0.34)}, transparent 68%)`,
          bottom: story ? 40 : 10,
          display: "flex",
          height: size,
          position: "absolute",
          right: story ? -86 : -50,
          width: size,
        }}
      />
      {driver?.avatarUrl ? (
        <img
          alt=""
          height={size}
          src={driver.avatarUrl}
          style={{
            bottom: avatarBottom,
            display: "flex",
            maxHeight: size,
            objectFit: "contain",
            position: "absolute",
            right: avatarRight,
            width: size,
          }}
          width={size}
        />
      ) : (
        <div
          style={{
            alignItems: "center",
            background: `linear-gradient(160deg, ${withAlpha(heroColor, 0.28)}, rgba(255,255,255,0.05))`,
            border: `1px solid ${withAlpha(heroColor, 0.7)}`,
            color: "#fff",
            display: "flex",
            flexDirection: "column",
            gap: story ? 18 : 10,
            height: story ? 340 : 210,
            justifyContent: "center",
            position: "relative",
            width: story ? 300 : 210,
          }}
        >
          <span style={{ color: heroColor, fontFamily: monoFont, fontSize: story ? 88 : 58, fontWeight: 950, lineHeight: 0.9 }}>
            {driver?.number ?? driver?.code ?? "?"}
          </span>
          <span style={{ fontFamily: monoFont, fontSize: story ? 20 : 14, fontWeight: 900, letterSpacing: 3 }}>
            {driver?.code ?? team?.code ?? "PICK"}
          </span>
        </div>
      )}
      {showHeroCaption ? (
        <div
          style={{
            background: "rgba(0,0,0,0.54)",
            borderLeft: `6px solid ${heroColor}`,
            bottom: story ? 48 : 18,
            display: "flex",
            flexDirection: "column",
            maxWidth: story ? 330 : 260,
            padding: story ? "18px 20px" : "12px 14px",
            position: "absolute",
            right: story ? 230 : 150,
          }}
        >
          <span style={{ color: "#fff", fontSize: story ? 28 : 20, fontWeight: 900, lineHeight: 1.05 }}>
            {driver?.name ?? "Прогноз RaceMate"}
          </span>
          <span style={{ color: "#c9c0bc", fontSize: story ? 17 : 13, fontWeight: 750, marginTop: 6 }}>
            {driver?.team?.name ?? team?.name ?? "Команда уточняется"}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function DriverLine({
  driver,
  heroColor,
  index,
  story,
}: {
  driver: PredictionShareDriverPick;
  heroColor: string;
  index: number;
  story: boolean;
}) {
  const color = normalizeColor(driver.team?.color ?? heroColor);

  return (
    <div
      style={{
        alignItems: "center",
        background: "rgba(255,255,255,0.055)",
        border: `1px solid ${index === 0 ? withAlpha(color, 0.6) : "rgba(255,255,255,0.09)"}`,
        display: "flex",
        gap: story ? 13 : 10,
        minHeight: story ? 54 : 44,
        padding: story ? "8px 12px" : "7px 10px",
      }}
    >
      <span style={{ color: pickLabelColor, fontFamily: monoFont, fontSize: story ? 18 : 15, fontWeight: 950, width: story ? 44 : 36 }}>
        P{driver.position ?? index + 1}
      </span>
      <span style={{ background: color, display: "flex", height: story ? 32 : 26, width: 4 }} />
      <div style={{ display: "flex", flex: 1, flexDirection: "column", minWidth: 0 }}>
        <span style={{ color: "#fff", fontSize: getDriverNameFontSize(driver.name, story), fontWeight: 850, lineHeight: 1.05, whiteSpace: "nowrap" }}>
          {driver.name}
        </span>
        <span style={{ color: "#b9b0ac", fontSize: story ? 13 : 11, marginTop: 3 }}>
          {driver.team?.name ?? "Команда уточняется"}
        </span>
      </div>
    </div>
  );
}

function SharePickLine({
  compact = false,
  color,
  detail,
  label,
  story,
  value,
}: {
  compact?: boolean;
  color: string | null | undefined;
  detail: string;
  label: string;
  story: boolean;
  value: string;
}) {
  const accent = normalizeColor(color ?? "#e10600");

  return (
    <div
      style={{
        alignItems: "center",
        background: "rgba(255,255,255,0.055)",
        border: `1px solid ${withAlpha(accent, 0.44)}`,
        display: "flex",
        gap: story ? 13 : 10,
        minHeight: story ? 54 : 44,
        padding: story ? "8px 12px" : "7px 10px",
        width: compact ? 240 : "100%",
      }}
    >
      <span style={{ color: pickLabelColor, fontFamily: monoFont, fontSize: story ? 16 : 13, fontWeight: 950, width: story ? 88 : 66 }}>
        {label}
      </span>
      <span style={{ background: accent, display: "flex", height: story ? 32 : 26, width: 4 }} />
      <div style={{ display: "flex", flex: 1, flexDirection: "column", minWidth: 0 }}>
        <span style={{ color: "#fff", fontSize: getPickValueFontSize(value, story, compact), fontWeight: 850, lineHeight: 1.05, whiteSpace: "nowrap" }}>
          {value}
        </span>
        <span style={{ color: "#b9b0ac", fontSize: story ? 13 : 11, marginTop: 3 }}>
          {detail}
        </span>
      </div>
    </div>
  );
}

function SectionTitle({ children, color }: { children: string; color: string }) {
  return (
    <div
      style={{
        color,
        display: "flex",
        fontFamily: monoFont,
        fontSize: 15,
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

function EmptyLine({ text }: { text: string }) {
  return (
    <div
      style={{
        alignItems: "center",
        background: "rgba(255,255,255,0.055)",
        border: "1px solid rgba(255,255,255,0.09)",
        color: "#b9b0ac",
        display: "flex",
        fontSize: 20,
        minHeight: 78,
        padding: "16px 18px",
      }}
    >
      {text}
    </div>
  );
}

function Footer({ story }: { story: boolean }) {
  return (
    <div
      style={{
        alignItems: "center",
        borderTop: "1px solid rgba(255,255,255,0.12)",
        display: "flex",
        justifyContent: "space-between",
        marginTop: story ? 34 : 18,
        paddingTop: story ? 24 : 16,
      }}
    >
      <span style={{ color: "#f8f5f2", fontSize: story ? 26 : 20, fontWeight: 850 }}>
        Сделай свой прогноз на RaceMate
      </span>
      <span style={{ color: "#e10600", fontFamily: monoFont, fontSize: story ? 20 : 15, fontWeight: 900 }}>
        racemate.ru
      </span>
    </div>
  );
}

function normalizeColor(value: string) {
  return value.startsWith("#") ? value : "#e10600";
}

function getDriverNameFontSize(name: string, story: boolean) {
  if (!story) {
    return 16;
  }

  if (name.length > 21) {
    return 15;
  }

  if (name.length > 16) {
    return 17;
  }

  return 19;
}

function getPickValueFontSize(value: string, story: boolean, compact: boolean) {
  if (!story) {
    return 15;
  }

  if (compact) {
    return value.length > 10 ? 15 : 17;
  }

  if (value.length > 21) {
    return 14;
  }

  if (value.length > 17) {
    return 15;
  }

  return 18;
}

function withAlpha(color: string, alpha: number) {
  const normalized = normalizeColor(color).replace("#", "");
  const full = normalized.length === 3
    ? normalized.split("").map((part) => `${part}${part}`).join("")
    : normalized.padEnd(6, "0").slice(0, 6);
  const red = parseInt(full.slice(0, 2), 16);
  const green = parseInt(full.slice(2, 4), 16);
  const blue = parseInt(full.slice(4, 6), 16);

  return `rgba(${red},${green},${blue},${alpha})`;
}
