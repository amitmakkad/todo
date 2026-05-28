import type { WorkflowOutcome } from "@/lib/types";
import { WORKFLOW_TIMEZONE } from "@/lib/workflow-timezone";
import {
  entryDocId,
  normalizeCheckInTimes,
  slotsInUtcRange,
} from "@/lib/workflow-schedule";

export type WorkflowDef = {
  /** Minutes-of-day in `timezone` (0-1439). */
  checkInTimes: number[];
  timezone: string;
  enabled: boolean;
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
  const timezone = WORKFLOW_TIMEZONE;
  const enabled = data.enabled !== false;
  let checkInTimes = normalizeCheckInTimes(data.checkInTimes);
  if (checkInTimes.length === 0 && Array.isArray(data.checkInHours)) {
    const fallback = new Set<number>();
    for (const x of data.checkInHours) {
      const h = Math.round(Number(x));
      if (Number.isInteger(h) && h >= 0 && h <= 23) fallback.add(h * 60);
    }
    checkInTimes = [...fallback].sort((a, b) => a - b);
  }
  const rawStart = data.entryWindowStartMs;
  let entryWindowStartMs: number | undefined;
  if (typeof rawStart === "number" && Number.isFinite(rawStart)) {
    entryWindowStartMs = rawStart;
  }
  const createdAtMs = firestoreTimestampToMs(data.createdAt);
  return {
    checkInTimes,
    timezone,
    enabled,
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
  if (wf.checkInTimes.length === 0) return [];
  const slots = slotsInUtcRange(
    {
      timezone: wf.timezone,
      checkInTimes: wf.checkInTimes,
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
        createdAt: now,
        updatedAt: now,
      },
    };
  });
}
