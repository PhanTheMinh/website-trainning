<script setup>
defineProps({ title: { type: String, required: true }, description: { type: String, default: '' }, eyebrow: { type: String, default: '' } })
</script>
<template>
  <header class="rs-page-header">
    <div><p v-if="eyebrow" class="rs-page-header__eyebrow">{{ eyebrow }}</p><h1>{{ title }}</h1><p v-if="description" class="rs-page-header__description">{{ description }}</p></div>
    <div v-if="$slots.default" class="rs-page-header__actions"><slot /></div>
  </header>
</template>
<style scoped>
.rs-page-header { display: flex; align-items: center; justify-content: space-between; gap: 24px; margin-bottom: 32px; }
.rs-page-header h1 { color: var(--rs-text); font-size: 32px; line-height: 1.2; letter-spacing: -.04em; max-width: none; margin: 0; overflow-wrap: anywhere; }
.rs-page-header__eyebrow { margin: 0 0 8px; font-size: 13px; color: var(--rs-muted); }
.rs-page-header__description { margin: 12px 0 0; color: var(--rs-muted); font-size: 14px; }
.rs-page-header__actions { display: flex; flex-shrink: 0; gap: 8px; }
@media (max-width: 640px) { .rs-page-header { flex-wrap: wrap; gap: 16px; margin-bottom: 24px; } .rs-page-header h1 { font-size: 24px; } }
</style>
