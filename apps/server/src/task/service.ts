import { SnowflakeIdGenerator, type IdGenerator } from "@codex-memory-os/id-generator";

import { TaskInputError, TaskNotFoundError } from "./errors.js";
import {
  EMPTY_TASK_LOADOUT_JSON,
  type TaskRecord,
  type TaskResolution,
  type TerminalTaskStatus,
} from "./model.js";
import { TaskRepository } from "./repository.js";

export interface ResolveTaskInput {
  explicitTaskId?: string;
  request: string;
  sourceSessionId: string;
  sourceTurnId: string;
  workspace: string | null;
}

export interface TaskApplicationServiceOptions {
  idGenerator?: IdGenerator;
  now?: () => string;
}

export class TaskApplicationService {
  readonly #idGenerator: IdGenerator;
  readonly #now: () => string;

  constructor(
    readonly repository: TaskRepository,
    options: TaskApplicationServiceOptions = {},
  ) {
    this.#idGenerator = options.idGenerator ?? new SnowflakeIdGenerator();
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  resolveTask(input: ResolveTaskInput): TaskResolution {
    assertRequiredText(input.sourceSessionId, "sourceSessionId");
    assertRequiredText(input.sourceTurnId, "sourceTurnId");
    assertRequiredText(input.request, "request");
    if (input.workspace !== null) {
      assertRequiredText(input.workspace, "workspace");
    }
    if (input.explicitTaskId !== undefined && !this.#idGenerator.validate(input.explicitTaskId, "tsk")) {
      throw new TaskInputError(`explicitTaskId must be a valid tsk-prefixed ID: ${input.explicitTaskId}`);
    }

    const boundAt = this.#now();
    return this.repository.resolveAndBind({
      sourceSessionId: input.sourceSessionId,
      sourceTurnId: input.sourceTurnId,
      workspace: input.workspace,
      boundAt,
      ...(input.explicitTaskId === undefined ? {} : { explicitTaskId: input.explicitTaskId }),
      createTask: () => {
        const taskId = this.#idGenerator.next("tsk");
        if (!this.#idGenerator.validate(taskId, "tsk")) {
          throw new TaskInputError(`IdGenerator returned an invalid Task ID: ${taskId}`);
        }
        return {
          taskId,
          workspace: input.workspace,
          request: input.request,
          status: "RUNNING",
          loadoutJson: EMPTY_TASK_LOADOUT_JSON,
          createdAt: boundAt,
          updatedAt: boundAt,
        };
      },
    });
  }

  getTask(taskId: string): TaskRecord {
    if (!this.#idGenerator.validate(taskId, "tsk")) {
      throw new TaskInputError("taskId must be a valid tsk-prefixed ID");
    }

    const task = this.repository.getTask(taskId);
    if (task === null) {
      throw new TaskNotFoundError(taskId);
    }
    return task;
  }

  updateStatus(taskId: string, status: TerminalTaskStatus): TaskRecord {
    if (!this.#idGenerator.validate(taskId, "tsk")) {
      throw new TaskInputError(`taskId must be a valid tsk-prefixed ID: ${taskId}`);
    }
    if (status !== "COMPLETED" && status !== "CANCELLED") {
      throw new TaskInputError(`Task target status must be COMPLETED or CANCELLED: ${String(status)}`);
    }

    return this.repository.updateStatus(taskId, status, this.#now());
  }
}

function assertRequiredText(value: string, field: string): void {
  if (value.length === 0 || value.trim().length === 0) {
    throw new TaskInputError(`${field} must contain non-whitespace text`);
  }
}
