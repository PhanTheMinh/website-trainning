<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { formatCurrency } from '../data/catalog.js'
import { API_BASE_URL } from '../services/apiClient.js'
import { validatePurchase } from '../services/productService.js'
import { STOREFRONT_ERROR } from '../utils/storefrontErrors.js'

const props = defineProps({
  cartItems: { type: Array, default: () => [] },
  preparingCheckout: { type: Boolean, default: false }
})

const emit = defineEmits(['set-quantity', 'remove-line', 'refresh-item', 'begin-checkout'])
const selectedKeys = ref(new Set())
const availability = ref({})
const checkingAvailability = ref(false)
let availabilityTimer
let needsRecheck = false

function absoluteImageUrl(imageUrl) {
  if (!imageUrl) return ''
  try { return new URL(imageUrl, API_BASE_URL).toString() } catch { return '' }
}

const groupedItems = computed(() => {
  const grouped = new Map()
  props.cartItems.forEach((product) => {
    const key = product.catalogKey || product.id
    const current = grouped.get(key)
    if (current) current.quantity += 1
    else grouped.set(key, { key, product, quantity: 1 })
  })
  return Array.from(grouped.values())
})

const shopGroups = computed(() => {
  const groups = new Map()
  groupedItems.value.forEach((item) => {
    const shop = item.product.shop || null
    const key = shop?.id ? `shop-${shop.id}` : 'shop-unknown'
    const group = groups.get(key) || { key, shop, items: [] }
    group.items.push(item)
    groups.set(key, group)
  })
  return Array.from(groups.values())
})

const selectableItems = computed(() => groupedItems.value.filter((item) => isSelectable(item)))
const selectedItems = computed(() => selectableItems.value.filter((item) => selectedKeys.value.has(item.key)))
const selectedQuantity = computed(() => selectedItems.value.reduce((total, item) => total + item.quantity, 0))
const selectedTotal = computed(() => selectedItems.value.reduce(
  (total, item) => total + Number(item.product.price) * item.quantity, 0
))
const allSelected = computed(() => selectableItems.value.length > 0 &&
  selectableItems.value.every((item) => selectedKeys.value.has(item.key))
)

function isSelectable(item) {
  return availability.value[item.key] === 'available'
}

function itemMessage(item) {
  const state = availability.value[item.key]
  if (state === 'unavailable') return 'This item is sold out. Please choose another item.'
  if (state === 'insufficient') return 'Your cart quantity exceeds available stock. Please reduce the quantity.'
  if (state === 'unknown') return 'Could not check this item. Please try again later.'
  return 'Checking item availability...'
}

function toggleItem(key, checked) {
  const next = new Set(selectedKeys.value)
  if (checked) next.add(key)
  else next.delete(key)
  selectedKeys.value = next
}

function toggleGroup(group, checked) {
  const next = new Set(selectedKeys.value)
  group.items.filter(isSelectable).forEach((item) => {
    if (checked) next.add(item.key)
    else next.delete(item.key)
  })
  selectedKeys.value = next
}

function toggleAll(checked) {
  selectedKeys.value = checked
    ? new Set(selectableItems.value.map((item) => item.key))
    : new Set()
}

function groupSelected(group) {
  const eligible = group.items.filter(isSelectable)
  return eligible.length > 0 && eligible.every((item) => selectedKeys.value.has(item.key))
}

function groupPartiallySelected(group) {
  const eligible = group.items.filter(isSelectable)
  return eligible.some((item) => selectedKeys.value.has(item.key)) && !groupSelected(group)
}

async function checkItem(item) {
  const payload = {
    product_id: item.product.product_id || item.product.id,
    variant_id: item.product.variant_id,
    quantity: item.quantity
  }
  try {
    const response = await validatePurchase([payload])
    return { state: 'available', validated: response.data.items[0] }
  } catch (error) {
    let failure = error
    if (error.code === STOREFRONT_ERROR.INSUFFICIENT_STOCK && item.quantity > 1) {
      try {
        const response = await validatePurchase([{ ...payload, quantity: 1 }])
        return { state: 'insufficient', validated: response.data.items[0] }
      } catch (singleError) {
        failure = singleError
      }
    }
    return { state: [400, 404, 409].includes(failure.status) ? 'unavailable' : 'unknown' }
  }
}

