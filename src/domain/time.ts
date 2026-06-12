export const fallbackTimeZone = "Asia/Tokyo";

export function nowIso(): string {
  return new Date().toISOString();
}

export function getCurrentTimeZone(): string {
  return normalizeTimeZone(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
}

export function normalizeTimeZone(timeZone?: string): string {
  if (!timeZone) {
    return fallbackTimeZone;
  }

  try {
    Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return fallbackTimeZone;
  }
}

export function toLocalDate(
  date: Date = new Date(),
  timeZone = getCurrentTimeZone(),
): string {
  const parts = getZonedDateTimeParts(date, timeZone);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(
    2,
    "0",
  )}-${String(parts.day).padStart(2, "0")}`;
}

export function isoToLocalDate(
  isoDateTime: string,
  timeZone = getCurrentTimeZone(),
): string {
  return toLocalDate(new Date(isoDateTime), timeZone);
}

export function getLocalMinuteOfDay(date: Date, timeZone: string): number {
  const parts = getZonedDateTimeParts(date, timeZone);
  return parts.hour * 60 + parts.minute;
}

export function getLocalDateStartUtcMs(
  localDate: string,
  timeZone: string,
): number {
  const [year, month, day] = parseLocalDateParts(localDate);
  return zonedDateTimeToUtcMs(
    { year, month, day, hour: 0, minute: 0, second: 0 },
    timeZone,
  );
}

export function getNextLocalDate(localDate: string): string {
  const [year, month, day] = parseLocalDateParts(localDate);
  const value = new Date(Date.UTC(year, month - 1, day + 1));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

export function getLocalDateEndUtcMs(
  localDate: string,
  timeZone: string,
): number {
  return getLocalDateStartUtcMs(getNextLocalDate(localDate), timeZone);
}

export function getZonedDateTimeParts(
  date: Date,
  timeZone: string,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: normalizeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const entries = formatter
    .formatToParts(date)
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, Number(part.value)]);
  const parts = Object.fromEntries(entries) as Record<string, number>;

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

export function minutesBetween(startIso: string, endIso: string): number {
  const diffMs = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.max(0, Math.round(diffMs / 60_000));
}

export function secondsBetween(startIso: string, endIso: string): number {
  const diffMs = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.max(0, Math.floor(diffMs / 1_000));
}

export function formatMinutes(totalMinutes: number): string {
  const safeMinutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;

  if (hours === 0) {
    return `${minutes} 分钟`;
  }

  if (minutes === 0) {
    return `${hours} 小时`;
  }

  return `${hours} 小时 ${minutes} 分钟`;
}

export function formatTimer(seconds: number): string {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const restSeconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(restSeconds).padStart(
    2,
    "0",
  )}`;
}

function parseLocalDateParts(localDate: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) {
    throw new Error(`Invalid local date: ${localDate}`);
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function zonedDateTimeToUtcMs(
  dateTime: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
  },
  timeZone: string,
): number {
  const utcGuess = Date.UTC(
    dateTime.year,
    dateTime.month - 1,
    dateTime.day,
    dateTime.hour,
    dateTime.minute,
    dateTime.second,
  );
  let offsetMs = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  let utcMs = utcGuess - offsetMs;
  offsetMs = getTimeZoneOffsetMs(new Date(utcMs), timeZone);
  utcMs = utcGuess - offsetMs;

  return utcMs;
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = getZonedDateTimeParts(date, timeZone);
  const localAsUtcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return localAsUtcMs - date.getTime();
}
