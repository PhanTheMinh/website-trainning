<script setup>
import ManagementSidebar from '../components/ManagementSidebar.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import UiButton from '../components/ui/UiButton.vue'
defineProps({ currentUser: { type: Object, default: null }, sessionLoading: Boolean })
defineEmits(['open-auth'])
</script>
<template>
  <main class="rs-seller rs-container">
    <div v-if="sessionLoading" class="rs-seller__loading" role="status"><div class="rs-skeleton"></div><p>Loading your workspace…</p></div>
    <EmptyState v-else-if="!currentUser" title="Your seller workspace" description="Sign in to manage your shop, products, shipping, and payments." icon="store"><UiButton @click="$emit('open-auth')">Sign in</UiButton></EmptyState>
    <div v-else class="rs-seller__layout"><ManagementSidebar /><div class="rs-seller__content"><slot /></div></div>
  </main>
</template>
<style scoped>
.rs-seller { min-height: 72vh; }
.rs-seller__layout { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 40px; }
.rs-seller__content { min-width: 0; }
.rs-seller__loading { color: var(--rs-muted); }
.rs-seller__loading .rs-skeleton { width: 100%; height: 200px; margin-bottom: 24px; }
@media (max-width: 860px) { .rs-seller__layout { grid-template-columns: 1fr; gap: 24px; } }
</style>
