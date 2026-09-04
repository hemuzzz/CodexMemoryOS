import { createEmptyTaskLoadout as createPolicyEmptyTaskLoadout } from "../loadout/policy.js";

export const TASK_STATUSES = ["RUNNING", "COMPLETED", "CANCELLED"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TERMINAL_TASK_STATUSES = ["COMPLETED", "CANCELLED"] as const satisfies readonly TaskStatus[];

export type TerminalTaskStatus = (typeof TERMINAL_TASK_STATUSES)[number];

export interface TaskRecord {
  createdAt: string;
  loadoutJson: string;
  request: string;
  status: TaskStatus;
  taskId: string;
  updatedAt: string;
  workspace: string | null;
}

export type TaskResolutionKind =
  | "EXISTING_BINDING"
  | "EXPLICIT_ATTACH"
  | "SESSION_REUSE"
  | "CREATED";

export interface TaskResolution {
  kind: TaskResolutionKind;
  task: TaskRecord;
}

export interface EmptyTaskLoadout {
  assets: [];
  limits: {
    maxAssets: 8;
    maxInjectedCharacters: 3000;
  };
  schemaVersion: 1;
}

export function createEmptyTaskLoadout(): EmptyTaskLoadout {
  return createPolicyEmptyTaskLoadout() as EmptyTaskLoadout;
}

export const EMPTY_TASK_LOADOUT_JSON = JSON.stringify(createEmptyTaskLoadout());
