<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { getOrder, getCheckoutOrders } from '../services/orderService.js'
import { API_BASE_URL } from '../services/apiClient.js'
import { formatCurrency } from '../data/catalog.js'
import BackButton from '../components/BackButton.vue'
import UiIcon from '../components/ui/UiIcon.vue'
import { orderStatuses, fulfillmentStatuses } from '../utils/orderStatus.js'

const props = defineProps({ currentUser: { type: Object, default: null }, sessionLoading: Boolean })
defineEmits(['open-auth'])
const route = useRoute()
const data = ref(null)
const loading = ref(false)
const error = ref('')
let request = 0
const orders = computed(() => data.value ? (data.value.orders || [data.value]) : [])
const checkoutTotal = computed(() => orders.value.reduce((sum, order) => sum + Math.round(Number(order.order_total) * 100), 0) / 100)
const itemsSubtotal = computed(() => orders.value.reduce((sum, order) => sum + Math.round(Number(order.sub_total) * 100), 0) / 100)
const shippingTotal = computed(() => orders.value.reduce((sum, order) => sum + Math.round(Number(order.shipping_fee) * 100), 0) / 100)
const itemCount = computed(() => orders.value.reduce((sum, order) => sum + (order.items || []).reduce((count, item) => count + item.quantity, 0), 0))
const shippingAddress = computed(() => orders.value[0]?.address)
const dueOnDelivery = computed(() => orders.value.filter(order => order.payment_method_data?.type === 'cod' && order.payment_status === 'unpaid' && order.status !== 'cancelled')
  .reduce((sum, order) => sum + Math.round(Number(order.order_total) * 100), 0) / 100)
