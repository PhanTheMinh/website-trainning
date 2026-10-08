<script setup>
import UiIcon from './UiIcon.vue'
defineProps({ title: { type: String, required: true }, description: { type: String, default: '' }, icon: { type: String, default: 'package' } })
</script>
<template>
  <section class="rs-empty">
    <div class="rs-empty__icon"><UiIcon :name="icon" :size="28" /></div>
    <h2>{{ title }}</h2><p v-if="description">{{ description }}</p><slot />
  </section>
</template>
<style scoped>
.rs-empty { padding: 48px 24px; text-align: center; color: var(--rs-text); background: var(--rs-surface); border-radius: 8px; }
.rs-empty__icon { background: var(--rs-subtle); display: grid; place-items: center; width: 56px; height: 56px; border-radius: 50%; margin: 0 auto 16px; color: var(--rs-muted); }
.rs-empty h2 { font-size: 20px; line-height: 1.4; margin: 0 0 8px; }
.rs-empty p { font-size: 14px; max-width: 460px; margin: 0 auto 24px; color: var(--rs-muted); }
</style>
