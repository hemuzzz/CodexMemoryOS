export class TaskError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "TaskError";
  }
}

export class TaskSchemaError extends TaskError {
  constructor(message: string) {
    super("TASK_SCHEMA_INVALID", message);
    this.name = "TaskSchemaError";
  }
}

export class TaskNotFoundError extends TaskError {
  constructor(taskId: string) {
    super("TASK_NOT_FOUND", `Task ${taskId} does not exist`);
    this.name = "TaskNotFoundError";
  }
}

export class TaskNotRunningError extends TaskError {
  constructor(taskId: string, status: string) {
    super("TASK_NOT_RUNNING", `Task ${taskId} is ${status}; only RUNNING Tasks can accept a new Turn`);
    this.name = "TaskNotRunningError";
  }
}

export class TaskWorkspaceMismatchError extends TaskError {
  constructor(taskId: string, taskWorkspace: string | null, currentWorkspace: string | null) {
    super(
      "TASK_WORKSPACE_MISMATCH",
      `Task ${taskId} belongs to workspace ${formatWorkspace(taskWorkspace)}, not ${formatWorkspace(currentWorkspace)}`,
    );
    this.name = "TaskWorkspaceMismatchError";
  }
}

export class AmbiguousRunningTaskError extends TaskError {
  constructor(sourceSessionId: string, workspace: string | null, taskIds: readonly string[]) {
    super(
      "AMBIGUOUS_RUNNING_TASK",
      `Session ${sourceSessionId} has multiple RUNNING Tasks for workspace ${formatWorkspace(workspace)}: ${taskIds.join(", ")}; provide an explicit taskId`,
    );
    this.name = "AmbiguousRunningTaskError";
  }
}

export class InvalidTaskTransitionError extends TaskError {
  constructor(taskId: string, fromStatus: string, toStatus: string) {
    super("INVALID_TASK_TRANSITION", `Task ${taskId} cannot transition from ${fromStatus} to ${toStatus}`);
    this.name = "InvalidTaskTransitionError";
  }
}

export class TaskInputError extends TaskError {
  constructor(message: string) {
    super("TASK_INPUT_INVALID", message);
    this.name = "TaskInputError";
  }
}

function formatWorkspace(workspace: string | null): string {
  return workspace === null ? "NULL" : JSON.stringify(workspace);
}