const date = value => value ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(`${value}T00:00:00Z`)) : '—'
function image(value) {
  try {
    if (!value) return ''
    const url = new URL(value.replace(/\\/g, '/').replace(/^(?:\/?src\/)?uploads\//, '/uploads/'), API_BASE_URL)
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : ''
  } catch { return '' }
}
async function load() {
  const key = ++request
  data.value = null
  error.value = ''
  if (props.sessionLoading || !props.currentUser) { loading.value = false; return }
  loading.value = true
  try {
    const response = route.name === 'checkout-orders' ? await getCheckoutOrders(route.params.checkoutToken) : await getOrder(route.params.id)
    if (key === request) data.value = response.data
  } catch (failure) {
    if (key === request) error.value = failure.message || 'Could not load your order.'
  } finally { if (key === request) loading.value = false }
}
watch([() => props.currentUser?.id, () => props.sessionLoading, () => route.fullPath], load, { immediate: true })
</script>

<template>
  <main class="order-page">
    <section class="section order-section">
      <div class="order-heading"><BackButton :fallback="{ name: 'checkout' }" /><h1>Order summary</h1></div>
      <div v-if="sessionLoading || loading" class="order-state" role="status">Loading your order…</div>
      <div v-else-if="!currentUser" class="order-state"><p>Sign in to view your order.</p><button class="order-action" @click="$emit('open-auth')">Sign in</button></div>
      <div v-else-if="error" class="order-state" role="alert"><p>{{ error }}</p><button class="order-action" @click="load">Try again</button></div>
      <div v-else-if="data && !orders.length" class="order-state"><p>No orders have been created for this checkout.</p><RouterLink class="order-action" :to="{ name: 'checkout', params: { checkoutToken: route.params.checkoutToken } }">Return to checkout</RouterLink></div>
      <template v-else-if="data && orders.length">
        <section v-if="shippingAddress" class="order-block order-address">
          <h2>Shipping address</h2>
          <div class="order-address__content"><strong>{{ shippingAddress.recipient_first_name }} {{ shippingAddress.recipient_last_name }}</strong><span>{{ shippingAddress.phone }}</span><address>{{ [shippingAddress.house_number, shippingAddress.street, shippingAddress.apartment, shippingAddress.ward, shippingAddress.city, shippingAddress.province_name, shippingAddress.postal_code, shippingAddress.country_name].filter(Boolean).join(', ') }}</address></div>
        </section>
        <article v-for="order in orders" :key="order.id" class="order-block order-shop">
          <header class="order-shop__heading"><h2>{{ order.shop?.name || 'Your order' }}</h2><span>Order #{{ order.id }}<span v-if="order.status === 'cancelled'"> · Cancelled</span></span></header>
          <div class="order-row"><span>Order status</span><div>{{ orderStatuses[order.status] || order.status }}</div><span>{{ fulfillmentStatuses[order.fulfillment_status] || 'Not started' }}</span></div>
          <div class="order-columns" aria-hidden="true"><span>Product</span><span>Unit price</span><span>Quantity</span><span>Subtotal</span></div>
          <ul class="order-items">
            <li v-for="item in order.items" :key="item.id">
              <div class="order-product">
                <div class="order-product__image"><img v-if="image(item.image_url)" :src="image(item.image_url)" :alt="item.product_name" @error="$event.target.style.display = 'none'" /><UiIcon v-else name="package" :size="22" /></div>
                <div><strong>{{ item.product_name }}</strong><p v-if="item.variant_data?.length">{{ item.variant_data.map(option => option.name + ': ' + option.value).join(' · ') }}</p></div>
              </div>
              <span class="order-unit-price"><span class="mobile-label">Unit price </span>{{ formatCurrency(item.unit_price) }}</span>
              <span class="order-quantity"><span class="mobile-label">Qty </span>{{ item.quantity }}</span>
              <strong class="order-line-total">{{ formatCurrency(item.line_total) }}</strong>
            </li>
          </ul>
          <div class="order-row order-shipping"><span>Shipping</span><div><strong>{{ order.shipping_method_name }}</strong><small v-if="order.status !== 'cancelled'">Estimated arrival: {{ date(order.estimated_delivery_from) }} – {{ date(order.estimated_delivery_to) }}</small></div><span>{{ formatCurrency(order.shipping_fee) }}</span></div>
          <div class="order-row order-payment"><span>Payment</span><div>{{ order.payment_method_data?.name || 'Not available' }}</div><span>{{ order.payment_status === 'paid' ? 'Paid' : order.payment_status === 'unpaid' ? 'Not paid yet' : order.payment_status }}</span></div>
          <div class="order-shop__total"><span>Order total</span><strong>{{ formatCurrency(order.order_total) }}</strong></div>
        </article>
        <section class="order-block order-bill">
          <h2>Payment summary</h2>
          <dl><div><dt>Items ({{ itemCount }})</dt><dd>{{ formatCurrency(itemsSubtotal) }}</dd></div><div><dt>Shipping fees</dt><dd>{{ formatCurrency(shippingTotal) }}</dd></div><div class="order-bill__total"><dt>Total</dt><dd>{{ formatCurrency(checkoutTotal) }}</dd></div></dl>
          <p v-if="dueOnDelivery > 0">Pay on delivery: {{ formatCurrency(dueOnDelivery) }}</p>
        </section>
      </template>
    </section>
  </main>
</template>

<style scoped>
.order-page { background: var(--rs-page); color: var(--rs-text); min-height: 70vh; font-size: 14px; }
.order-section { box-sizing: border-box; width: 100%; max-width: 1100px; margin-inline: auto; padding: 24px clamp(16px, 3vw, 32px) 56px; }
.order-heading { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.order-heading h1 { max-width: none; margin: 0; font-size: 22px; font-weight: 600; letter-spacing: normal; line-height: 1.4; white-space: nowrap; }
.order-block { background: var(--rs-surface); border: 1px solid var(--rs-border); border-radius: 4px; margin-bottom: 16px; padding: 20px 24px; }
.order-block h2 { margin: 0; font-size: 14px; font-weight: 650; line-height: 1.5; letter-spacing: normal; }
.order-address h2 { color: var(--rs-link); margin-bottom: 12px; }
.order-address__content { display: flex; flex-wrap: wrap; gap: 8px 20px; line-height: 1.7; }
.order-address__content strong { font-weight: 600; }
.order-address__content span { color: var(--rs-muted); }
.order-address address { flex: 1; min-width: 240px; font-style: normal; color: var(--rs-muted); }
.order-shop__heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-bottom: 18px; border-bottom: 1px solid var(--rs-border); }
.order-shop__heading > span { font-size: 12px; color: var(--rs-muted); white-space: nowrap; }
.order-columns, .order-items li { display: grid; grid-template-columns: minmax(0, 1fr) 120px 80px 135px; column-gap: 20px; align-items: center; }
.order-columns { color: var(--rs-muted); font-size: 12px; padding: 16px 0 4px; }
.order-columns > span:not(:first-child), .order-unit-price, .order-quantity, .order-line-total { text-align: right; font-variant-numeric: tabular-nums; }
.order-items { list-style: none; margin: 0; padding: 0; }
.order-items li { padding: 16px 0; }
.order-items li + li { border-top: 1px solid var(--rs-border); }
.order-product { display: flex; align-items: center; gap: 14px; min-width: 0; }
.order-product > div:last-child { min-width: 0; overflow-wrap: anywhere; }
.order-product strong { font-size: 14px; font-weight: 500; line-height: 1.6; }
.order-product p { margin: 5px 0 0; color: var(--rs-muted); font-size: 12px; line-height: 1.6; }
.order-product__image { width: 64px; height: 64px; flex-shrink: 0; background: var(--rs-subtle); color: var(--rs-muted); display: grid; place-items: center; overflow: hidden; }
.order-product__image img { width: 100%; height: 100%; object-fit: contain; }
.order-unit-price, .order-quantity { font-size: 13px; color: var(--rs-muted); white-space: nowrap; }
.order-line-total { font-size: 13px; font-weight: 600; white-space: nowrap; }
.mobile-label { display: none; }
.order-row { display: grid; grid-template-columns: 110px minmax(0, 1fr) 150px; gap: 20px; padding: 16px 0; border-top: 1px solid var(--rs-border); font-size: 13px; line-height: 1.6; }
.order-row > span:first-child { color: var(--rs-muted); }
.order-row > span:last-child { text-align: right; white-space: nowrap; }
.order-shipping strong { font-weight: 500; }
.order-shipping small { display: block; color: var(--rs-muted); font-size: 12px; margin-top: 4px; }
.order-payment > span:last-child { color: var(--rs-muted); font-size: 12px; }
.order-shop__total { display: flex; justify-content: flex-end; align-items: baseline; gap: 24px; border-top: 1px solid var(--rs-border); padding-top: 16px; font-size: 13px; }
.order-shop__total > span { color: var(--rs-muted); }
.order-shop__total strong { font-size: 16px; font-weight: 600; }
.order-bill { display: grid; grid-template-columns: 1fr minmax(260px, 340px); gap: 12px 24px; }
.order-bill dl { margin: 0; }
.order-bill dl > div { display: flex; justify-content: space-between; gap: 20px; padding: 7px 0; font-size: 13px; }
.order-bill dt { color: var(--rs-muted); }
.order-bill dd { margin: 0; white-space: nowrap; }
.order-bill__total { border-top: 1px solid var(--rs-border); margin-top: 8px; padding-top: 16px !important; align-items: baseline; }
.order-bill__total dt { color: var(--rs-text); font-weight: 600; }
.order-bill__total dd { color: var(--rs-link); font-size: 22px; font-weight: 650; }
.order-bill > p { grid-column: 2; text-align: right; font-size: 12px; color: var(--rs-muted); margin: 0; line-height: 1.6; }
.order-state { padding: 40px 24px; background: var(--rs-surface); border: 1px solid var(--rs-border); text-align: center; border-radius: 4px; }
.order-state p { color: var(--rs-muted); line-height: 1.7; }
.order-action { display: inline-block; padding: 10px 16px; color: var(--rs-link); border: 1px solid var(--rs-border); background: var(--rs-surface); border-radius: 4px; text-decoration: none; cursor: pointer; }
@media (max-width: 720px) {
  .order-block { padding: 16px; }
  .order-columns { display: none; }
  .order-items li { grid-template-columns: minmax(0, 1fr) auto; gap: 8px 12px; }
  .order-product { grid-column: 1 / -1; margin-bottom: 4px; }
  .order-product__image { width: 56px; height: 56px; }
  .order-unit-price { text-align: left; grid-column: 1; margin-left: 70px; }
  .order-quantity { grid-column: 2; }
  .order-line-total { grid-column: 2; }
  .mobile-label { display: inline; }
  .order-row { grid-template-columns: 80px minmax(0, 1fr); gap: 8px 12px; }
  .order-row > span:last-child { grid-column: 2; text-align: left; }
  .order-shop__heading { gap: 8px; }
  .order-address__content { gap: 6px 16px; }
  .order-address address { flex-basis: 100%; min-width: 0; }
  .order-bill { grid-template-columns: 1fr; }
  .order-bill > p { grid-column: 1; }
}
</style>
