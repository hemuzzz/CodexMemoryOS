<script setup lang="ts">
defineProps<{ name: string }>();
const paths: Record<string, string> = {
  overview: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  close: "M18 6 6 18M6 6l12 12",
  panel:
    "M9 3v18M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z",
  expand: "M15 3h6v6M21 3l-7 7M9 21H3v-6M3 21l7-7",
  minimize: "M4 10h6V4M10 10 3 3M20 14h-6v6M14 14l7 7",
  document:
    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6ZM14 2v6h6M8 13h8M8 17h6",
  memory: "M9 3H5v4M15 3h4v4M9 21H5v-4M15 21h4v-4M8 8h8v8H8Z",
  code: "m8 7-5 5 5 5m8-10 5 5-5 5m-3-14-2 18",
  warning: "m12 3 10 18H2L12 3Zm0 6v4m0 3v1",
  refresh: "M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 2M5 16a8 8 0 0 0 13 2",

  search: "m21 21-4.4-4.4M19 10.5a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0",
  library: "M4 4h4v16H4zM12 4v16M16 4l4 16",
  inbox: "M4 4h16l2 12v4H2v-4L4 4ZM2 16h6l2 3h4l2-3h6",
  layers: "m12 3 10 5-10 5L2 8l10-5ZM2 12l10 5 10-5M2 16l10 5 10-5",
  activity: "M2 12h5l3-8 4 16 3-8h5",
  settings: "M4 7h16M4 17h16M8 4v6M16 14v6",
  sun: "M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  filter: "M4 6h16M7 12h10M10 18h4",
};
</script>

<template>
  <svg
    class="ui-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="paths[name] ?? paths.library" />
  </svg>
</template>
