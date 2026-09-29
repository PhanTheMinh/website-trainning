<template>
  <main class="not-found-page">
    <section class="section not-found-panel">
      <p class="eyebrow">404</p>
      <h1>Page not found</h1>
      <p>This page does not exist or its address has changed.</p>
      <div class="not-found-actions">
        <RouterLink class="primary-action" to="/">Back to home</RouterLink>
        <RouterLink class="secondary-action" to="/products">Shop products</RouterLink>
      </div>
    </section>
  </main>
</template>

<script setup>
import { RouterLink } from 'vue-router'
</script>
