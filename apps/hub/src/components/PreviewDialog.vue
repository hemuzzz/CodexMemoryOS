<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import UiIcon from "./UiIcon.vue";
defineProps<{ label: string; expanded?: boolean }>();
const emit = defineEmits<{ close: []; expand: [] }>();
const dialog = ref<HTMLDialogElement>();
let origin: HTMLElement | null = null;
onMounted(async () => {
  origin =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  await nextTick();
  dialog.value?.showModal();
});
onBeforeUnmount(() => {
  dialog.value?.close();
  if (origin?.isConnected) origin.focus();
});
function backdrop(event: MouseEvent) {
  if (event.target !== dialog.value || !dialog.value) return;
  const r = dialog.value.getBoundingClientRect();
  if (
    event.clientX < r.left ||
    event.clientX > r.right ||
    event.clientY < r.top ||
    event.clientY > r.bottom
  )
    emit("close");
}
</script>
<template>
  <dialog
    ref="dialog"
    class="preview-dialog"
    :class="{ 'full-detail': expanded }"
    :aria-label="label"
    @cancel.prevent="emit('close')"
    @click="backdrop"
  >
    <div class="preview-actions">
      <button
        type="button"
        class="icon-button"
        :aria-label="expanded ? '收起阅读视图' : '展开阅读'"
        @click="emit('expand')"
      >
        <UiIcon :name="expanded ? 'minimize' : 'expand'" />
      </button>
      <button
        type="button"
        class="icon-button"
        aria-label="关闭详情"
        autofocus
        @click="emit('close')"
      >
        <UiIcon name="close" />
      </button>
    </div>
    <slot />
  </dialog>
</template>
