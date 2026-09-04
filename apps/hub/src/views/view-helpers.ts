import { HubApiError } from "../api/client";

export interface PresentedError {
  detail: string;
  title: string;
}

export type ReadViewContext = "SYSTEM_STATUS" | "TASK_DETAIL" | "TASK_LIST" | "USAGE_LIST";

export function asHubApiError(error: unknown): HubApiError {
  return error instanceof HubApiError
    ? error
    : new HubApiError("CLIENT_ERROR", "The view could not be loaded", true, 0);
}

export function presentReadError(
  error: HubApiError | undefined,
  context: ReadViewContext,
): PresentedError | undefined {
  if (error === undefined) {
    return undefined;
  }
  if (error.code === "SERVICE_UNREACHABLE") {
    return {
      title: "Local service is offline",
      detail: "Start the CodexMemoryOS server, then retry this view.",
    };
  }
  if (error.code === "INVALID_RESPONSE") {
    return {
      title: "Response could not be read",
      detail: "The local service returned an unexpected response. Check the server and retry.",
    };
  }
  if (context === "TASK_DETAIL" && error.status === 404) {
    return {
      title: "Task no longer exists",
      detail: "Refresh the Task list to replace this stale selection.",
    };
  }
  if (error.status === 503) {
    const subject = context === "SYSTEM_STATUS"
      ? "System Status"
      : context === "USAGE_LIST"
        ? "Usage"
        : "Task Loadout";
    return {
      title: `${subject} is temporarily unavailable`,
      detail: "The local service is not ready. Retry after it recovers.",
    };
  }
  if (error.status >= 500) {
    return {
      title: "Local service could not complete the request",
      detail: "No internal details were exposed. Check the server log, then retry.",
    };
  }
  return { title: "Request could not be completed", detail: error.message };
}

export function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function displayWorkspace(workspace: string | null): string {
  return workspace ?? "No workspace (NULL)";
}
