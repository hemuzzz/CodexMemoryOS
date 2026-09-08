import { onBeforeUnmount, ref } from "vue";

export type Page =
  | "library"
  | "search"
  | "inbox"
  | "tasks"
  | "usage"
  | "status";
const pages: Page[] = [
  "library",
  "search",
  "inbox",
  "tasks",
  "usage",
  "status",
];

export function readRoute() {
  const [page, encodedId, presentation] = location.hash
    .replace(/^#\/?/, "")
    .split("/");
  let id: string | undefined;
  try {
    id = encodedId ? decodeURIComponent(encodedId) : undefined;
  } catch {
    /* Malformed links open the list. */
  }
  return {
    page: pages.includes(page as Page) ? (page as Page) : ("library" as Page),
    id,
    expanded: presentation === "read",
  };
}

export function navigate(page: Page, id?: string, expanded = false): void {
  const hash = `#/${page}${id ? `/${encodeURIComponent(id)}` : ""}${expanded ? "/read" : ""}`;
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
