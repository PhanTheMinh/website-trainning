<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { formatCurrency } from '../data/catalog.js'
import { API_BASE_URL } from '../services/apiClient.js'
import { getCheckoutDraft, saveCheckoutDraft, listCheckouts } from '../services/checkoutService.js'
import { createOrder } from '../services/orderService.js'
import { normalizeCheckoutAddress } from '../utils/checkoutAddress.js'
import BackButton from '../components/BackButton.vue'
import { getCheckoutRegions, getCheckoutCountry, getCheckoutProvince, getCheckoutCities } from '../utils/checkoutRegions.js'

const props = defineProps({ currentUser: { type: Object, default: null }, sessionLoading: Boolean,
  cartItems: { type: Array, default: () => [] } })
const emit = defineEmits(['open-auth', 'order-created'])
const route = useRoute()
const router = useRouter()
const placingOrder = ref(false)
const uncertainOrder = ref(false)
const orderMessage = ref('')
const hasOrders = ref(false)
let orderAttempt = null
let orderCartSnapshot = []
const checkoutItems = ref([])
const address = ref(normalizeCheckoutAddress())
const selectedRates = ref({})
const paymentOptions = ref([])
const selectedPaymentId = ref(null)
const paymentIssue = ref('')
const paymentNotice = ref('')
const destinations = ref([])
const shippingGroups = ref([])
const expandedShops = ref(new Set())
const loadingDestinations = ref(false)
const loadingShipping = ref(false)
const shippingError = ref('')
const error = ref('')
const status = ref('')
const ready = ref(false)
const completed = ref(false)
const drafts = ref([])
const page = ref(1)
const count = ref(0)
const total = ref({})
let scope = null
let timer
let hydrating = false
const cityOptions = ref([])
const loadingCities = ref(false)
const locationError = ref('')
const manualCity = ref(false)
const manualZip = ref(false)
const failedImages = ref(new Set())
let locationRequest = 0
const cityNames = computed(() => [...new Set(cityOptions.value.map(city => city.name))])
const zipOptions = computed(() => [...new Set(cityOptions.value
  .filter(city => city.name === address.value.city).flatMap(city => city.zip_codes || []))].sort())
const citySelection = computed({
  get: () => manualCity.value || (address.value.city && !cityNames.value.includes(address.value.city)) ? '__manual__' : address.value.city,
  set: value => {
    manualCity.value = value === '__manual__'
    if (!manualCity.value) address.value.city = value
  }
})
const zipSelection = computed({
  get: () => manualZip.value || (address.value.zip_code && !zipOptions.value.includes(address.value.zip_code)) ? '__manual__' : address.value.zip_code,
  set: value => {
    manualZip.value = value === '__manual__'
    if (!manualZip.value) address.value.zip_code = value
  }
})
function provinceLabel(name) {
  const code = getCheckoutProvince(address.value.country_code, name)?.code
  return code ? `${name} - ${code}` : name
}
function countryLabel(country) {
  return `${getCheckoutCountry(country.country_code)?.name || country.name} - ${country.country_code}`
}
async function loadCities(autoFill = false) {
  const requestId = ++locationRequest
  cityOptions.value = []
  locationError.value = ''
  loadingCities.value = true
  try {
    const cities = await getCheckoutCities(address.value.country_code, address.value.province_state)
    if (requestId !== locationRequest) return
    cityOptions.value = cities
    if (autoFill && !address.value.city && cityNames.value.length === 1) address.value.city = cityNames.value[0]
    if (autoFill && !address.value.zip_code && zipOptions.value.length === 1) address.value.zip_code = zipOptions.value[0]
    if (autoFill) flush()
  } catch (failure) {
    if (requestId === locationRequest) locationError.value = failure.message
  } finally {
    if (requestId === locationRequest) loadingCities.value = false
  }
}

const provinceOptions = computed(() => getCheckoutRegions(address.value.country_code))
const hasLegacyProvince = computed(() => address.value.province_state &&
  !provinceOptions.value.includes(address.value.province_state))

watch(() => address.value.country_code, (country, previous) => {
  if (!hydrating && ready.value && country !== previous) {
    manualCity.value = false
    manualZip.value = false
    address.value.country_name = getCheckoutCountry(country)?.name || ''
    address.value.province_state = ''
    address.value.province_code = ''
    address.value.city = ''
    address.value.street = ''
    address.value.zip_code = ''
    selectedRates.value = {}
  }
}, { flush: 'sync' })
watch(() => address.value.province_state, (province, previous) => {
  if (!hydrating && ready.value && province !== previous) {
    manualCity.value = false
    manualZip.value = false
    address.value.province_code = getCheckoutProvince(address.value.country_code, province)?.code || ''
    address.value.city = ''
    address.value.street = ''
    address.value.zip_code = ''
  }
}, { flush: 'sync' })
watch(() => address.value.city, (city, previous) => {
  if (!hydrating && ready.value && city !== previous) {
    address.value.street = ''
    manualZip.value = false
    address.value.zip_code = zipOptions.value.length === 1 ? zipOptions.value[0] : ''
  }
}, { flush: 'sync' })
watch([() => address.value.country_code, () => address.value.province_state], () => {
  loadCities(!hydrating && ready.value)
}, { flush: 'sync' })

