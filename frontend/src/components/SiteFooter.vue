<script setup>
import { RouterLink } from 'vue-router'
</script>
<template>
  <footer class="rs-footer">
    <div><RouterLink class="rs-footer__brand" to="/">RUNSTORE</RouterLink><p>Running gear for every route.</p></div>
    <nav aria-label="Footer navigation"><RouterLink to="/products">Shop</RouterLink><RouterLink to="/categories">Categories</RouterLink><RouterLink :to="{ name: 'management' }">For sellers</RouterLink></nav>
    <small>Built for your next run.</small>
  </footer>
</template>
<style scoped>
.rs-footer { border-top: 1px solid var(--rs-border); padding: 40px max(24px, calc((100vw - 1280px) / 2)); display: flex; justify-content: space-between; align-items: center; gap: 32px; background: var(--rs-surface); color: var(--rs-text); }
.rs-footer__brand { font-weight: 700; letter-spacing: -.06em; font-size: 18px; }
.rs-footer__brand span { font-size: 10px; margin-left: 3px; vertical-align: top; }
.rs-footer p { color: var(--rs-muted); font-size: 13px; margin: 8px 0 0; }
.rs-footer nav { display: flex; flex-wrap: wrap; gap: 24px; }
.rs-footer nav a { font-size: 14px; font-weight: 500; color: var(--rs-text); }
.rs-footer nav a:hover { text-decoration: underline; text-underline-offset: 4px; }
.rs-footer small { font-size: 13px; color: var(--rs-muted); }
@media (max-width: 760px) { .rs-footer { flex-direction: column; align-items: flex-start; padding: 32px 16px; gap: 24px; } }
</style>
