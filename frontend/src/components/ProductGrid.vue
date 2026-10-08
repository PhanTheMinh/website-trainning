<script setup>
import ProductCard from './ProductCard.vue'
import EmptyState from './ui/EmptyState.vue'
defineProps({
  products: { type: Array, default: () => [] },
  emptyTitle: { type: String, default: 'No products found' },
  emptyMessage: { type: String, default: 'Try another search or category.' }
})
defineEmits(['add-to-cart'])
</script>
<template>
  <div v-if="products.length" class="rs-product-grid">
    <ProductCard v-for="product in products" :key="product.catalogKey || product.id" :product="product" @add-to-cart="$emit('add-to-cart', $event)" />
  </div>
  <EmptyState v-else :title="emptyTitle" :description="emptyMessage" />
</template>
<style scoped>
.rs-product-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 32px 24px; }
@media (min-width: 761px) and (max-width: 1100px) { .rs-product-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 760px) { .rs-product-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px 16px; } }
@media (max-width: 340px) { .rs-product-grid { grid-template-columns: 1fr; } }
</style>
