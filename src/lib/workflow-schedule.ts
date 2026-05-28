import { addDays, formatISO } from "date-fns";
import { formatInTimeZone, toDate } from "date-fns-tz";

export type WorkflowSlot = {
  scheduledAt: Date;
  dayKey: string;
};

const TIME_TOKEN_RE = /^(\d{1,2})(?::(\d{1,2}))?$/;

function tokenToMinutes(token: string): number | null {
  const m = TIME_TOKEN_RE.exec(token.trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = m[2] === undefined ? 0 : Number(m[2]);
  if (!Number.isInteger(hh) || !Number.isInteger(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

/**
 * Parse user input like "0, 8:23, 10" into a sorted, deduped array of minute-of-day
 * values (0-1439). Bare integers are treated as the hour (minutes = 0).
 */
export function parseCheckInTimes(input: string): number[] {
  if (typeof input !== "string") return [];
  const parts = input.split(/[\s,]+/).filter(Boolean);
  const out = new Set<number>();
  for (const p of parts) {
    const n = tokenToMinutes(p);
    if (n === null) continue;
    out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

/** Sanitize a possibly-bogus stored value into sorted, deduped minutes-of-day. */
export function normalizeCheckInTimes(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out = new Set<number>();
  for (const x of raw) {
    const n = Math.round(Number(x));
    if (!Number.isInteger(n) || n < 0 || n > 1439) continue;
    out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

/** Render minutes-of-day array as "0:00, 8:23, 23:33" — no leading zero on hour. */
export function formatCheckInTimes(times: number[]): string {
  return times
    .map((t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`)
    .join(", ");
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
 * Check-in slots for one calendar day in `timeZone`: one slot at HH:MM local time for each
 * minute-of-day value in `checkInTimes`.
 */
export function slotsForDay(
  dayKey: string,
  timeZone: string,
  checkInTimes: number[],
): WorkflowSlot[] {
  const out: WorkflowSlot[] = [];
  for (const t of checkInTimes) {
    const hh = String(Math.floor(t / 60)).padStart(2, "0");
    const mm = String(t % 60).padStart(2, "0");
    const scheduledAt = toDate(`${dayKey}T${hh}:${mm}:00`, { timeZone });
    if (Number.isNaN(scheduledAt.getTime())) continue;
    const dk = formatInTimeZone(scheduledAt, timeZone, "yyyy-MM-dd");
    out.push({ scheduledAt, dayKey: dk });
  }
  return out;
}

export type ScheduleParams = {
  timezone: string;
  checkInTimes: number[];
};

export function slotsInUtcRange(
  wf: ScheduleParams,
  utcFrom: Date,
  utcTo: Date,
): WorkflowSlot[] {
  const keys = dayKeysTouchingRange(utcFrom, utcTo, wf.timezone);
  const slots: WorkflowSlot[] = [];
  for (const dayKey of keys) {
    slots.push(...slotsForDay(dayKey, wf.timezone, wf.checkInTimes));
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
