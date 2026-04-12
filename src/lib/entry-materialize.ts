import type { WorkflowOutcome } from "@/lib/types";
import { WORKFLOW_TIMEZONE } from "@/lib/workflow-timezone";
import {
  defaultSlotsPerDay,
  entryDocId,
  normalizeDayStartTime,
  slotsInUtcRange,
} from "@/lib/workflow-schedule";

export type WorkflowDef = {
  intervalHours: number;
  timezone: string;
  enabled: boolean;
  /** Local wall time in `timezone`, format `HH:mm`, first slot of each day. */
  dayStartTime: string;
  /** Max check-ins per local calendar day (notifications only for materialized slots). */
  slotsPerDay: number;
  /**
   * Client epoch ms when the workflow was created. Slots are not materialized before this
   * instant (older workflows omit this and keep the default 48h lookback).
   */
  entryWindowStartMs?: number;
  /** Firestore `createdAt` server time, when readable (fallback for materialize + UI window). */
  createdAtMs?: number;
};

function firestoreTimestampToMs(value: unknown): number | undefined {
  if (
    value &&
    typeof value === "object" &&
    "toMillis" in value &&
    typeof (value as { toMillis: () => number }).toMillis === "function"
  ) {
    const ms = (value as { toMillis: () => number }).toMillis();
    return Number.isFinite(ms) ? ms : undefined;
  }
  return undefined;
}

export function workflowDefFromFirestore(data: Record<string, unknown>): WorkflowDef {
  const intervalHours = Math.min(
    24,
    Math.max(1, Math.round(Number(data.intervalHours) || 4)),
  );
  const timezone = WORKFLOW_TIMEZONE;
  const enabled = data.enabled !== false;
  const dayStartTime = normalizeDayStartTime(
    typeof data.dayStartTime === "string" ? data.dayStartTime : undefined,
  );
  let slotsPerDay = Math.round(Number(data.slotsPerDay));
  if (!Number.isFinite(slotsPerDay) || slotsPerDay < 1) {
    slotsPerDay = defaultSlotsPerDay(intervalHours);
  }
  slotsPerDay = Math.min(48, Math.max(1, slotsPerDay));
  const rawStart = data.entryWindowStartMs;
  let entryWindowStartMs: number | undefined;
  if (typeof rawStart === "number" && Number.isFinite(rawStart)) {
    entryWindowStartMs = rawStart;
  }
  const createdAtMs = firestoreTimestampToMs(data.createdAt);
  return {
    intervalHours,
    timezone,
    enabled,
    dayStartTime,
    slotsPerDay,
    entryWindowStartMs,
    createdAtMs,
  };
}

/** Do not list entries with `scheduledAtMs` below this (materialize / UI). */
export function workflowEntryVisibilityMinMs(wf: WorkflowDef): number {
  if (typeof wf.entryWindowStartMs === "number" && Number.isFinite(wf.entryWindowStartMs)) {
    return wf.entryWindowStartMs;
  }
  if (typeof wf.createdAtMs === "number" && Number.isFinite(wf.createdAtMs)) {
    return wf.createdAtMs;
  }
  return 0;
}

/** UTC range start for materializing entries: 48h lookback, capped to workflow start if known. */
export function entryMaterializeUtcFrom(nowMs: number, wf: WorkflowDef): Date {
  const defaultLookbackMs = nowMs - 48 * 60 * 60 * 1000;
  const wfStart = workflowEntryVisibilityMinMs(wf);
  if (wfStart > 0) {
    return new Date(Math.max(defaultLookbackMs, wfStart));
  }
  return new Date(defaultLookbackMs);
}

export type WorkflowEntryWrite = {
  id: string;
  data: {
    workflowId: string;
    scheduledAt: Date;
    scheduledAtMs: number;
    dayKey: string;
    outcome: WorkflowOutcome;
    /** Free-form log text; empty string when not set. */
    note: string;
    notifiedAt: null;
    createdAt: Date;
    updatedAt: Date;
  };
};

export function buildPendingEntriesForWindow(
  workflowId: string,
  wf: WorkflowDef,
  utcFrom: Date,
  utcTo: Date,
): WorkflowEntryWrite[] {
  if (!wf.enabled) return [];
  const slots = slotsInUtcRange(
    {
      timezone: wf.timezone,
      intervalHours: wf.intervalHours,
      dayStartTime: wf.dayStartTime,
      slotsPerDay: wf.slotsPerDay,
    },
    utcFrom,
    utcTo,
  );
  const now = new Date();
  return slots.map((slot) => {
    const id = entryDocId(workflowId, slot.scheduledAt.getTime());
    return {
      id,
      data: {
        workflowId,
        scheduledAt: slot.scheduledAt,
        scheduledAtMs: slot.scheduledAt.getTime(),
        dayKey: slot.dayKey,
        outcome: "pending" as const,
        note: "",
        notifiedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    };
  });
}
