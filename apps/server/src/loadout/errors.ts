export class LoadoutError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "LoadoutError";
  }
}

export class LoadoutJsonError extends LoadoutError {
  constructor(message: string) {
    super("LOADOUT_JSON_INVALID", message);
    this.name = "LoadoutJsonError";
  }
}

export class LoadoutNotMutableError extends LoadoutError {
  constructor(taskId: string, status: string) {
    super("TASK_STATUS_NOT_ALLOWED", `Task ${taskId} is ${status}; only RUNNING Tasks can resolve Loadout`);
    this.name = "LoadoutNotMutableError";
  }
}

export class LoadoutRenderError extends LoadoutError {
  constructor(message: string) {
    super("LOADOUT_RENDER_FAILED", message);
    this.name = "LoadoutRenderError";
  }
}
