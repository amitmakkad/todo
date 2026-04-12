import { addDays, formatISO } from "date-fns";
import { formatInTimeZone, toDate } from "date-fns-tz";

export type WorkflowSlot = {
  scheduledAt: Date;
  dayKey: string;
};

/** Normalized `HH:mm` for use with `toDate(\`${dayKey}T${hhmm}:00\`, tz)`. */
export function normalizeDayStartTime(s: string | undefined): string {
  if (!s || typeof s !== "string") return "00:00";
  const m = s.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return "00:00";
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) {
    return "00:00";
  }
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function defaultSlotsPerDay(intervalHours: number): number {
  const step = Math.max(1, intervalHours);
  return Math.min(48, Math.max(1, Math.ceil(24 / step)));
}

function dayKeysTouchingRange(utcFrom: Date, utcTo: Date, timeZone: string): string[] {
  const keys: string[] = [];
  let k = formatInTimeZone(utcFrom, timeZone, "yyyy-MM-dd");
  const endK = formatInTimeZone(utcTo, timeZone, "yyyy-MM-dd");
  let guard = 0;
  while (k <= endK && guard < 14) {
    keys.push(k);
    const noon = toDate(`${k}T12:00:00`, { timeZone });
    k = formatInTimeZone(addDays(noon, 1), timeZone, "yyyy-MM-dd");
    guard++;
  }
  const prev = formatInTimeZone(
    addDays(toDate(`${formatInTimeZone(utcFrom, timeZone, "yyyy-MM-dd")}T12:00:00`, { timeZone }), -1),
    timeZone,
    "yyyy-MM-dd",
  );
  if (!keys.includes(prev)) {
    keys.unshift(prev);
  }
  return [...new Set(keys)].sort();
}

/**
 * Check-in slots for one calendar day in `timeZone`: first at `dayStartTime`, then every
 * `intervalHours`, at most `slotsPerDay` times, all before next local midnight.
 */
export function slotsForDay(
  dayKey: string,
  timeZone: string,
  intervalHours: number,
  dayStartTime: string,
  slotsPerDay: number,
): WorkflowSlot[] {
  const hhmm = normalizeDayStartTime(dayStartTime);
  const first = toDate(`${dayKey}T${hhmm}:00`, { timeZone });
  const nextDayKey = formatInTimeZone(
    addDays(toDate(`${dayKey}T12:00:00`, { timeZone }), 1),
    timeZone,
    "yyyy-MM-dd",
  );
  const nextMidnight = toDate(`${nextDayKey}T00:00:00`, { timeZone });
  if (Number.isNaN(first.getTime()) || Number.isNaN(nextMidnight.getTime())) {
    return [];
  }

  const end = nextMidnight.getTime();
  const step = Math.max(1, intervalHours) * 60 * 60 * 1000;
  const max = Math.min(48, Math.max(1, Math.round(slotsPerDay)));

  const out: WorkflowSlot[] = [];
  let t = first.getTime();
  let count = 0;
  while (t < end && count < max) {
    const scheduledAt = new Date(t);
    const dk = formatInTimeZone(scheduledAt, timeZone, "yyyy-MM-dd");
    out.push({ scheduledAt, dayKey: dk });
    count++;
    t += step;
  }
  return out;
}

export type ScheduleParams = {
  timezone: string;
  intervalHours: number;
  dayStartTime: string;
  slotsPerDay: number;
};

export function slotsInUtcRange(
  wf: ScheduleParams,
  utcFrom: Date,
  utcTo: Date,
): WorkflowSlot[] {
  const keys = dayKeysTouchingRange(utcFrom, utcTo, wf.timezone);
  const slots: WorkflowSlot[] = [];
  const dayStartTime = normalizeDayStartTime(wf.dayStartTime);
  const slotsPerDay = wf.slotsPerDay;
  for (const dayKey of keys) {
    slots.push(
      ...slotsForDay(dayKey, wf.timezone, wf.intervalHours, dayStartTime, slotsPerDay),
    );
  }
  return slots.filter(
    (s) =>
      s.scheduledAt.getTime() >= utcFrom.getTime() &&
      s.scheduledAt.getTime() <= utcTo.getTime(),
  );
}

export function entryDocId(workflowId: string, scheduledAtMs: number): string {
  return `${workflowId}_${scheduledAtMs}`;
}

export function isoScheduledAt(slot: WorkflowSlot): string {
  return formatISO(slot.scheduledAt);
}