async function reconcileAvailability() {
  if (checkingAvailability.value) {
    needsRecheck = true
    return
  }
  if (!groupedItems.value.length) return
  checkingAvailability.value = true
  const snapshot = [...groupedItems.value]
  try {
    const results = await Promise.all(snapshot.map(checkItem))
    const next = { ...availability.value }
    const selected = new Set(selectedKeys.value)
    snapshot.forEach((item, index) => {
      const current = groupedItems.value.find((line) => line.key === item.key)
      if (!current || current.quantity !== item.quantity) return
      const result = results[index]
      next[item.key] = result.state
      if (result.state !== 'available') selected.delete(item.key)
      if (result.validated) emit('refresh-item', { key: item.key, validated: result.validated })
    })
    availability.value = next
    selectedKeys.value = selected
  } finally {
    checkingAvailability.value = false
    if (needsRecheck) {
      needsRecheck = false
      reconcileAvailability()
    }
  }
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') reconcileAvailability()
}

watch(groupedItems, (items, previous = []) => {
  const currentKeys = new Set(items.map((item) => item.key))
  const previousKeys = new Set(previous.map((item) => item.key))
  const next = new Set([...selectedKeys.value].filter((key) => currentKeys.has(key)))
  items.forEach((item) => {
    if (!previousKeys.has(item.key)) next.add(item.key)
  })
  selectedKeys.value = next
  availability.value = Object.fromEntries(
    Object.entries(availability.value).filter(([key]) => currentKeys.has(key))
  )
}, { immediate: true })

watch(
  () => groupedItems.value.map((item) => `${item.key}:${item.quantity}`).join('|'),
  () => reconcileAvailability()
)

onMounted(() => {
  reconcileAvailability()
  window.addEventListener('focus', reconcileAvailability)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  availabilityTimer = window.setInterval(reconcileAvailability, 30000)
})

onBeforeUnmount(() => {
  window.removeEventListener('focus', reconcileAvailability)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  window.clearInterval(availabilityTimer)
})
</script>

<template>
  <main class="cart-page basket-page">
    <section class="section basket-section">
      <header class="basket-heading">
        <h1>Cart</h1>
        <RouterLink :to="{ name: 'checkout' }">Saved checkouts</RouterLink>
        <span>{{ groupedItems.length }} items</span>
      </header>

      <div v-if="groupedItems.length" class="cart-page-layout basket-layout">
        <div class="basket-main">
          <div class="basket-columns">
            <label class="basket-columns__product">
              <input type="checkbox" :checked="allSelected" :disabled="!selectableItems.length" aria-label="Select all products" @change="toggleAll($event.target.checked)" />
              <span>Product</span>
            </label>
            <span>Unit price</span>
            <span>Quantity</span>
            <span>Total</span>
            <span>Actions</span>
          </div>

          <div class="cart-list basket-list">
            <section v-for="group in shopGroups" :key="group.key" class="cart-shop-group basket-shop">
              <header class="cart-shop-group__header basket-shop__header">
                <label class="basket-shop__select">
                  <input
                    type="checkbox"
                    :checked="groupSelected(group)"
                    :indeterminate="groupPartiallySelected(group)"
                    :disabled="!group.items.some(isSelectable)"
                    @change="toggleGroup(group, $event.target.checked)"
                  />
                  <RouterLink v-if="group.shop" :to="{ name: 'shop', params: { identifier: group.shop.identifier } }">{{ group.shop.name }}</RouterLink>
                  <strong v-else>Seller</strong>
                </label>
              </header>

              <article
                v-for="item in group.items"
                :key="item.key"
                class="basket-row"
                :class="{ 'basket-row--unavailable': !isSelectable(item) }"
              >
                <label class="basket-row__select">
                  <input
                    type="checkbox"
                    :checked="selectedKeys.has(item.key) && isSelectable(item)"
                    :disabled="!isSelectable(item)"
                    :aria-label="`Select ${item.product.name}`"
                    @change="toggleItem(item.key, $event.target.checked)"
                  />
                </label>
                <RouterLink class="basket-row__visual" :to="{ name: 'product-detail', params: { id: item.product.product_id || item.product.id } }">
                  <img v-if="absoluteImageUrl(item.product.image_url)" :src="absoluteImageUrl(item.product.image_url)" :alt="item.product.name" />
                  <span v-else>{{ item.product.tag || item.product.category }}</span>
                </RouterLink>
                <div class="basket-row__info">
                  <RouterLink :to="{ name: 'product-detail', params: { id: item.product.product_id || item.product.id } }"><h2>{{ item.product.name }}</h2></RouterLink>
                  <p v-if="item.product.option_values?.length">{{ item.product.option_values.map((option) => `${option.option_name}: ${option.value}`).join(' · ') }}</p>
                  <small v-if="!isSelectable(item)" class="basket-row__warning">{{ itemMessage(item) }}</small>
                </div>
                <strong class="basket-row__price">{{ formatCurrency(item.product.price) }}</strong>
                <div class="basket-row__quantity">
                  <div class="basket-stepper" :aria-label="`Quantity for ${item.product.name}`">
                    <button type="button" :disabled="item.quantity <= 1" :aria-label="`Decrease quantity of ${item.product.name}`" @click="emit('set-quantity', { key: item.key, quantity: item.quantity - 1 })">−</button>
                    <span>{{ item.quantity }}</span>
                    <button type="button" :disabled="!isSelectable(item) || item.quantity >= item.product.stock_quantity" :aria-label="`Increase quantity of ${item.product.name}`" @click="emit('set-quantity', { key: item.key, quantity: item.quantity + 1 })">+</button>
                  </div>
                </div>
                <strong class="basket-row__amount">{{ formatCurrency(Number(item.product.price) * item.quantity) }}</strong>
                <button class="basket-remove" type="button" :aria-label="`Remove ${item.product.name} from cart`" @click="emit('remove-line', item.key)">Remove</button>
              </article>
            </section>
          </div>
        </div>

        <aside class="basket-summary">
          <label class="basket-summary__select">
            <input type="checkbox" :checked="allSelected" :disabled="!selectableItems.length" @change="toggleAll($event.target.checked)" />
            <span>Select all</span>
          </label>
          <div class="basket-summary__total">
            <span>Selected total ({{ selectedQuantity }} items):</span>
            <strong>{{ formatCurrency(selectedTotal) }}</strong>
          </div>
          <button
            class="basket-checkout"
            type="button"
            :disabled="!selectedQuantity || preparingCheckout"
            @click="emit('begin-checkout', selectedItems.map((item) => item.key))"
          >{{ preparingCheckout ? 'Checking...' : 'Checkout' }}</button>
        </aside>
      </div>

      <div v-else class="catalog-empty basket-empty">
        <h3>Your cart is empty</h3>
        <p>Add a product to get started.</p>
        <RouterLink to="/products">Shop products</RouterLink>
      </div>
    </section>
  </main>
