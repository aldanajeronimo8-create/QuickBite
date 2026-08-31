export type ReportMode = 'daily' | 'weekly' | 'monthly';

export interface ReportPeriod {
  mode: ReportMode;
  start: Date;
  end: Date;
  startIso: string;
  endIso: string;
  label: string;
  title: string;
  year: number;
  month?: number;
  weekNumber?: number;
  totalDays: number;
  days: Date[];
}

const BOGOTA_OFFSET_HOURS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
const weekdayFormatter = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  weekday: 'long',
});
const shortDateFormatter = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const monthYearFormatter = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  month: 'long',
  year: 'numeric',
});

function calendarDate(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day, 12, 0, 0));
}

function addDays(date: Date, amount: number) {
  return new Date(date.getTime() + amount * DAY_MS);
}

function startOfMondayWeek(date: Date) {
  const day = date.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  return addDays(date, -daysSinceMonday);
}

function endOfMonth(date: Date) {
  return calendarDate(date.getUTCFullYear(), date.getUTCMonth() + 1, 0);
}

function isoWeekNumber(date: Date) {
  const thursday = addDays(date, 3 - ((date.getUTCDay() + 6) % 7));
  const firstThursday = calendarDate(thursday.getUTCFullYear(), 0, 4);
  return 1 + Math.round((thursday.getTime() - startOfMondayWeek(firstThursday).getTime()) / DAY_MS / 7);
}

function bogotaBoundary(date: Date, end = false) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const hour = end ? 23 : 0;
  const minute = end ? 59 : 0;
  const second = end ? 59 : 0;
  const millisecond = end ? 999 : 0;
  return new Date(Date.UTC(year, month, day, hour + BOGOTA_OFFSET_HOURS, minute, second, millisecond));
}

function dateRangeDays(start: Date, end: Date) {
  const days: Date[] = [];
  for (let cursor = start; cursor.getTime() <= end.getTime(); cursor = addDays(cursor, 1)) days.push(cursor);
  return days;
}

export function dateKeyInBogota(value: Date | string) {
  const date = typeof value === 'string' ? new Date(value) : value;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

export function parseReportInputDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return calendarDate(year, month - 1, day);
}

export function formatReportDay(date: Date) {
  return `${weekdayFormatter.format(date)}, ${shortDateFormatter.format(date)}`;
}

export function buildReportPeriod(mode: ReportMode, selected: Date): ReportPeriod {
  let start: Date;
  let end: Date;

  if (mode === 'daily') {
    start = calendarDate(selected.getUTCFullYear(), selected.getUTCMonth(), selected.getUTCDate());
    end = start;
  } else if (mode === 'weekly') {
    start = startOfMondayWeek(selected);
    end = addDays(start, 6);
  } else {
    start = calendarDate(selected.getUTCFullYear(), selected.getUTCMonth(), 1);
    end = endOfMonth(start);
  }

  const days = dateRangeDays(start, end);
  const startBogota = bogotaBoundary(start);
  const endBogota = bogotaBoundary(end, true);
  const year = selected.getUTCFullYear();
  const month = selected.getUTCMonth();
  const weekNumber = mode === 'weekly' ? isoWeekNumber(start) : undefined;

  const label = mode === 'daily'
    ? formatReportDay(start)
    : mode === 'weekly'
      ? `Semana ${weekNumber} de ${start.getUTCFullYear()} · ${shortDateFormatter.format(start)} — ${shortDateFormatter.format(end)}`
      : `${monthYearFormatter.format(start)} · ${shortDateFormatter.format(start)} — ${shortDateFormatter.format(end)}`;

  const title = mode === 'daily'
    ? 'Informe diario'
    : mode === 'weekly'
      ? 'Informe semanal'
      : 'Informe mensual';

  return {
    mode,
    start,
    end,
    startIso: startBogota.toISOString(),
    endIso: endBogota.toISOString(),
    label,
    title,
    year,
    month: mode === 'monthly' ? month + 1 : undefined,
    weekNumber,
    totalDays: days.length,
    days,
  };
}

export function formatPeriodDateRange(period: ReportPeriod) {
  return `${shortDateFormatter.format(period.start)} — ${shortDateFormatter.format(period.end)}`;
}

export function getMonthWeekGroups(period: ReportPeriod) {
  if (period.mode !== 'monthly') return [];
  const groups = new Map<number, Date[]>();
  for (const day of period.days) {
    const weekStart = startOfMondayWeek(day);
    const week = isoWeekNumber(weekStart);
    const existing = groups.get(week) ?? [];
    existing.push(day);
    groups.set(week, existing);
  }
  return Array.from(groups.entries()).map(([weekNumber, days]) => ({
    weekNumber,
    start: days[0],
    end: days[days.length - 1],
    days,
  }));
}
