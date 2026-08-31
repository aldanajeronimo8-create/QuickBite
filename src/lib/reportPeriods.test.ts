import { describe, expect, it } from 'vitest';
import { buildReportPeriod, getMonthWeekGroups, parseReportInputDate } from './reportPeriods';

describe('report periods', () => {
  it('builds a single calendar day for daily reports', () => {
    const period = buildReportPeriod('daily', parseReportInputDate('2026-08-31'));
    expect(period.totalDays).toBe(1);
    expect(period.startIso).toBe('2026-08-31T05:00:00.000Z');
    expect(period.endIso).toBe('2026-09-01T04:59:59.999Z');
  });

  it('builds Monday through Sunday for weekly reports', () => {
    const period = buildReportPeriod('weekly', parseReportInputDate('2026-08-26'));
    expect(period.totalDays).toBe(7);
    expect(period.start.toISOString()).toBe('2026-08-24T12:00:00.000Z');
    expect(period.end.toISOString()).toBe('2026-08-30T12:00:00.000Z');
    expect(period.weekNumber).toBeGreaterThan(1);
  });

  it('builds every day of a 31-day month', () => {
    const period = buildReportPeriod('monthly', parseReportInputDate('2026-08-12'));
    expect(period.totalDays).toBe(31);
    expect(period.days[0].getUTCDate()).toBe(1);
    expect(period.days.at(-1)?.getUTCDate()).toBe(31);
    expect(getMonthWeekGroups(period).length).toBeGreaterThanOrEqual(5);
  });

  it('handles February in leap years', () => {
    const period = buildReportPeriod('monthly', parseReportInputDate('2028-02-12'));
    expect(period.totalDays).toBe(29);
  });
});