</template>

<style scoped>
.basket-page { background: var(--rs-page); }
.basket-section { padding-block: 30px 72px !important; }
.basket-heading { align-items: baseline; display: flex; gap: 14px; margin-bottom: 18px; }
.basket-heading h1 { color: var(--rs-text); font-size: clamp(1.7rem, 3vw, 2.15rem) !important; margin: 0 !important; }
.basket-heading span { color: var(--rs-muted); font-size: .83rem; }
.basket-layout { display: grid; gap: 12px; grid-template-columns: minmax(0, 1fr); }
.basket-main { min-width: 0; }
.basket-columns, .basket-row { display: grid; gap: 12px; grid-template-columns: 22px 84px minmax(190px, 1fr) 110px 108px 120px 64px; }
.basket-columns { align-items: center; background: var(--rs-surface); border: 1px solid var(--rs-border); border-radius: 6px; color: var(--rs-muted); font-size: .82rem; min-height: 56px; padding: 0 18px; text-align: center; }
.basket-columns__product { align-items: center; color: var(--rs-text); display: flex; font-weight: 750; gap: 18px; grid-column: 1 / 4; text-align: left; }
.basket-columns input, .basket-shop__select input, .basket-row__select input, .basket-summary__select input { accent-color: var(--rs-link); cursor: pointer; height: 18px; width: 18px; }
.basket-columns input:disabled, .basket-shop__select input:disabled, .basket-row__select input:disabled, .basket-summary__select input:disabled { cursor: not-allowed; }
.basket-list { gap: 12px; }
.basket-shop { background: var(--rs-surface); border: 1px solid var(--rs-border); border-radius: 6px; }
.basket-shop__header { background: var(--rs-surface); border-bottom: 1px solid var(--rs-border); min-height: 58px; padding: 0 18px; }
.basket-shop__select { align-items: center; display: flex; gap: 18px; }
.basket-shop__select a, .basket-shop__select strong { color: var(--rs-text); font-size: .9rem; font-weight: 750; text-decoration: none; }
.basket-shop__select a:hover { color: var(--rs-link); }
.basket-row { align-items: center; min-height: 116px; padding: 14px 18px; }
.basket-row + .basket-row { border-top: 1px solid var(--rs-border); }
.basket-row--unavailable { background: var(--rs-surface); }
.basket-row--unavailable .basket-row__visual, .basket-row--unavailable .basket-row__info > :not(.basket-row__warning), .basket-row--unavailable .basket-row__price, .basket-row--unavailable .basket-row__amount { opacity: .46; }
.basket-row__visual { align-items: center; aspect-ratio: 1; background: var(--rs-surface); border-radius: 4px; color: var(--rs-muted); display: flex; font-size: .7rem; justify-content: center; overflow: hidden; text-align: center; text-decoration: none; }
.basket-row__visual img { height: 100%; object-fit: cover; width: 100%; }
.basket-row__info { display: grid; gap: 4px; min-width: 0; }
.basket-row__info a { color: var(--rs-text); text-decoration: none; }
.basket-row__info a:hover { color: var(--rs-link); }
.basket-row__info h2 { font-size: .9rem; font-weight: 700; line-height: 1.4; margin: 0; }
.basket-row__info p { color: var(--rs-muted); font-size: .76rem; margin: 0; }
.basket-row__info .basket-row__warning { color: var(--rs-warning); font-size: .72rem; line-height: 1.35; margin-top: 4px; }
.basket-row__price, .basket-row__amount { color: var(--rs-text); font-size: .86rem; font-weight: 700; text-align: center; white-space: nowrap; }
.basket-row__amount { color: var(--rs-link); }
.basket-row__quantity { display: flex; justify-content: center; }
.basket-stepper { align-items: center; border: 1px solid var(--rs-border); border-radius: 4px; display: flex; height: 34px; overflow: hidden; }
.basket-stepper button { background: var(--rs-surface); border: 0; color: var(--rs-text); cursor: pointer; font-size: 1rem; height: 100%; width: 30px; }
.basket-stepper button:first-child { border-right: 1px solid var(--rs-border); }
.basket-stepper button:last-child { border-left: 1px solid var(--rs-border); }
.basket-stepper button:disabled { color: var(--rs-muted); cursor: not-allowed; }
.basket-stepper span { color: var(--rs-text); font-size: .83rem; min-width: 34px; text-align: center; }
.basket-remove { background: transparent; border: 0; color: var(--rs-muted); cursor: pointer; font-size: .8rem; padding: 6px; }
.basket-remove:hover { color: var(--rs-error); }
.basket-summary { align-items: center; background: var(--rs-surface); border: 1px solid var(--rs-border); border-radius: 6px; color: var(--rs-text); display: flex; gap: 26px; justify-content: flex-end; min-height: 84px; padding: 12px 22px; }
.basket-summary__select { align-items: center; display: flex; font-size: .83rem; gap: 10px; margin-right: auto; white-space: nowrap; }
.basket-summary__total { align-items: baseline; display: flex; gap: 11px; }
.basket-summary__total span { color: var(--rs-muted); font-size: .84rem; white-space: nowrap; }
.basket-summary__total strong { color: var(--rs-link); font-size: 1.4rem; white-space: nowrap; }
.basket-checkout { background: var(--rs-primary); border: 0; border-radius: 4px; color: var(--rs-on-primary); font-size: .9rem; font-weight: 800; min-height: 44px; min-width: 145px; }
.basket-checkout:disabled { cursor: not-allowed; opacity: .62; }
.basket-empty { max-width: 540px; }
@media (max-width: 1000px) {
  .basket-columns { display: none; }
  .basket-row { gap: 9px 12px; grid-template-columns: 20px 78px minmax(0, 1fr) auto; }
  .basket-row__select { grid-column: 1; grid-row: 1 / 4; }
  .basket-row__visual { grid-column: 2; grid-row: 1 / 4; }
  .basket-row__info { grid-column: 3 / 5; grid-row: 1; }
  .basket-row__price { grid-column: 3; grid-row: 2; text-align: left; }
  .basket-row__amount { grid-column: 4; grid-row: 2; text-align: right; }
  .basket-row__quantity { grid-column: 3; grid-row: 3; justify-content: flex-start; }
  .basket-remove { grid-column: 4; grid-row: 3; justify-self: end; }
}
@media (max-width: 650px) {
  .basket-row { grid-template-columns: 18px 66px minmax(0, 1fr) auto; padding: 12px; }
  .basket-row__info h2 { font-size: .84rem; }
  .basket-row__price, .basket-row__amount { font-size: .75rem; }
  .basket-summary { align-items: stretch; flex-wrap: wrap; gap: 12px; }
  .basket-summary__select { margin-right: 0; }
  .basket-summary__total { justify-content: flex-end; margin-left: auto; }
  .basket-summary__total span { font-size: .75rem; }
  .basket-summary__total strong { font-size: 1.15rem; }
  .basket-checkout { width: 100%; }
}
</style>
