import { TIMEZONE } from "./config";

export type MonthBounds = {
  /** Calendar month key in the workspace timezone, `YYYY-MM`. */
  monthKey: string;
  /** Inclusive start of the month, as a UTC instant. */
  start: Date;
  /** Exclusive end of the month. This is when the quota resets. */
  end: Date;
};

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/**
 * Wall-clock parts of `date` in `timeZone`.
 * Hour 24 (an Intl midnight quirk in some engines) is rolled to the next day.
 */
export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  let year = read("year");
  let month = read("month");
  let day = read("day");
  let hour = read("hour");
  const minute = read("minute");
  const second = read("second");

  if (hour === 24) {
    hour = 0;
    const rolled = new Date(Date.UTC(year, month - 1, day));
    rolled.setUTCDate(rolled.getUTCDate() + 1);
    year = rolled.getUTCFullYear();
    month = rolled.getUTCMonth() + 1;
    day = rolled.getUTCDate();
  }

  return { year, month, day, hour, minute, second };
}

/** Offset of `timeZone` ahead of UTC at `date`, in milliseconds. */
export function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = getZonedParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - date.getTime();
}

/** Convert a wall-clock time in `timeZone` to a UTC instant. */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let offset = getTimeZoneOffsetMs(new Date(wallAsUtc), timeZone);
  let result = wallAsUtc - offset;
  // A DST transition can put the first guess in the other offset. Recompute once.
  offset = getTimeZoneOffsetMs(new Date(result), timeZone);
  result = wallAsUtc - offset;
  return new Date(result);
}

export function getMonthBounds(date: Date, timeZone = TIMEZONE): MonthBounds {
  const parts = getZonedParts(date, timeZone);
  const start = zonedTimeToUtc(parts.year, parts.month, 1, 0, 0, 0, timeZone);
  const nextMonth = parts.month === 12 ? 1 : parts.month + 1;
  const nextYear = parts.month === 12 ? parts.year + 1 : parts.year;
  const end = zonedTimeToUtc(nextYear, nextMonth, 1, 0, 0, 0, timeZone);
  const monthKey = `${parts.year}-${String(parts.month).padStart(2, "0")}`;
  return { monthKey, start, end };
}

export function addMilliseconds(date: Date, milliseconds: number): Date {
  return new Date(date.getTime() + milliseconds);
}

export function formatDateTime(date: Date, timeZone = TIMEZONE): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}
