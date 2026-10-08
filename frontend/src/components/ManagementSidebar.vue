<script setup>
import BackButton from './BackButton.vue'
import { ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import UiIcon from './ui/UiIcon.vue'
const route = useRoute()
const open = ref(false)
const links = [
  { label: 'Overview', icon: 'grid', route: 'management', active: ['management'] },
  { label: 'Products', icon: 'package', route: 'my-products', active: ['my-products', 'product-create', 'product-edit', 'product-trash'] },
  { label: 'Orders', icon: 'package', route: 'seller-order-list', active: ['seller-order-list', 'seller-order-detail'] },
  { label: 'Shop settings', icon: 'store', route: 'my-shop', active: ['my-shop'] },
  { label: 'Shipping methods', icon: 'truck', route: 'shipping-method-list', active: ['shipping-methods', 'shipping-method-list', 'shipping-method-create'] },
  { label: 'Countries', icon: 'grid', route: 'shipping-country-list', active: ['shipping-countries', 'shipping-country-list', 'shipping-country-create'] },
  { label: 'Shipping rates', icon: 'truck', route: 'shipping-setting-list', active: ['shipping-settings', 'shipping-setting-list', 'shipping-setting-create', 'shipping-setting-detail'] },
  { label: 'Payment methods', icon: 'credit', route: 'payment-method-list', active: ['payment-method-list', 'payment-method-create', 'payment-method-edit'] }
]
watch(() => route.fullPath, () => { open.value = false })
</script>
<template>
  <aside class="rs-seller-sidebar">
    <div class="rs-seller-sidebar__heading"><span>Seller workspace</span><button class="rs-seller-sidebar__toggle" type="button" :aria-expanded="open" aria-controls="seller-navigation" aria-label="Toggle seller navigation" @click="open = !open"><UiIcon :name="open ? 'close' : 'menu'" /></button></div>
    <nav id="seller-navigation" class="rs-seller-sidebar__nav" :class="{ 'is-open': open }" aria-label="Seller navigation">
      <RouterLink v-for="item in links" :key="item.route" :to="{ name: item.route }" :class="{ 'is-selected': item.active.includes(route.name) }" :aria-current="item.active.includes(route.name) ? 'page' : undefined"><UiIcon :name="item.icon" :size="18" />{{ item.label }}</RouterLink>
      <div class="rs-seller-sidebar__back"><BackButton :fallback="{ name: 'products' }" /></div>
    </nav>
  </aside>
</template>
<style scoped>
.rs-seller-sidebar { position: sticky; top: 104px; align-self: start; color: var(--rs-text); }
.rs-seller-sidebar__heading { display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: var(--rs-muted); padding: 0 12px 16px; }
.rs-seller-sidebar__nav { display: grid; gap: 4px; }
.rs-seller-sidebar__nav a { display: flex; align-items: center; gap: 12px; min-height: 44px; padding: 10px 12px; border-radius: 6px; color: var(--rs-muted); font-size: 14px; font-weight: 400; }
.rs-seller-sidebar__nav a:hover { color: var(--rs-text); background: var(--rs-subtle); }
.rs-seller-sidebar__nav a.is-selected { color: var(--rs-text); background: var(--rs-subtle); font-weight: 600; }
.rs-seller-sidebar__nav a.is-selected svg { color: var(--rs-link); }
.rs-seller-sidebar__nav .rs-seller-sidebar__back { border-top: 1px solid var(--rs-border); margin-top: 24px; padding-top: 20px; border-radius: 0; font-size: 13px; }
.rs-seller-sidebar__toggle { display: none; background: none; color: var(--rs-text); border: 0; width: 44px; height: 44px; place-items: center; }
@media (max-width: 1000px) { .rs-seller-sidebar { top: 150px; } }
@media (max-width: 860px) {
  .rs-seller-sidebar { position: static; background: var(--rs-surface); border: 1px solid var(--rs-border); border-radius: 8px; padding: 8px; }
  .rs-seller-sidebar__heading { padding: 0 4px 0 8px; color: var(--rs-text); font-weight: 600; }
  .rs-seller-sidebar__toggle { display: grid; }
  .rs-seller-sidebar__nav { display: none; padding-top: 8px; }
  .rs-seller-sidebar__nav.is-open { display: grid; }
}
</style>
