import type { DriverLiveState, FeedEvent } from "./types";

export type EventTone =
  | "blue"
  | "cyan"
  | "green"
  | "neutral"
  | "orange"
  | "purple"
  | "red"
  | "yellow";

export type EventCategory = {
  label: string;
  tone: EventTone;
};

export function eventCategory(
  event: Pick<FeedEvent, "message" | "original" | "type">,
): EventCategory {
  const source = `${event.original ?? ""} ${event.message}`.toUpperCase();
  const sportingNotice =
    /INFRINGEMENT|INVESTIGAT(?:ION|ED)|FIA STEWARDS|PENALTY|NOTED/.test(source);

  if (event.type === "fastest_lap")
    return { label: "Лучший круг", tone: "purple" };
  if (event.type === "pit") return { label: "Пит", tone: "cyan" };
  if (event.type === "tyre_change") return { label: "Шины", tone: "blue" };
  if (event.type === "overtake") return { label: "Обгон", tone: "orange" };
  if (event.type === "stewards")
    return /PENALTY|ШТРАФ|DISQUAL/i.test(source)
      ? { label: "Штраф", tone: "red" }
      : { label: "Стюарды", tone: "orange" };
  if (!sportingNotice && /DOUBLE YELLOW|YELLOW FLAG|ЖЁЛТ/i.test(source))
    return { label: "Жёлтый флаг", tone: "yellow" };
  if (/RED FLAG|КРАСНЫЙ ФЛАГ|TEMPORARILY STOPPED|SUSPENDED/i.test(source))
    return { label: "Красный флаг", tone: "red" };
  if (/VIRTUAL SAFETY CAR|\bVSC\b/i.test(source))
    return { label: "VSC", tone: "yellow" };
  if (/SAFETY CAR|СЕЙФТИ-КАР/i.test(source))
    return { label: "SC", tone: "yellow" };
  if (/GREEN FLAG|TRACK CLEAR|ЗЕЛЁНЫЙ ФЛАГ|ТРАССА СВОБОДНА/i.test(source))
    return { label: "Трасса", tone: "green" };
  if (/\bDRS\b|РЕЖИМ ОБГОНА/i.test(source))
    return { label: "DRS", tone: "cyan" };
  if (/LAP TIME.*DELETED|TIME.*DELETED|ВРЕМЯ.*УДАЛ/i.test(source))
    return { label: "Круг удалён", tone: "red" };
  if (/MARSHALS ON TRACK|RECOVERY VEHICLE|ЭВАКУАЦ/i.test(source))
    return { label: "На трассе", tone: "orange" };
  if (/RETIRED|DISQUAL|СХОД|ДИСКВАЛИФИКАЦИЯ/i.test(source))
    return { label: "Статус", tone: "red" };
  if (/SESSION|СЕССИЯ|CHEQUERED|КЛЕТЧАТЫЙ/i.test(source))
    return { label: "Сессия", tone: "blue" };

  return { label: "Дирекция", tone: "neutral" };
}

export function eventDriverNumbers(
  event: Pick<FeedEvent, "driverNumber" | "message" | "original">,
  drivers: Pick<DriverLiveState, "acronym" | "driverNumber">[],
) {
  const source = `${event.original ?? ""} ${event.message}`.toUpperCase();
  const matches = new Map<number, number>();

  if (event.driverNumber !== null) matches.set(event.driverNumber, -1);

  for (const driver of drivers) {
    const acronym = escapeRegExp(driver.acronym.toUpperCase());
    const number = String(driver.driverNumber);
    const indexes = [
      source.search(new RegExp(`\\b${acronym}\\b`, "i")),
      source.search(
        new RegExp(`\\b(?:CAR|CARS)\\s+(?:NO\\.?\\s*)?${number}\\b`, "i"),
      ),
      source.search(new RegExp(`\\b${number}\\s*\\(${acronym}\\)`, "i")),
    ].filter((index) => index >= 0);

    if (indexes.length)
      matches.set(
        driver.driverNumber,
        Math.min(matches.get(driver.driverNumber) ?? Infinity, ...indexes),
      );
  }

  return [...matches]
    .sort((a, b) => a[1] - b[1] || a[0] - b[0])
    .map(([driverNumber]) => driverNumber);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
