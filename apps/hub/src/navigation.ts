import { onBeforeUnmount, ref } from "vue";

export type Page =
  | "overview"
  | "library"
  | "search"
  | "inbox"
  | "tasks"
  | "usage"
  | "status";
const pages: Page[] = [
  "overview",
  "library",
  "search",
  "inbox",
  "tasks",
  "usage",
  "status",
];

export function readRoute() {
  const [path, query = ""] = location.hash.replace(/^#\/?/, "").split("?");
  const [page, encodedId, presentation] = (path ?? "").split("/");
  let id: string | undefined;
  try {
    id = encodedId ? decodeURIComponent(encodedId) : undefined;
  } catch {
    /* Malformed links open the list. */
  }
  return {
    page: pages.includes(page as Page) ? (page as Page) : ("overview" as Page),
    id,
    query,
    expanded: presentation === "read",
  };
}

export function navigate(page: Page, id?: string, expanded = false, filters?: Record<string, string>): void {
  const query = new URLSearchParams(filters).toString();
  const hash = `#/${page}${id ? `/${encodeURIComponent(id)}` : ""}${expanded ? "/read" : ""}${query ? `?${query}` : ""}`;
  if (location.hash === hash) return;
  history.pushState(null, "", hash);
  window.dispatchEvent(new Event("hub:navigate"));
}

export function useRoute() {
  const route = ref(readRoute());
  const update = () => {
    route.value = readRoute();
  };
  const events = ["popstate", "hashchange", "hub:navigate"];
  events.forEach((event) => window.addEventListener(event, update));
  onBeforeUnmount(() =>
    events.forEach((event) => window.removeEventListener(event, update)),
  );
  return route;
}