const shopGroups = computed(() => {
  const groups = new Map()
  for (const item of checkoutItems.value) {
    const group = groups.get(item.shop_id) || { shop_id: item.shop_id, shop_name: item.shop?.name || 'Seller', items: [] }
    group.items.push(item)
    groups.set(item.shop_id, group)
  }
  return [...groups.values()]
})
const itemQuantity = computed(() => checkoutItems.value.reduce((sum, item) => sum + item.quantity, 0))
const itemTotal = computed(() => {
  if (!checkoutItems.value.length || checkoutItems.value.some(item => !Number.isFinite(Number(item.price ?? item.unit_price)))) return total.value.subtotal
  return checkoutItems.value.reduce((sum, item) => sum + Math.round(Number(item.price ?? item.unit_price) * 100) * item.quantity, 0) / 100
})
const shippingTotal = computed(() => {
  if (!shippingGroups.value.length) return total.value.shipping_fee
  const selected = shippingGroups.value.map(group => selectedForShop(group.shop_id))
  return selected.every(Boolean) ? selected.reduce((sum, option) => sum + Math.round(Number(option.fixed_fee) * 100), 0) / 100 : null
})
const orderTotal = computed(() => itemTotal.value != null && shippingTotal.value != null
  ? (Math.round(itemTotal.value * 100) + Math.round(shippingTotal.value * 100)) / 100 : null)
