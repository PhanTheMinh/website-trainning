<script setup>
import { useRouter } from 'vue-router'
import { goBack } from '../utils/backNavigation.js'
const props = defineProps({ fallback: { type: [Object, String], default: () => ({ name: 'home' }) } })
const router = useRouter()
</script>

<template>
  <button class="back-button" type="button" aria-label="Go back" title="Go back" @click="goBack(router, props.fallback)">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="m12 5-7 7 7 7M5 12h14" />
    </svg>
  </button>
</template>

<style scoped>
.back-button { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 44px; height: 44px; padding: 0; border: 1px solid var(--rs-border); border-radius: 50%; background: var(--rs-surface); color: var(--rs-text); cursor: pointer; }
.back-button:hover { background: var(--rs-subtle); color: var(--rs-link); }
.back-button:focus-visible { outline: 2px solid var(--rs-link); outline-offset: 3px; }
</style>
