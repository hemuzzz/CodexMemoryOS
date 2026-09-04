import { SnowflakeIdGenerator, type IdGenerator } from "@codex-memory-os/id-generator";

import { UsageInputError, UsageWriteError } from "./errors.js";
import type {
  AssetUsageSummary,
  UsageListInput,
  UsageListItem,
  UsageRecord,
} from "./model.js";
import { UsageRepository, type UsageUpsertInput } from "./repository.js";

export interface UsageApplicationServiceOptions {
  idGenerator?: IdGenerator;
  now?: () => string;
}

export class UsageApplicationService {
  readonly #idGenerator: IdGenerator;
  readonly #now: () => string;

  constructor(
    readonly repository: UsageRepository,
    options: UsageApplicationServiceOptions = {},
  ) {
    this.#idGenerator = options.idGenerator ?? new SnowflakeIdGenerator();
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  recordRecalls(taskId: string, assetIds: readonly string[]): UsageRecord[] {
    const timestamp = this.#now();
    return this.repository.recordRecalls(assetIds.map((assetId) => this.#newInput(taskId, assetId, timestamp)));
  }

  recordRead(taskId: string, assetId: string): UsageRecord {
    const timestamp = this.#now();
    return this.repository.recordRead(this.#newInput(taskId, assetId, timestamp));
  }

  markUsed(taskId: string, assetId: string): UsageRecord {
    const timestamp = this.#now();
    return this.repository.markUsed(this.#newInput(taskId, assetId, timestamp));
  }

  listByTask(taskId: string): UsageRecord[] {
    return this.repository.listByTask(taskId);
  }

  list(input: UsageListInput): UsageListItem[] {
    const limit = input.limit ?? 20;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new UsageInputError("Usage list limit must be a safe integer from 1 to 100");
    }
    return this.repository.list({
      limit,
      ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
      ...(input.assetId === undefined ? {} : { assetId: input.assetId }),
      ...(Object.prototype.hasOwnProperty.call(input, "workspace")
        ? { workspace: input.workspace ?? null }
        : {}),
    });
  }

  summarizeByAsset(assetId: string): AssetUsageSummary {
    return this.repository.summarizeByAsset(assetId);
  }

  #newInput(taskId: string, assetId: string, timestamp: string): UsageUpsertInput {
    const usageId = this.#idGenerator.next("usg");
    if (!this.#idGenerator.validate(usageId, "usg")) {
      throw new UsageWriteError("ID_GENERATION");
    }
    return {
      assetId,
      createdAt: timestamp,
      taskId,
      updatedAt: timestamp,
      usageId,
    };
  }
}