const shippingReady = computed(() => orderTotal.value != null)
function absoluteImageUrl(value) {
  try {
    if (!value) return ''
    const path = value.replace(/\\/g, '/').replace(/^(?:\/?src\/)?uploads\//, '/uploads/')
    const url = new URL(path, API_BASE_URL)
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : ''
  } catch { return '' }
}
function imageFor(item) {
  return [item.image_url, ...(item.image_urls || [])].map(absoluteImageUrl).find(url => url && !failedImages.value.has(url)) || ''
}
function imageFailed(item) {
  failedImages.value = new Set([...failedImages.value, imageFor(item)])
}
function selectedForShop(id) {
  return shippingGroups.value.find(group => group.shop_id === id)?.options.find(option => option.rate_id === selectedRates.value[id]) || null
}
function deliveryLabel(option) { return `${option.min_delivery_days}–${option.max_delivery_days} days` }
function toggleShipping(id) {
  const next = new Set(expandedShops.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedShops.value = next
}
function chooseShipping(id, rateId) {
  selectedRates.value = { ...selectedRates.value, [id]: rateId }
  flush()
}
function applyResult(data, form = false) {
  if (scope) scope.savedItems = JSON.stringify(data.items.map(({ product_id, variant_id, quantity }) => ({ product_id, variant_id, quantity })))
  checkoutItems.value = data.items
  destinations.value = data.destinations
  shippingGroups.value = data.shipping
  paymentOptions.value = data.payment_options || []
  paymentIssue.value = data.payment_issue || ''
  total.value = data.total
  shippingError.value = data.issues.join(' ')
  completed.value = data.is_completed
  hasOrders.value = Boolean(data.order_ids?.length) || hasOrders.value
  if (form) {
    hydrating = true
    address.value = normalizeCheckoutAddress(data.shipping_address)
    selectedRates.value = data.shipping_selections
    selectedPaymentId.value = data.payment_selection?.id || null
    hydrating = false
    loadCities(false)
  }
}
function backup(s) {
  try {
    if (s.pending) localStorage.setItem(s.key, JSON.stringify({ version: s.version, data: s.pending }))
    else localStorage.removeItem(s.key)
  } catch { /* The server remains the primary store when local storage is unavailable. */ }
}
async function flush(keepalive = false) {
  clearTimeout(timer)
  const s = scope
  if (!s || !ready.value || s.blocked || completed.value) return !s?.pending
  if (s.flight) {
    await s.flight
    if (scope !== s || s.blocked) return false
    return s.pending ? flush(keepalive) : !error.value
  }
  if (!s.pending) return true
  const pending = s.pending
  s.pending = null
  status.value = 'Saving…'
  s.flight = (async () => {
    try {
      const response = await saveCheckoutDraft(s.token, { version: s.version, ...pending }, { keepalive })
      s.version = response.data.version
      s.savedItems = JSON.stringify(response.data.items.map(({ product_id, variant_id, quantity }) => ({ product_id, variant_id, quantity })))
      if (scope !== s) return
      error.value = ''
      if (!s.pending) { applyResult(response.data); status.value = 'Saved' }
      backup(s)
    } catch (failure) {
      s.pending = s.pending || pending
      backup(s)
      if (scope !== s) return
      if (failure.code === 'PAYMENT_METHOD_UNAVAILABLE') {
        try {
          const latest = await getCheckoutDraft(s.token)
          if (scope !== s) return
          paymentOptions.value = latest.data.payment_options || []
          if (latest.data.version === s.version && !latest.data.is_completed) {
            hydrating = true
            selectedPaymentId.value = null
            hydrating = false
            s.pending.payment_method_id = null
            paymentNotice.value = 'Your previous payment method is no longer available. Your other changes are preserved. Please choose an available method.'
            error.value = ''
            backup(s)
            return
          }
          s.blocked = true
          status.value = 'Not saved'
          error.value = 'Checkout changed in another tab. Reload saved data before continuing.'
          return
        } catch { /* Keep the pending backup and let the customer retry. */ }
      }
      s.blocked = (failure.status === 409 && (!failure.code || ['CHECKOUT_CONFLICT', 'CHECKOUT_COMPLETED'].includes(failure.code))) || [401, 403, 404].includes(failure.status)
      status.value = 'Not saved'
      error.value = failure.message || 'Could not save checkout. Retry when online.'
    } finally { s.flight = null }
  })()
  await s.flight
  if (scope !== s || error.value) return false
  return s.pending ? flush(keepalive) : true
}
function queueSave() {
  if (hydrating || !ready.value || !scope || completed.value || uncertainOrder.value) return
  const items = checkoutItems.value.map(({ product_id, variant_id, quantity }) => ({ product_id, variant_id, quantity }))
  scope.pending = { shipping_address: { ...address.value }, shipping_selections: { ...selectedRates.value },
    payment_method_id: selectedPaymentId.value,
    ...(items.length && JSON.stringify(items) !== scope.savedItems ? { items } : {}) }
  backup(scope)
  status.value = 'Not saved'
  clearTimeout(timer)
  timer = setTimeout(() => flush(), 400)
}
watch([address, selectedRates, selectedPaymentId], queueSave, { deep: true, flush: 'sync' })

function visibleQuote() {
  return JSON.stringify({ items: checkoutItems.value.map(item => [item.variant_id, item.quantity, item.price]),
    shipping: shopGroups.value.map(group => selectedForShop(group.shop_id)), total: orderTotal.value })
}
async function placeOrder() {
  if (placingOrder.value || completed.value || !scope || scope.blocked) return
  placingOrder.value = true
  orderMessage.value = ''
  const s = scope
  const attemptKey = `runstore-order-request:${s.userId}:${s.token}`
  try {
    if (!uncertainOrder.value) {
      const displayed = visibleQuote()
      if (!await flush() || scope !== s) return
      if (displayed !== visibleQuote()) {
        orderMessage.value = 'Prices or shipping changed. Review the updated total, then click Checkout again.'
        return
      }
      if (!shippingReady.value || !selectedPaymentId.value) {
        orderMessage.value = 'Choose shipping for every shop and a payment method before checkout.'
        return
      }
      let stored
      try { stored = JSON.parse(localStorage.getItem(attemptKey) || 'null') } catch { /* Use a new key. */ }
      orderAttempt = { checkout_token: s.token, version: s.version, request_id: stored?.request_id || crypto.randomUUID() }
      orderCartSnapshot = [...props.cartItems]
      try { localStorage.setItem(attemptKey, JSON.stringify(orderAttempt)) } catch { /* In-memory retries remain safe. */ }
    }
    const response = await createOrder(orderAttempt)
    if (scope !== s) return
    completed.value = true
    hasOrders.value = true
    uncertainOrder.value = false
    s.pending = null
    backup(s)
    try { localStorage.removeItem(attemptKey) } catch { /* Successful server state is authoritative. */ }
    emit('order-created', { cartSnapshot: orderCartSnapshot,
      items: response.data.orders.flatMap(order => order.items.map(item => ({
        product_id: item.product_id, variant_id: item.product_variant_id, quantity: item.quantity }))) })
    await router.push({ name: 'checkout-orders', params: { checkoutToken: s.token } })
  } catch (failure) {
    if (scope !== s) return
    if (completed.value) {
      orderMessage.value = 'Your orders were created. Use View your orders to open the details.'
      return
    }
    if (failure.status && failure.status < 500) {
      uncertainOrder.value = false
      try { localStorage.removeItem(attemptKey) } catch { /* No retained ambiguous request. */ }
    }
    if (failure.code === 'ORDER_REQUOTE_REQUIRED') {
      orderMessage.value = 'Prices or shipping changed. No order was created. Review the updated quote, then click Checkout again.'
      try {
        const latest = await getCheckoutDraft(s.token)
        if (scope !== s) return
        s.version = latest.data.version
        applyResult(latest.data, true)
        queueSave()
        await flush()
      } catch { orderMessage.value += ' Could not refresh the quote. Reload before continuing.'; s.blocked = true }
    } else if (!failure.status || failure.status >= 500) {
      uncertainOrder.value = true
      orderMessage.value = 'We could not confirm the result. Retry safely with the same request; do not start a new checkout.'
    } else {
      uncertainOrder.value = false
      orderMessage.value = failure.message || 'Could not create your order.'
      if (failure.code === 'CHECKOUT_CONFLICT') s.blocked = true
      if (['PAYMENT_METHOD_UNAVAILABLE', 'SHIPPING_METHOD_UNAVAILABLE', 'INSUFFICIENT_STOCK', 'VARIANT_UNAVAILABLE', 'PRODUCT_STOPPED'].includes(failure.code)) {
        try {
          const latest = await getCheckoutDraft(s.token)
          if (scope === s) { s.version = latest.data.version; applyResult(latest.data, true) }
        } catch { orderMessage.value += ' Reload to refresh checkout availability.' }
      }
    }
  } finally { placingOrder.value = false }
}

async function load(discard = false) {
  manualCity.value = false
  manualZip.value = false
  locationRequest++
  cityOptions.value = []
  locationError.value = ''
  clearTimeout(timer)
  ready.value = false
  const s = { userId: props.currentUser?.id, token: route.params.checkoutToken, pending: null, version: 1, blocked: false }
  scope = s
  uncertainOrder.value = false
  orderAttempt = null
  orderCartSnapshot = []
  orderMessage.value = ''
  hasOrders.value = false
  error.value = ''
  status.value = ''
  paymentNotice.value = ''
  checkoutItems.value = []
  drafts.value = []
  loadingDestinations.value = false
  if (props.sessionLoading || !s.userId) return
  loadingDestinations.value = true
  try {
    if (!s.token) {
      const response = await listCheckouts(page.value)
      if (scope !== s) return
      drafts.value = response.data.items
      count.value = response.data.count
      return
    }
    const response = await getCheckoutDraft(s.token)
    if (scope !== s) return
    s.version = response.data.version
    s.key = `runstore-checkout-pending:${s.userId}:${s.token}`
    applyResult(response.data, true)
    ready.value = true
    status.value = 'Saved'
    try {
      const attempt = JSON.parse(localStorage.getItem(`runstore-order-request:${s.userId}:${s.token}`) || 'null')
      if (attempt && !completed.value) { orderAttempt = attempt; uncertainOrder.value = true }
    } catch { /* No recoverable order attempt. */ }
    if (discard) localStorage.removeItem(s.key)
    let saved
    try { saved = JSON.parse(localStorage.getItem(s.key) || 'null') } catch { /* No local backup. */ }
    if (saved && !completed.value) {
      hydrating = true
      address.value = normalizeCheckoutAddress(saved.data.shipping_address)
      selectedRates.value = saved.data.shipping_selections || {}
      selectedPaymentId.value = saved.data.payment_method_id || null
      hydrating = false
      s.pending = saved.data
      status.value = 'Not saved'
      if (saved.version !== s.version) {
        s.blocked = true
        error.value = 'A local edit conflicts with a newer server version. Your local text is shown. Reload saved data to discard it.'
      } else await flush()
    }
  } catch (failure) {
    if (scope === s) error.value = failure.message || 'Could not load checkout.'
  } finally {
    if (scope === s) loadingDestinations.value = false
  }
}
watch([() => props.currentUser?.id, () => props.sessionLoading, () => route.params.checkoutToken, page], () => load(), { immediate: true })
onBeforeRouteLeave(() => placingOrder.value && !completed.value ? false : flush())
onBeforeRouteUpdate(() => placingOrder.value && !completed.value ? false : flush())
function leavingPage() { if (document.visibilityState === 'hidden') flush(true) }
function beforeUnload(event) {
  if (scope?.pending || scope?.flight || placingOrder.value || uncertainOrder.value) { event.preventDefault(); event.returnValue = '' }
}
document.addEventListener('visibilitychange', leavingPage)
window.addEventListener('beforeunload', beforeUnload)
onBeforeUnmount(() => {
  locationRequest++
  clearTimeout(timer)
  scope = null
  document.removeEventListener('visibilitychange', leavingPage)
  window.removeEventListener('beforeunload', beforeUnload)
})
</script>

<template>
  <main class="checkout-page">
    <section class="section checkout-section">
      <div class="checkout-heading">
        <div class="checkout-heading__title"><BackButton :fallback="{ name: 'cart' }" /><h1>Checkout</h1></div>
        <span>{{ itemQuantity }} items</span>
      </div>

      <p v-if="sessionLoading || loadingDestinations" role="status">Loading checkout…</p>
      <p v-else-if="!currentUser"><button type="button" @click="$emit('open-auth')">Sign in to view your checkouts</button></p>
      <p v-if="completed" role="status">Completed checkout. <RouterLink v-if="hasOrders" :to="{ name: 'checkout-orders', params: { checkoutToken: route.params.checkoutToken } }">View your orders</RouterLink></p>
      <p v-if="orderMessage" role="alert">{{ orderMessage }}</p>
      <button v-if="uncertainOrder && ready" type="button" :disabled="placingOrder" @click="placeOrder">{{ placingOrder ? 'Checking order…' : 'Retry order safely' }}</button>
      <div v-if="error && !uncertainOrder" role="alert" class="checkout-card">
        <p>{{ error }}</p>
        <button v-if="ready && !scope?.blocked" type="button" @click="flush()">Retry save</button>
        <button type="button" @click="load(true)">Reload saved data (discard local edits)</button>
      </div>
      <div v-if="currentUser && !route.params.checkoutToken" class="checkout-card">
        <h2>Saved checkouts</h2>
        <p v-for="draft in drafts" :key="draft.token">
          <RouterLink :to="{ name: 'checkout', params: { checkoutToken: draft.token } }">{{ draft.item_count }} items · {{ new Date(draft.updated_at).toLocaleString() }} · {{ draft.token }}</RouterLink>
        </p>
        <p v-if="!drafts.length && !loadingDestinations">No saved checkouts.</p>
        <button :disabled="page === 1" @click="page--">Previous</button>
        <button :disabled="page * 10 >= count" @click="page++">Next</button>
      </div>
      <div v-else-if="ready && !checkoutItems.length" class="checkout-empty">
        <h2>No items selected for checkout</h2>
        <BackButton :fallback="{ name: 'cart' }" />
      </div>

      <div v-else-if="ready && checkoutItems.length" class="checkout-layout" :inert="completed || placingOrder || uncertainOrder" @focusout="flush()" @change="flush()">
        <div class="checkout-content">
          <section class="checkout-card" aria-labelledby="address-title">
            <h2 id="address-title">Address</h2>
            <form class="checkout-address" @submit.prevent>
              <label><span>Email *</span><input v-model="address.email" type="email" autocomplete="email" maxlength="254" placeholder="Email" required /></label>
              <label><span>Phone *</span><input v-model="address.phone" type="tel" autocomplete="tel" maxlength="30" placeholder="Phone" required /></label>
              <label><span>First Name *</span><input v-model="address.first_name" autocomplete="given-name" maxlength="100" placeholder="First Name" required /></label>
              <label><span>Last Name *</span><input v-model="address.last_name" autocomplete="family-name" maxlength="100" placeholder="Last Name" required /></label>
              <label><span>Country *</span>
                <select v-model="address.country_code" :disabled="loadingDestinations || !destinations.length" required>
                  <option value="" disabled>Select a country</option>
                  <option v-for="country in destinations" :key="country.country_code" :value="country.country_code">{{ countryLabel(country) }}</option>
                </select>
              </label>
              <label><span>Province/State{{ provinceOptions.length ? ' *' : '' }}</span>
                <select v-model="address.province_state" autocomplete="address-level1"
                  :disabled="!address.country_code || (!provinceOptions.length && !hasLegacyProvince)" required>
                  <option value="" disabled>{{ !address.country_code ? 'Select a country first' : provinceOptions.length ? 'Select a province/state' : 'No provinces/states available' }}</option>
                  <option v-if="hasLegacyProvince" :value="address.province_state" disabled>{{ address.province_state }} (saved)</option>
                  <option v-for="province in provinceOptions" :key="province" :value="province">{{ provinceLabel(province) }}</option>
                </select>
              </label>
              <label><span>City *</span>
                <select v-model="citySelection" :disabled="loadingCities || !address.country_code" autocomplete="address-level2" required>
                  <option value="" disabled>{{ loadingCities ? 'Loading cities…' : 'Select a city' }}</option>
                  <option v-for="city in cityNames" :key="city" :value="city">{{ city }}</option>
                  <option value="__manual__">Enter city manually…</option>
                </select>
                <input v-if="citySelection === '__manual__'" v-model="address.city" autocomplete="address-level2" maxlength="100" placeholder="Enter city" required />
              </label>
              <label><span>Zip Code</span>
                <select v-model="zipSelection" :disabled="!address.city || loadingCities" autocomplete="postal-code">
                  <option value="" disabled>Select a Zip Code</option>
                  <option v-for="zip in zipOptions" :key="zip" :value="zip">{{ zip }}</option>
                  <option value="__manual__">Enter Zip Code manually…</option>
                </select>
                <input v-if="zipSelection === '__manual__'" v-model="address.zip_code" type="text" autocomplete="postal-code" maxlength="20" placeholder="Enter Zip Code" />
              </label>
            </form>
            <p v-if="locationError" role="alert">{{ locationError }} <button type="button" @click="loadCities(true)">Retry</button></p>
            <div class="checkout-address-sources"><small>Address data: <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a>, <a href="https://github.com/open-admin-data/vietnam-administrative-divisions" target="_blank" rel="noreferrer">Open Admin Data</a>.</small></div>
          </section>

          <section class="checkout-card" aria-labelledby="shipping-title">
            <h2 id="shipping-title">Shipping method</h2>
            <div v-if="shippingError" class="checkout-shipping-state checkout-shipping-state--error" role="status">{{ shippingError }}</div>
            <div v-if="loadingDestinations || loadingShipping" class="checkout-shipping-state" role="status">Loading shipping methods...</div>
            <div v-else-if="!destinations.length" class="checkout-shipping-state">No shared shipping destination is available for the selected shops.</div>
            <div v-else v-for="group in shopGroups" :key="group.shop_id" class="checkout-shipping-shop">
              <h3>{{ group.shop_name }}</h3>
              <template v-if="shippingGroups.find(item => item.shop_id === group.shop_id)?.options.length">
                <div v-if="selectedForShop(group.shop_id)" class="checkout-shipping-selected">
                  <div><strong>{{ selectedForShop(group.shop_id).name }}</strong><small>Estimated delivery: {{ deliveryLabel(selectedForShop(group.shop_id)) }}</small></div>
                  <strong>{{ formatCurrency(selectedForShop(group.shop_id).fixed_fee) }}</strong>
                  <button type="button" :aria-expanded="expandedShops.has(group.shop_id)" @click="toggleShipping(group.shop_id)">{{ expandedShops.has(group.shop_id) ? 'Close' : 'Change' }}</button>
                </div>
                <div v-if="!selectedForShop(group.shop_id) || expandedShops.has(group.shop_id)" class="checkout-shipping-options">
                  <label v-for="option in shippingGroups.find((item) => item.shop_id === group.shop_id)?.options || []" :key="option.rate_id">
                    <input type="radio" :name="`shipping-${group.shop_id}`" :checked="selectedRates[group.shop_id] === option.rate_id" @change="chooseShipping(group.shop_id, option.rate_id)" />
                    <span><strong>{{ option.name }}</strong><small>{{ deliveryLabel(option) }}</small></span>
                    <b>{{ formatCurrency(option.fixed_fee) }}</b>
                  </label>
                </div>
              </template>
              <p v-else>This shop does not ship to the selected country.</p>
            </div>
          </section>

          <section class="checkout-card" aria-labelledby="payment-title">
            <h2 id="payment-title">Payment method</h2>
            <p v-if="paymentNotice" class="checkout-payment-state" role="status">{{ paymentNotice }}</p>
            <p v-if="paymentIssue" class="checkout-payment-state checkout-payment-state--error" role="alert">{{ paymentIssue }}</p>
            <div v-if="paymentOptions.length" class="checkout-payment-options">
              <label v-for="option in paymentOptions" :key="option.id">
                <input v-model="selectedPaymentId" type="radio" name="payment-method" :value="option.id" />
                <span>
                  <strong>{{ option.name }}</strong>
                  <small v-if="option.payment_data.description">{{ option.payment_data.description }}</small>
                  <small v-if="option.payment_data.instructions">{{ option.payment_data.instructions }}</small>
                  <template v-if="option.shop_details?.length > 1">
                    <small v-for="shop in option.shop_details" :key="shop.shop_id"><strong>{{ shop.shop_name }}</strong> — {{ shop.name }}<br />{{ shop.description }}<br v-if="shop.description && shop.instructions" />{{ shop.instructions }}</small>
                  </template>
                </span>
                <b>COD</b>
              </label>
            </div>
            <p v-else class="checkout-payment-state">COD is not available for every shop in this checkout.</p>
          </section>
        </div>

        <aside class="checkout-card checkout-summary" aria-labelledby="summary-title">
          <h2 id="summary-title">Order summary</h2>
          <div v-for="group in shopGroups" :key="group.shop_id" class="checkout-summary__shop">
            <h3>{{ group.shop_name }}</h3>
            <div v-for="item in group.items" :key="item.key" class="checkout-summary__product">
              <div class="checkout-summary__product-image"><img v-if="imageFor(item)" :src="imageFor(item)" :alt="item.name" @error="imageFailed(item)" /><span v-else>{{ item.category || 'No image' }}</span></div>
              <span>{{ item.name }}
                <small class="checkout-summary__quantity">Quantity: {{ item.quantity }}</small>
              </span><strong>{{ formatCurrency(Number(item.price) * Number(item.quantity)) }}</strong>
            </div>
            <div class="checkout-summary__line"><span>Shipping fee</span><strong>{{ selectedForShop(group.shop_id) ? formatCurrency(selectedForShop(group.shop_id).fixed_fee) : '—' }}</strong></div>
          </div>
          <div class="checkout-summary__subtotal"><span>Items subtotal</span><strong>{{ itemTotal == null ? '—' : formatCurrency(itemTotal) }}</strong></div>
          <div class="checkout-summary__subtotal"><span>Total shipping</span><strong>{{ shippingReady ? formatCurrency(shippingTotal) : '—' }}</strong></div>
          <div class="checkout-summary__total"><span>Order total</span><strong>{{ shippingReady ? formatCurrency(orderTotal) : '—' }}</strong></div>
          <button class="checkout-submit" type="button" :disabled="placingOrder || !shippingReady || !selectedPaymentId || scope?.blocked" @click="placeOrder">{{ placingOrder ? 'Creating order…' : 'Checkout' }}</button>
          <small>Prices, stock and shipping are verified again before your order is created. COD payment is due on delivery.</small>
        </aside>
      </div>
    </section>
  </main>
</template>

<style scoped>
.checkout-page { background: var(--rs-page); min-height: calc(100vh - 80px); }
.checkout-submit { width: 100%; margin-block: 18px 10px; padding: 13px; border: 0; border-radius: 6px; background: var(--rs-link); color: var(--rs-surface); font-weight: 800; cursor: pointer; }
.checkout-submit:disabled { opacity: .5; cursor: not-allowed; }
.checkout-summary > small { display: block; color: var(--rs-muted); line-height: 1.5; }
.checkout-section { padding-block: 30px 72px; }
.checkout-heading { align-items: center; display: flex; gap: 12px; justify-content: space-between; margin-bottom: 18px; }
.checkout-heading__title { align-items: center; display: flex; flex-wrap: wrap; gap: 8px 14px; min-width: 0; }
.checkout-heading a { color: var(--rs-muted); font-size: .8rem; text-decoration: none; }
.checkout-heading h1 { color: var(--rs-text); font-size: clamp(1.3rem, 2.4vw, 1.8rem); line-height: 1.2; margin: 0; white-space: nowrap; }
.checkout-heading > span { color: var(--rs-muted); flex-shrink: 0; font-size: .82rem; }
.checkout-layout { align-items: start; display: grid; gap: 18px; grid-template-columns: minmax(0, 1fr) 330px; }
.checkout-content { display: grid; gap: 16px; min-width: 0; }
.checkout-card, .checkout-empty { background: var(--rs-surface); border: 1px solid var(--rs-border); border-radius: 9px; padding: 20px; }
.checkout-card h2 { color: var(--rs-text); font-size: 1.05rem; margin: 0 0 16px; }
.checkout-card h3 { color: var(--rs-muted); font-size: .84rem; margin: 0; }
.checkout-address { display: grid; align-items: start; gap: 16px; grid-template-columns: repeat(2, minmax(0, 1fr)); font-size: 14px; }
.checkout-address__column { display: grid; gap: 13px; min-width: 0; }
.checkout-address label { display: grid; align-content: start; gap: 6px; min-width: 0; }
.checkout-address label span { color: var(--rs-muted); font-size: 12px; font-weight: 600; line-height: 20px; min-height: 20px; }
.checkout-address input, .checkout-address select { background: var(--rs-surface); border: 1px solid var(--rs-border); border-radius: 6px; box-sizing: border-box; color: var(--rs-text); height: 42px; min-height: 42px; margin: 0; padding: 10px 11px; width: 100%; min-width: 0; font: inherit; line-height: 20px; }
.checkout-address-sources { margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--rs-border); display: grid; gap: 4px; color: var(--rs-muted); }
.checkout-address-sources small { font-size: 11px; line-height: 1.5; }
.checkout-address-sources a { color: var(--rs-link); }
.checkout-card__title { align-items: center; display: flex; justify-content: space-between; }
.checkout-card__title a { color: var(--rs-link); font-size: .78rem; font-weight: 750; text-decoration: none; }
.checkout-shop + .checkout-shop { border-top: 1px solid var(--rs-border); margin-top: 17px; padding-top: 17px; }
.checkout-shop h3 { background: var(--rs-surface); border-radius: 5px; padding: 9px 10px; }
.checkout-product { align-items: center; border-bottom: 1px solid var(--rs-border); display: grid; gap: 12px; grid-template-columns: 58px minmax(0, 1fr) auto auto; padding: 12px 0; }
.checkout-product:last-child { border-bottom: 0; }
.checkout-product__visual { align-items: center; aspect-ratio: 1; background: var(--rs-surface); border-radius: 5px; color: var(--rs-muted); display: flex; font-size: .68rem; justify-content: center; overflow: hidden; text-align: center; }
.checkout-product__visual img { height: 100%; object-fit: cover; width: 100%; }
.checkout-product__name { display: grid; gap: 3px; min-width: 0; }
.checkout-product__name strong { color: var(--rs-text); font-size: .85rem; line-height: 1.35; }
.checkout-product__name small { color: var(--rs-muted); font-size: .72rem; }
.checkout-product__price { color: var(--rs-muted); font-size: .78rem; white-space: nowrap; }
.checkout-product__amount { color: var(--rs-text); font-size: .82rem; white-space: nowrap; }
.checkout-shipping-shop { border-top: 1px solid var(--rs-border); padding-block: 13px; }
.checkout-shipping-shop h3 { margin-bottom: 10px; }
.checkout-shipping-shop > p, .checkout-shipping-state { color: var(--rs-link); font-size: .78rem; margin: 0; }
.checkout-shipping-selected { align-items: center; display: grid; gap: 12px; grid-template-columns: minmax(0, 1fr) auto auto; }
.checkout-shipping-selected div { display: grid; gap: 3px; }
.checkout-shipping-selected div strong { color: var(--rs-text); font-size: .85rem; }
.checkout-shipping-selected small { color: var(--rs-muted); font-size: .72rem; }
.checkout-shipping-selected > strong { color: var(--rs-text); font-size: .84rem; }
.checkout-shipping-selected button { background: transparent; border: 0; color: var(--rs-link); cursor: pointer; font-size: .78rem; font-weight: 800; padding: 5px; }
.checkout-shipping-options { border: 1px solid var(--rs-border); border-radius: 7px; display: grid; margin-top: 11px; overflow: hidden; }
.checkout-shipping-options label { align-items: center; cursor: pointer; display: grid; gap: 10px; grid-template-columns: 18px minmax(0, 1fr) auto; padding: 11px; }
.checkout-shipping-options label + label { border-top: 1px solid var(--rs-border); }
.checkout-shipping-options input { accent-color: var(--rs-link); }
.checkout-shipping-options label span { display: grid; gap: 3px; }
.checkout-shipping-options label strong, .checkout-shipping-options b { color: var(--rs-text); font-size: .8rem; }
.checkout-shipping-options label small { color: var(--rs-muted); font-size: .72rem; }
.checkout-payment-options { border: 1px solid var(--rs-border); border-radius: 7px; overflow: hidden; }
.checkout-payment-options label { align-items: center; cursor: pointer; display: grid; gap: 10px; grid-template-columns: 18px minmax(0, 1fr) auto; padding: 13px 11px; }
.checkout-payment-options input { accent-color: var(--rs-link); }
.checkout-payment-options label > span { display: grid; gap: 3px; }
.checkout-payment-options strong { color: var(--rs-text); font-size: .84rem; }
.checkout-payment-options small { color: var(--rs-muted); font-size: .72rem; }
.checkout-payment-options b { background: var(--rs-subtle); border-radius: 999px; color: var(--rs-link); font-size: .68rem; padding: 5px 8px; }
.checkout-payment-state { color: var(--rs-muted); font-size: .78rem; margin: 0; }
.checkout-payment-state--error { color: var(--rs-error); margin-bottom: 10px; }
.checkout-summary { position: sticky; top: 92px; }
.checkout-summary__shop { border-top: 1px solid var(--rs-border); padding: 14px 0; }
.checkout-summary__shop h3 { margin-bottom: 9px; }
.checkout-summary__product { align-items: center; display: grid; gap: 8px; grid-template-columns: 38px minmax(0, 1fr) auto; padding: 6px 0; }
.checkout-summary__product-image { align-self: start; align-items: center; width: 38px; height: 38px; background: var(--rs-surface); border-radius: 4px; color: var(--rs-muted); display: flex; font-size: .52rem; justify-content: center; overflow: hidden; text-align: center; }
.checkout-summary__product-image img { display: block; height: 100%; object-fit: contain; width: 100%; }
.checkout-summary__product > span { color: var(--rs-muted); font-size: .72rem; line-height: 1.35; min-width: 0; }
.checkout-summary__quantity { display: block; margin-top: 5px; font-size: inherit; }
.checkout-summary__product > strong { color: var(--rs-muted); font-size: .74rem; overflow-wrap: anywhere; text-align: right; }
.checkout-summary__line, .checkout-summary__subtotal, .checkout-summary__total { align-items: baseline; display: flex; gap: 12px; justify-content: space-between; padding: 5px 0; }
.checkout-summary__line span { color: var(--rs-muted); font-size: .72rem; line-height: 1.4; }
.checkout-summary__line strong { color: var(--rs-muted); font-size: .74rem; white-space: nowrap; }
.checkout-summary__subtotal { border-top: 1px solid var(--rs-border); padding-top: 12px; }
.checkout-summary__subtotal span, .checkout-summary__subtotal strong { color: var(--rs-muted); font-size: .78rem; }
.checkout-summary__total { border-top: 1px solid var(--rs-border); margin-top: 13px; padding-top: 16px; }
.checkout-summary__total span { color: var(--rs-text); font-size: .86rem; font-weight: 800; }
.checkout-summary__total strong { color: var(--rs-link); font-size: 1.3rem; white-space: nowrap; }
.checkout-empty { text-align: center; }
.checkout-empty h2 { color: var(--rs-text); font-size: 1rem; }
.checkout-empty a { color: var(--rs-link); font-weight: 800; }
@media (max-width: 930px) { .checkout-layout { grid-template-columns: 1fr; } .checkout-summary { position: static; } }
@media (max-width: 620px) { .checkout-address { grid-template-columns: 1fr; } .checkout-product { grid-template-columns: 48px minmax(0, 1fr) auto; } .checkout-product__price { grid-column: 2; } .checkout-product__amount { grid-column: 3; } .checkout-shipping-selected { grid-template-columns: minmax(0, 1fr) auto; } .checkout-shipping-selected button { grid-column: 2; } }
</style>
