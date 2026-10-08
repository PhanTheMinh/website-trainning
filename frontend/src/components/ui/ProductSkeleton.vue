<script setup>
defineProps({ count: { type: Number, default: 6 } })
</script>
<template>
  <div role="status" aria-label="Loading products" class="rs-product-skeletons">
    <span class="rs-sr-only">Loading products…</span>
    <div v-for="index in count" :key="index" aria-hidden="true"><div class="rs-skeleton rs-product-skeletons__image"></div><div class="rs-skeleton rs-product-skeletons__line"></div><div class="rs-skeleton rs-product-skeletons__line rs-product-skeletons__line--short"></div></div>
  </div>
</template>
<style scoped>
.rs-product-skeletons { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 32px 24px; }
.rs-product-skeletons__image { aspect-ratio: 1; }
.rs-product-skeletons__line { height: 16px; margin-top: 16px; }
.rs-product-skeletons__line--short { width: 60%; }
@media (min-width: 761px) and (max-width: 1100px) { .rs-product-skeletons { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 760px) { .rs-product-skeletons { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px 16px; } }
</style>
