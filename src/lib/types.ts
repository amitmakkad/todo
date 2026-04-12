export type TaskBucket =
  | "urgent_important"
  | "urgent_not_important"
  | "important_not_urgent"
  | "neither";

export const TASK_BUCKET_LABELS: Record<TaskBucket, string> = {
  urgent_important: "Urgent & important",
  urgent_not_important: "Urgent, not important",
  important_not_urgent: "Important, not urgent",
  neither: "Not urgent or important",
};

export type WorkflowOutcome = "pending" | "green" | "red" | "grey" | "discarded";

export const OUTCOME_LABELS: Record<Exclude<WorkflowOutcome, "pending">, string> = {
  green: "Good",
  red: "Bad",
  grey: "Fine",
  discarded: "Skipped",
};
