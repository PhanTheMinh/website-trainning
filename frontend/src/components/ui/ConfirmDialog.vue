<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import UiButton from './UiButton.vue'
const props = defineProps({ open: Boolean, busy: Boolean, title: { type: String, required: true }, description: { type: String, default: '' }, error: { type: String, default: '' }, confirmLabel: { type: String, default: 'Delete' }, busyLabel: { type: String, default: 'Deleting…' }, confirmVariant: { type: String, default: 'danger' } })
const emit = defineEmits(['cancel', 'confirm'])
const dialog = ref(null)
watch(() => props.open, async open => {
  await nextTick()
  if (open && !dialog.value?.open) dialog.value?.showModal()
  if (!open && dialog.value?.open) dialog.value.close()
}, { immediate: true })
function cancel() { if (!props.busy) emit('cancel') }
onBeforeUnmount(() => { if (dialog.value?.open) dialog.value.close() })
</script>
<template>
  <Teleport to="body">
    <dialog ref="dialog" class="rs-confirm" aria-labelledby="confirm-title" aria-describedby="confirm-description" @cancel.prevent="cancel">
      <h2 id="confirm-title">{{ title }}</h2><p id="confirm-description">{{ description }}</p>
      <slot />
      <p v-if="error" class="rs-alert rs-alert--error" role="alert">{{ error }}</p>
      <div class="rs-confirm__actions"><UiButton variant="secondary" :disabled="busy" autofocus @click="cancel">Cancel</UiButton><UiButton :variant="confirmVariant" :busy="busy" @click="emit('confirm')">{{ busy ? busyLabel : confirmLabel }}</UiButton></div>
    </dialog>
  </Teleport>
</template>
<style scoped>
.rs-confirm { width: min(460px, calc(100vw - 32px)); max-height: calc(100dvh - 48px); overflow: auto; padding: 24px; background: var(--rs-surface); color: var(--rs-text); border: 1px solid var(--rs-border); border-radius: 12px; box-shadow: var(--rs-shadow); }
.rs-confirm::backdrop { background: var(--rs-overlay); }
.rs-confirm h2 { color: var(--rs-text); font-size: 22px; margin: 0 0 12px; line-height: 1.3; }
.rs-confirm p { color: var(--rs-muted); font-size: 14px; margin: 0 0 24px; overflow-wrap: anywhere; }
.rs-confirm .rs-alert--error { color: var(--rs-error); }
.rs-confirm__actions { display: flex; gap: 12px; justify-content: flex-end; }
</style>
