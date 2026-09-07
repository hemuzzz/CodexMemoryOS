<script setup lang="ts">
defineProps<{ name: string }>();
const paths: Record<string, string> = {
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
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="paths[name] ?? paths.library" />
  </svg>
</template>
