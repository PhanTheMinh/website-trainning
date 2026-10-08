<script setup>
import { ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { formatCurrency } from '../data/catalog.js'
import UiIcon from './ui/UiIcon.vue'
import UiButton from './ui/UiButton.vue'
const props = defineProps({ product: { type: Object, required: true } })
defineEmits(['add-to-cart'])
const imageFailed = ref(false)
watch(() => props.product.imageUrl, () => { imageFailed.value = false })
</script>
<template>
  <article class="rs-product">
    <component :is="product.detailRoute ? RouterLink : 'div'" class="rs-product__image" :to="product.detailRoute || undefined" :aria-label="product.detailRoute ? 'View ' + product.name : undefined">
      <img v-if="product.imageUrl && !imageFailed" :src="product.imageUrl" :alt="product.name" loading="lazy" decoding="async" @error="imageFailed = true" />
      <span v-else class="rs-product__fallback"><UiIcon name="image" :size="32" /><span>Image unavailable</span></span>
      <span v-if="product.stock === 0" class="rs-product__sold-out">Sold out</span>
    </component>
    <div class="rs-product__info">
      <p class="rs-product__brand">{{ product.brand || product.category }}</p>
      <h3><RouterLink v-if="product.detailRoute" :to="product.detailRoute">{{ product.name }}</RouterLink><template v-else>{{ product.name }}</template></h3>
      <p class="rs-product__price">{{ formatCurrency(product.price) }}<span v-if="product.maxPrice > product.price"> – {{ formatCurrency(product.maxPrice) }}</span></p>
      <RouterLink v-if="product.shopRoute" class="rs-product__shop" :to="product.shopRoute">{{ product.shop.name }}</RouterLink>
    </div>
    <RouterLink v-if="product.requiresSelection" class="rs-button rs-button--secondary rs-product__action" :to="product.detailRoute">Choose options<UiIcon name="arrow" :size="16" /></RouterLink>
    <UiButton v-else variant="secondary" class="rs-product__action" :disabled="product.stock === 0" @click="$emit('add-to-cart', product.cartItem)">{{ product.stock === 0 ? 'Sold out' : 'Add to cart' }}<UiIcon v-if="product.stock !== 0" name="plus" :size="16" /></UiButton>
  </article>
</template>
<style scoped>
.rs-product { min-width: 0; display: flex; flex-direction: column; color: var(--rs-text); }
.rs-product__image { position: relative; display: grid; place-items: center; aspect-ratio: 1; background: var(--rs-subtle); border-radius: 8px; overflow: hidden; }
.rs-product__image img { width: 100%; height: 100%; object-fit: contain; transition: transform 180ms ease; }
.rs-product__image:hover img { transform: scale(1.025); }
.rs-product__fallback { display: grid; justify-items: center; gap: 8px; color: var(--rs-muted); font-size: 13px; }
.rs-product__sold-out { position: absolute; top: 12px; left: 12px; background: var(--rs-surface); color: var(--rs-muted); padding: 4px 8px; border-radius: 4px; font-size: 12px; }
.rs-product__info { display: flex; flex-direction: column; padding: 16px 0 12px; flex: 1; }
.rs-product__brand { margin: 0 0 6px; font-size: 13px; color: var(--rs-muted); }
.rs-product h3 { margin: 0 0 10px; font-size: 16px; font-weight: 500; line-height: 1.5; color: var(--rs-text); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.rs-product h3 a:hover { text-decoration: underline; text-underline-offset: 3px; }
.rs-product__price { margin: auto 0 6px; font-size: 14px; font-weight: 600; overflow-wrap: anywhere; }
.rs-product__shop { width: fit-content; color: var(--rs-muted); font-size: 13px; }
.rs-product__shop:hover { color: var(--rs-link); }
.rs-product__action { width: 100%; justify-content: space-between; }
@media (max-width: 640px) { .rs-product h3 { font-size: 14px; } .rs-product__info { padding-top: 12px; } .rs-product__price { font-size: 13px; } .rs-product__action { padding-inline: 10px; font-size: 13px; } }
@media (prefers-reduced-motion: reduce) { .rs-product__image img { transition: none; } .rs-product__image:hover img { transform: none; } }
</style>
