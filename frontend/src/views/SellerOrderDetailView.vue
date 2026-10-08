<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import SellerLayout from '../layouts/SellerLayout.vue'
import PageHeader from '../components/ui/PageHeader.vue'
import UiButton from '../components/ui/UiButton.vue'
import ConfirmDialog from '../components/ui/ConfirmDialog.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import { getSellerOrder, updateSellerOrder } from '../services/sellerOrderService.js'
import { API_BASE_URL } from '../services/apiClient.js'
import { formatCurrency } from '../data/catalog.js'
import { orderActions, orderDate } from '../utils/orderStatus.js'
import '../styles/seller-orders.css'

const props = defineProps({ currentUser: { type: Object, default: null }, sessionLoading: Boolean })
defineEmits(['open-auth'])
const route = useRoute()
const order = ref(null)
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const notice = ref('')
const action = ref('')
const reason = ref('')
const actionError = ref('')
const failedImages = ref(new Set())
const errorStatus = ref(0)
const refreshRequired = ref(false)
let request = 0
onBeforeUnmount(() => { request++ })
const actionInfo = computed(() => orderActions[action.value] || { label: '', description: '' })
const customerName = computed(() => [order.value?.address?.recipient_first_name, order.value?.address?.recipient_last_name].filter(Boolean).join(' '))
const orderName = computed(() => `#${String(order.value?.id).padStart(4, '0')}`)
const shippingActions = computed(() => (order.value?.allowed_actions || []).filter(value => !['mark-paid', 'confirm', 'cancel'].includes(value)))
const paymentActions = computed(() => (order.value?.allowed_actions || []).filter(value => value === 'mark-paid'))
const terminalError = computed(() => [400, 401, 403, 404].includes(errorStatus.value))
const errorTitle = computed(() => ({ 400: 'Invalid order', 401: 'Sign in to view this order', 403: 'Order access unavailable', 404: 'Order not found' }[errorStatus.value] || 'Could not load this order'))
const addressText = computed(() => {
  const a = order.value?.address
  return a ? [a.house_number, a.street, a.apartment, a.ward, a.city, a.province_name, a.postal_code, a.country_name].filter(Boolean).join(', ') : '—'
})
function image(item) {
  if (!item.image_url || failedImages.value.has(item.id)) return ''
  try {
    const url = new URL(item.image_url.replace(/\\/g, '/').replace(/^(?:\/?src\/)?uploads\//, '/uploads/'), API_BASE_URL)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : ''
  } catch { return '' }
}
async function load() {
  const key = ++request
  order.value = null
  error.value = ''
  notice.value = ''
  action.value = ''
  actionError.value = ''
  reason.value = ''
  busy.value = false
  loading.value = false
  failedImages.value = new Set()
  errorStatus.value = 0
  refreshRequired.value = false
  if (!props.currentUser || props.sessionLoading) return
  loading.value = true
  try {
    const response = await getSellerOrder(route.params.id)
    if (key === request) order.value = response.data
  } catch (failure) { if (key === request) { errorStatus.value = failure.status || 0; error.value = failure.message || 'Could not load this order.' } }
  finally { if (key === request) loading.value = false }
}
function selectAction(value) {
  action.value = value
  reason.value = ''
  actionError.value = ''
}
async function perform() {
  if (busy.value || refreshRequired.value || !order.value || !order.value.allowed_actions.includes(action.value)) return
  const selectedAction = action.value
  if (selectedAction === 'cancel' && reason.value.trim().length < 3) {
    actionError.value = 'Enter a cancellation reason (at least 3 characters).'
    return
  }
  const key = ++request
  busy.value = true
  actionError.value = ''
  notice.value = ''
  error.value = ''
  errorStatus.value = 0
  try {
    const response = await updateSellerOrder(order.value.id, selectedAction, order.value.lock_version, reason.value.trim())
    if (key !== request) return
    order.value = response.data
    action.value = ''
    try {
      const latest = await getSellerOrder(route.params.id)
      if (key !== request) return
      order.value = latest.data
      notice.value = `${orderActions[selectedAction].label}: saved.`
    } catch (failure) {
      if (key !== request) return
      refreshRequired.value = true
      errorStatus.value = failure.status || 0
      if ([401, 403, 404].includes(errorStatus.value)) order.value = null
      error.value = 'The change was saved, but the latest order could not be loaded. Reload before continuing.'
    }
  } catch (failure) {
    if (key !== request) return
    actionError.value = failure.message || 'Could not update this order.'
    if ([401, 403, 404].includes(failure.status)) {
      order.value = null
      action.value = ''
      errorStatus.value = failure.status
      error.value = failure.message || 'Order access unavailable.'
    }
    if (failure.status === 409) {
      action.value = ''
      try {
        const response = await getSellerOrder(route.params.id)
        if (key === request) {
          order.value = response.data
          error.value = `${failure.message} The latest order has been loaded.`
        }
      } catch (refreshError) { if (key === request) { order.value = null; errorStatus.value = refreshError.status || 0; error.value = 'Could not refresh this order. Reload before continuing.' } }
    }
  } finally { if (key === request) busy.value = false }
}
watch([() => props.currentUser?.id, () => props.sessionLoading, () => route.params.id], load, { immediate: true })
</script>

<template>
  <SellerLayout :current-user="currentUser" :session-loading="sessionLoading" @open-auth="$emit('open-auth')">
    <RouterLink class="rs-detail-back rs-back-button" :to="{ name: 'seller-order-list', query: route.query }" aria-label="Back to Orders" title="Back to Orders">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 5-7 7 7 7M5 12h14" /></svg>
    </RouterLink>
    <PageHeader v-if="!order" title="Order Detail" />
    <EmptyState v-if="terminalError && !order" :title="errorTitle" :description="error" icon="package">
      <UiButton v-if="errorStatus === 401" @click="$emit('open-auth')">Sign in</UiButton>
      <RouterLink v-else class="rs-button rs-button--secondary" :to="{ name: 'seller-order-list', query: route.query }">Back to Orders</RouterLink>
    </EmptyState>
    <p v-else-if="error" class="rs-alert rs-alert--error" role="alert">{{ error }} <UiButton variant="secondary" :disabled="busy || loading" @click="load">Reload</UiButton></p>
    <p v-if="notice" class="rs-alert rs-alert--success" role="status">{{ notice }}</p>
    <div v-if="loading" class="rs-orders-loading" role="status">Loading order…</div>
    <article v-else-if="order" class="rs-simple-detail">
      <header class="rs-simple-header" aria-label="Order Information">
        <h1 :title="orderName">{{ orderName }}</h1>
        <p>Created At <time>{{ orderDate(order.created_at) }}</time></p>
      </header>
      <section class="rs-simple-section" aria-labelledby="order-line-items">
        <h2 id="order-line-items">Line Items</h2>
        <div class="rs-simple-item-labels" aria-hidden="true"><span>Product</span><span>Product Name</span><span>Quantity</span></div>
        <ul class="rs-simple-items">
          <li v-for="item in order.items" :key="item.id">
            <img v-if="image(item)" :src="image(item)" :alt="item.product_name" @error="failedImages.add(item.id)" />
            <span v-else class="rs-simple-no-image">No image</span>
            <span class="rs-simple-product-name">{{ item.product_name }}</span>
            <span class="rs-simple-quantity"><span class="sr-only">Quantity: </span>{{ item.quantity }}</span>
          </li>
        </ul>
      </section>
      <section class="rs-simple-section" aria-labelledby="order-customer">
        <h2 id="order-customer">Customer</h2>
        <dl v-if="order.address" class="rs-simple-fields"><div><dt>Customer Name</dt><dd>{{ customerName || '—' }}</dd></div><div v-if="order.address.email"><dt>Email</dt><dd>{{ order.address.email }}</dd></div><div v-if="order.address.phone"><dt>Phone</dt><dd>{{ order.address.phone }}</dd></div></dl>
        <p v-else class="rs-simple-missing">Customer information unavailable.</p>
      </section>
      <section class="rs-simple-section" aria-labelledby="order-shipping">
        <h2 id="order-shipping">Shipping</h2>
        <dl class="rs-simple-fields"><template v-if="order.address"><div><dt>Recipient Name</dt><dd>{{ customerName || '—' }}</dd></div><div v-if="order.address.phone"><dt>Phone</dt><dd>{{ order.address.phone }}</dd></div><div><dt>Shipping Address</dt><dd><address>{{ addressText }}</address></dd></div></template><div v-if="order.shipping_method_name"><dt>Shipping Method</dt><dd>{{ order.shipping_method_name }}</dd></div></dl>
        <p v-if="!order.address" class="rs-simple-missing">Shipping address unavailable.</p>
        <div v-if="shippingActions.length" class="rs-simple-actions"><UiButton v-for="value in shippingActions" :key="value" :variant="value === 'cancel' ? 'danger' : 'secondary'" :disabled="busy || refreshRequired" @click="selectAction(value)">{{ orderActions[value]?.label || value }}</UiButton></div>
      </section>
      <section class="rs-simple-section rs-simple-summary" aria-labelledby="order-summary">
        <h2 id="order-summary">Order Summary</h2>
        <dl class="rs-simple-totals"><div><dt>Subtotal</dt><dd>{{ formatCurrency(order.sub_total) }}</dd></div><div><dt>Shipping</dt><dd>{{ formatCurrency(order.shipping_fee) }}</dd></div></dl>
        <div v-if="paymentActions.length" class="rs-simple-actions"><UiButton v-for="value in paymentActions" :key="value" variant="secondary" :disabled="busy || refreshRequired" @click="selectAction(value)">{{ orderActions[value]?.label || value }}</UiButton></div>
        <dl class="rs-simple-totals"><div class="rs-simple-total"><dt>Total</dt><dd>{{ formatCurrency(order.order_total) }}</dd></div></dl>
      </section>
    </article>
    <ConfirmDialog :open="Boolean(action)" :busy="busy" :title="actionInfo.label" :description="actionInfo.description" :error="actionError" :confirm-label="actionInfo.label" busy-label="Saving…" :confirm-variant="action === 'cancel' ? 'danger' : 'primary'" @cancel="action = ''" @confirm="perform">
      <label v-if="action === 'cancel'" class="rs-order-cancel-field">Cancellation reason<textarea v-model="reason" class="rs-input" maxlength="500" :disabled="busy" placeholder="Explain why this order is cancelled" /></label>
    </ConfirmDialog>
  </SellerLayout>
</template>
