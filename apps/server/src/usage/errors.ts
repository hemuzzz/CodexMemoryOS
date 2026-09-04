export class UsageError extends Error {
  constructor(
    readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "UsageError";
  }
}

export class UsageSchemaError extends UsageError {
  constructor(message: string, options?: ErrorOptions) {
    super("USAGE_SCHEMA_INVALID", message, options);
    this.name = "UsageSchemaError";
  }
}

export class UsageWriteError extends UsageError {
  constructor(operation: string, options?: ErrorOptions) {
    super("USAGE_WRITE_FAILED", `Usage ${operation} could not be persisted`, options);
    this.name = "UsageWriteError";
  }
}

export class UsageInputError extends UsageError {
  constructor(message: string) {
    super("USAGE_INPUT_INVALID", message);
    this.name = "UsageInputError";
  }
}
