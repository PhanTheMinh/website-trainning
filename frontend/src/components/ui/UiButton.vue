<script setup>
defineProps({ variant: { type: String, default: 'primary' }, busy: Boolean, disabled: Boolean, type: { type: String, default: 'button' } })
</script>
<template>
  <button :type="type" :class="['rs-button', `rs-button--${variant}`]" :disabled="disabled || busy" :aria-busy="busy || undefined">
    <span v-if="busy" class="rs-button-spinner" aria-hidden="true"></span><slot />
  </button>
</template>
<style scoped>
.rs-button-spinner { width: 14px; height: 14px; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .rs-button-spinner { animation: none; } }
</style>
