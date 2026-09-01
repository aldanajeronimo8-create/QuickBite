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
  timeZone: 'America/Bogota', weekday: 'long',
});
const shortDateFormatter = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric',
});
const monthYearFormatter = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota', month: 'long', year: 'numeric',
});
const inputDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
});

function isValidDate(date: Date) { return !Number.isNaN(date.getTime()); }
function calendarDate(year: number, monthIndex: number, day: number) { return new Date(Date.UTC(year, monthIndex, day, 12, 0, 0)); }
function addDays(date: Date, amount: number) { return new Date(date.getTime() + amount * DAY_MS); }
function startOfMondayWeek(date: Date) { const day = date.getUTCDay(); return addDays(date, -(day === 0 ? 6 : day - 1)); }
function endOfMonth(date: Date) { return calendarDate(date.getUTCFullYear(), date.getUTCMonth() + 1, 0); }
function isoWeekNumber(date: Date) { const thursday = addDays(date, 3 - ((date.getUTCDay() + 6) % 7)); const firstThursday = calendarDate(thursday.getUTCFullYear(), 0, 4); return 1 + Math.round((thursday.getTime() - startOfMondayWeek(firstThursday).getTime()) / DAY_MS / 7); }
function bogotaBoundary(date: Date, end = false) { const hour = end ? 23 : 0; return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour + BOGOTA_OFFSET_HOURS, end ? 59 : 0, end ? 59 : 0, end ? 999 : 0)); }
function dateRangeDays(start: Date, end: Date) { const days: Date[] = []; if (!isValidDate(start) || !isValidDate(end)) return days; for (let cursor = start; cursor.getTime() <= end.getTime(); cursor = addDays(cursor, 1)) days.push(cursor); return days; }
export function dateKeyInBogota(value: Date | string) { const date = typeof value === 'string' ? new Date(value) : value; return isValidDate(date) ? inputDateFormatter.format(date) : ''; }

function fallbackReportInputDate(): Date {
  const today = inputDateFormatter.format(new Date());
  return parseReportInputDate(today);
}

export function parseReportInputDate(value: string): Date {
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return fallbackReportInputDate();
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1 || day > 31) return fallbackReportInputDate();
  const parsed = calendarDate(year, month - 1, day);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day || !isValidDate(parsed)) return fallbackReportInputDate();
  return parsed;
}

export function formatReportDay(date: Date) { if (!isValidDate(date)) return 'Fecha no válida'; return `${weekdayFormatter.format(date)}, ${shortDateFormatter.format(date)}`; }

export function buildReportPeriod(mode: ReportMode, selected: Date): ReportPeriod {
  const safeSelected = isValidDate(selected) ? selected : fallbackReportInputDate();
  let start: Date; let end: Date;
  if (mode === 'daily') { start = calendarDate(safeSelected.getUTCFullYear(), safeSelected.getUTCMonth(), safeSelected.getUTCDate()); end = start; }
  else if (mode === 'weekly') { start = startOfMondayWeek(safeSelected); end = addDays(start, 6); }
  else { start = calendarDate(safeSelected.getUTCFullYear(), safeSelected.getUTCMonth(), 1); end = endOfMonth(start); }
  const days = dateRangeDays(start, end); const startBogota = bogotaBoundary(start); const endBogota = bogotaBoundary(end, true);
  const year = safeSelected.getUTCFullYear(); const month = safeSelected.getUTCMonth(); const weekNumber = mode === 'weekly' ? isoWeekNumber(start) : undefined;
  const label = mode === 'daily' ? formatReportDay(start) : mode === 'weekly' ? `Semana ${weekNumber} de ${start.getUTCFullYear()} · ${shortDateFormatter.format(start)} — ${shortDateFormatter.format(end)}` : `${monthYearFormatter.format(start)} · ${shortDateFormatter.format(start)} — ${shortDateFormatter.format(end)}`;
  const title = mode === 'daily' ? 'Informe diario' : mode === 'weekly' ? 'Informe semanal' : 'Informe mensual';
  return { mode, start, end, startIso: startBogota.toISOString(), endIso: endBogota.toISOString(), label, title, year, month: mode === 'monthly' ? month + 1 : undefined, weekNumber, totalDays: days.length, days };
}
export function formatPeriodDateRange(period: ReportPeriod) { return !isValidDate(period.start) || !isValidDate(period.end) ? 'Fecha no disponible' : `${shortDateFormatter.format(period.start)} — ${shortDateFormatter.format(period.end)}`; }
export function getMonthWeekGroups(period: ReportPeriod) {
  if (period.mode !== 'monthly') return [];
  const groups = new Map<number, Date[]>();
  for (const day of period.days) { if (!isValidDate(day)) continue; const weekStart = startOfMondayWeek(day); const week = isoWeekNumber(weekStart); const existing = groups.get(week) ?? []; existing.push(day); groups.set(week, existing); }
  return Array.from(groups.entries()).map(([weekNumber, days]) => ({ weekNumber, start: days[0], end: days[days.length - 1], days }));
}
