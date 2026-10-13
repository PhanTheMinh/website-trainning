<script setup>
import { useRouter } from 'vue-router'
import { goBack } from '../utils/backNavigation.js'
const props = defineProps({ fallback: { type: [Object, String], default: () => ({ name: 'home' }) } })
const router = useRouter()
</script>

<template>
  <button class="back-button rs-back-button" type="button" aria-label="Go back" title="Go back" @click="goBack(router, props.fallback)">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="m12 5-7 7 7 7M5 12h14" />
    </svg>
  </button>
</template>
