const CAIRO = "Africa/Cairo";
const dateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: CAIRO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: CAIRO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function dateParts(value) {
  return Object.fromEntries(
    dateFormat
      .formatToParts(value)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value: part }) => [type, part]),
  );
}

function formatDate(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export function defaultReportRange(now = new Date()) {
  const { year, month, day } = dateParts(now);
  return {
    start_date: `${year}-${month}-01`,
    end_date: formatDate(year, month, day),
  };
}

export function reportRange(route, now = new Date()) {
  const fallback = defaultReportRange(now);
  const startDate = route.params.get("start_date") || fallback.start_date;
  const endDate = route.params.get("end_date") || fallback.end_date;
  if (!isDate(startDate) || !isDate(endDate) || startDate > endDate)
    return fallback;
  return { start_date: startDate, end_date: endDate };
}

function cairoOffsetAt(utcMilliseconds) {
  const parts = Object.fromEntries(
    dateTimeFormat
      .formatToParts(new Date(utcMilliseconds))
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value]),
  );
  const localAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return localAsUtc - Math.floor(utcMilliseconds / 1000) * 1000;
}

export function cairoDateBoundary(date, dayOffset = 0) {
  const [year, month, day] = date.split("-").map(Number);
  const guess = new Date(0);
  guess.setUTCHours(0, 0, 0, 0);
  guess.setUTCFullYear(year, month - 1, day + dayOffset);
  const utcGuess = guess.getTime();
  const offset = cairoOffsetAt(utcGuess);
  return utcGuess - offset;
}

export function reportTimeBounds(startDate, endDate) {
  return {
    start: cairoDateBoundary(startDate),
    end: cairoDateBoundary(endDate, 1),
  };
}
