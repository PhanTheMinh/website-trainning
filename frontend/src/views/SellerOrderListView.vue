<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import SellerLayout from '../layouts/SellerLayout.vue'
import PageHeader from '../components/ui/PageHeader.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import UiButton from '../components/ui/UiButton.vue'
import UiIcon from '../components/ui/UiIcon.vue'
import PaginationNav from '../components/PaginationNav.vue'
import { getSellerOrders } from '../services/sellerOrderService.js'
import { formatCurrency } from '../data/catalog.js'
import { orderStatuses, financialStatuses, fulfillmentStatuses, orderDate } from '../utils/orderStatus.js'
import '../styles/seller-orders.css'

const props = defineProps({ currentUser: { type: Object, default: null }, sessionLoading: Boolean })
defineEmits(['open-auth'])
const route = useRoute()
const router = useRouter()
const items = ref([])
const loading = ref(false)
const error = ref('')
const shopMissing = ref(false)
const filters = ref({ q: '', order_status: 'all', financial_status: 'all', fulfillment_status: 'all', sort: 'newest' })
const sortOptions = { newest: 'Newest first', oldest: 'Oldest first', total_desc: 'Total: high to low', total_asc: 'Total: low to high' }
const filterMenuOpen = ref(false)
const filterMenuWrap = ref(null)
const filterMenuButton = ref(null)
const draftFilters = ref({ financial_status: 'all', fulfillment_status: 'all', sort: 'newest' })
const activeFilterCount = computed(() => Number(filters.value.financial_status !== 'all') + Number(filters.value.sort !== 'newest'))
function closeFilterMenu(restoreFocus = false) {
  filterMenuOpen.value = false
  if (restoreFocus) filterMenuButton.value?.focus()
}
function toggleFilterMenu() {
  if (filterMenuOpen.value) return closeFilterMenu()
  draftFilters.value = { financial_status: filters.value.financial_status, fulfillment_status: filters.value.fulfillment_status, sort: filters.value.sort }
  filterMenuOpen.value = true
}
function outsideFilterMenu(event) {
  if (!filterMenuWrap.value?.contains(event.target)) closeFilterMenu()
}
function leaveFilterMenu(event) {
  if (!filterMenuWrap.value?.contains(event.relatedTarget)) closeFilterMenu()
}
function applyFilterMenu() {
  Object.assign(filters.value, draftFilters.value)
  closeFilterMenu(true)
  return apply()
}
function resetFilters() {
  Object.assign(filters.value, { order_status: 'all', financial_status: 'all', fulfillment_status: 'all', sort: 'newest' })
  closeFilterMenu(true)
  return apply()
}
onMounted(() => { if (typeof document !== 'undefined') document.addEventListener('pointerdown', outsideFilterMenu) })
const pagination = ref({ page: 1, totalItems: 0, totalPages: 1 })
let request = 0
onBeforeUnmount(() => { request++; if (typeof document !== 'undefined') document.removeEventListener('pointerdown', outsideFilterMenu) })
const pageInfo = computed(() => ({ currentPage: pagination.value.page, totalItems: pagination.value.totalItems,
  totalPages: pagination.value.totalPages, hasPreviousPage: pagination.value.page > 1,
  hasNextPage: pagination.value.page < pagination.value.totalPages }))
function routeFilters() {
  const scalar = key => typeof route.query[key] === 'string' ? route.query[key] : ''
  return { q: scalar('q').slice(0, 100),
    order_status: Object.hasOwn(orderStatuses, scalar('order_status')) ? scalar('order_status') : 'all',
    financial_status: Object.hasOwn(financialStatuses, scalar('financial_status')) ? scalar('financial_status') : 'all',
    fulfillment_status: Object.hasOwn(fulfillmentStatuses, scalar('fulfillment_status')) ? scalar('fulfillment_status') : 'all',
    sort: Object.hasOwn(sortOptions, scalar('sort')) ? scalar('sort') : 'newest' }
}
async function load() {
  const key = ++request
  items.value = []
  error.value = ''
  shopMissing.value = false
  loading.value = false
  pagination.value = { page: 1, totalItems: 0, totalPages: 1 }
  filters.value = routeFilters()
  closeFilterMenu()
  if (!props.currentUser || props.sessionLoading) return
  loading.value = true
  const rawPage = Number(route.query.page)
  const page = Number.isInteger(rawPage) && rawPage > 0 && rawPage <= 1000000 ? rawPage : 1
  try {
    const response = await getSellerOrders({ ...filters.value, page, limit: 10 })
    if (key !== request) return
    items.value = response.data
    pagination.value = response.pagination
  } catch (failure) {
    if (key !== request) return
    shopMissing.value = failure.code === 'SHOP_NOT_FOUND'
    error.value = failure.message || 'Could not load orders.'
  } finally { if (key === request) loading.value = false }
}
function apply(page = 1) {
  const query = { ...filters.value, q: filters.value.q.trim(), page: String(page) }
  if (JSON.stringify(route.query) === JSON.stringify(query)) return load()
  return router.push({ name: 'seller-order-list', query })
}
function changePage(page) {
  return router.push({ name: 'seller-order-list', query: { ...route.query, page: String(page) } })
}
function searchChanged() {
  if (!filters.value.q.trim()) {
    filters.value.q = ''
    return apply(1)
  }
}
watch([() => props.currentUser?.id, () => props.sessionLoading, () => route.fullPath], load, { immediate: true })
</script>

<template>
  <SellerLayout :current-user="currentUser" :session-loading="sessionLoading" @open-auth="$emit('open-auth')">
    <PageHeader title="Orders" />
    <EmptyState v-if="shopMissing" title="Create your shop first" description="Set up your shop to manage orders." icon="store"><RouterLink class="rs-button" :to="{ name: 'my-shop' }">Set up shop</RouterLink></EmptyState>
    <template v-else>
      <form class="rs-orders-toolbar" role="search" @submit.prevent="apply()">
        <div class="rs-orders-search">
          <input v-model="filters.q" type="search" aria-label="Search orders or customers" maxlength="100" @input="searchChanged" />
          <button class="rs-orders-search-button" type="submit" aria-label="Search orders" :disabled="loading"><UiIcon name="search" :size="24" /></button>
        </div>
        <div ref="filterMenuWrap" class="rs-orders-filter-wrap" @focusout="leaveFilterMenu" @keydown.esc.stop.prevent="closeFilterMenu(true)">
          <button ref="filterMenuButton" class="rs-orders-filter-trigger" type="button" :aria-expanded="filterMenuOpen" aria-controls="order-sort-filter" @click="toggleFilterMenu">
            <span>Sort &amp; filter <span v-if="activeFilterCount" class="rs-orders-filter-count">{{ activeFilterCount }}</span></span><UiIcon name="chevron" :size="20" />
          </button>
          <div v-if="filterMenuOpen" id="order-sort-filter" class="rs-orders-filter-menu" role="group" aria-label="Order sort and filters">
            <label>Financial Status<select v-model="draftFilters.financial_status" class="rs-input"><option value="all">All payments</option><option v-for="(label, value) in financialStatuses" :key="value" :value="value">{{ label }}</option></select></label>
            <label>Sort<select v-model="draftFilters.sort" class="rs-input"><option v-for="(label, value) in sortOptions" :key="value" :value="value">{{ label }}</option></select></label>
            <div class="rs-orders-filter-actions"><UiButton type="button" variant="secondary" @click="resetFilters">Reset</UiButton><UiButton type="button" @click="applyFilterMenu">Apply</UiButton></div>
          </div>
        </div>
      </form>
      <p v-if="error" class="rs-alert rs-alert--error" role="alert">{{ error }} <UiButton variant="secondary" :disabled="loading" @click="load">Try again</UiButton></p>
      <div v-if="loading" class="rs-orders-loading" role="status">Loading orders…</div>
      <section v-else-if="!error && items.length" class="rs-list-orders-panel" aria-label="Shop orders">
        <div class="rs-list-orders-summary"><span>All orders <span class="rs-list-orders-count">{{ pagination.totalItems }}</span></span></div>
        <div class="rs-orders-table-wrap"><table class="rs-list-orders-table">
          <colgroup><col class="rs-list-col-order" /><col class="rs-list-col-customer" /><col class="rs-list-col-payment" /><col class="rs-list-col-total" /><col class="rs-list-col-action" /></colgroup>
          <thead><tr><th>Order</th><th>Customer</th><th>Financial status</th><th class="rs-list-total">Total</th><th><span class="sr-only">Actions</span></th></tr></thead>
          <tbody><tr v-for="order in items" :key="order.id">
            <td class="rs-list-order-cell"><div class="rs-list-order-title"><RouterLink :to="{ name: 'seller-order-detail', params: { id: order.id }, query: route.query }">#{{ String(order.id).padStart(4, '0') }}</RouterLink></div><small>{{ orderDate(order.created_at) }}</small></td>
            <td class="rs-list-customer-cell" data-label="Customer"><span class="rs-list-customer">{{ order.recipient_name || '—' }}</span></td>
            <td class="rs-list-payment-cell" data-label="Financial status"><span class="rs-list-status" :data-status="order.financial_status"><span class="rs-list-status-dot" aria-hidden="true"></span>{{ financialStatuses[order.financial_status] || order.financial_status }}</span></td>
            <td class="rs-list-total" data-label="Total"><strong>{{ formatCurrency(order.order_total) }}</strong></td>
            <td class="rs-list-action-cell"><RouterLink class="rs-list-view" :aria-label="`View order #${String(order.id).padStart(4, '0')}`" :to="{ name: 'seller-order-detail', params: { id: order.id }, query: route.query }">View<UiIcon name="arrow" :size="15" /></RouterLink></td>
          </tr></tbody>
        </table></div>
      </section>
      <EmptyState v-else-if="!error" title="No orders found" description="New orders will appear here. Try changing your filters." icon="package" />
      <PaginationNav v-if="!error && !loading" :pagination="pageInfo" item-label="orders" @change="changePage" />
    </template>
  </SellerLayout>
</template>

<style scoped>
.rs-orders-toolbar { display:grid; grid-template-columns:minmax(0,4fr) minmax(0,1fr); gap:12px; }
.rs-orders-search { height:52px; border-radius:12px; }
.rs-orders-search input { padding-inline:16px; }
.rs-orders-search-button { flex-basis:52px; }
.rs-orders-filter-wrap { width:100%; }
.rs-orders-filter-trigger { min-height:52px; border-radius:12px; padding-inline:16px; }
@media(min-width:521px) and (max-width:1100px) { .rs-orders-toolbar { grid-template-columns:minmax(0,7fr) minmax(0,3fr); } .rs-orders-filter-trigger { padding-inline:12px; gap:8px; font-size:13px; } }
.rs-list-orders-panel { border:1px solid var(--rs-border); border-radius:16px; background:var(--rs-surface); overflow:hidden; }
.rs-list-orders-summary { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:20px 24px; font-size:13px; font-weight:600; }
.rs-list-orders-count { display:inline-grid; place-items:center; min-width:24px; height:24px; margin-left:8px; background:var(--rs-subtle); border-radius:6px; font-size:12px; }
.rs-list-orders-table { width:100%; border-collapse:collapse; text-align:left; font-size:14px; }
.rs-list-col-order { width:25%; } .rs-list-col-customer { width:25%; } .rs-list-col-total { width:23%; } .rs-list-col-payment { width:18%; } .rs-list-col-action { width:9%; }
.rs-list-orders-table th { padding:15px 24px; background:var(--rs-subtle); color:var(--rs-muted); font-size:12px; font-weight:500; white-space:nowrap; }
.rs-list-orders-table td { padding:22px 24px; border-bottom:1px solid var(--rs-border); vertical-align:middle; height:88px; box-sizing:border-box; }
.rs-list-orders-table th:first-child,.rs-list-orders-table td:first-child { padding-left:24px; }
.rs-list-orders-table tr:last-child td { border-bottom:0; }
.rs-list-orders-table tbody tr:hover { background:var(--rs-subtle); }
.rs-list-order-title { display:flex; align-items:center; gap:10px; }
.rs-list-order-title a { font-weight:700; text-decoration:none; color:var(--rs-text); }
.rs-list-order-title a:hover { color:var(--rs-link); }
.rs-list-orders-table small { display:block; margin-top:7px; color:var(--rs-muted); font-size:11px; white-space:nowrap; }
.rs-list-customer { font-weight:500; }
.rs-list-total { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
.rs-list-total strong { font-weight:600; }
.rs-list-status { display:inline-flex; align-items:center; gap:7px; border-radius:20px; padding:6px 10px; font-size:12px; line-height:1.2; background:var(--rs-subtle); color:var(--rs-text); white-space:nowrap; }
.rs-list-status-dot { width:5px; height:5px; border-radius:50%; background:currentColor; }
.rs-list-status[data-status='paid'] { color:var(--rs-success); background:var(--rs-success-bg); }
.rs-list-status[data-status='unpaid'] { color:var(--rs-warning); background:var(--rs-warning-bg); }
.rs-list-view { display:inline-flex; align-items:center; gap:8px; min-height:36px; border:1px solid var(--rs-border); border-radius:8px; padding:0 12px; color:var(--rs-text); font-size:12px; text-decoration:none; }
.rs-list-view:hover { border-color:var(--rs-link); color:var(--rs-link); }
.rs-list-orders-footer { display:flex; justify-content:space-between; padding:16px 24px; border-top:1px solid var(--rs-border); color:var(--rs-muted); font-size:11px; }
@media(min-width:761px) and (max-width:1100px) { .rs-list-orders-table { font-size:12px; } .rs-list-orders-table th,.rs-list-orders-table td { padding-left:12px; padding-right:12px; } .rs-list-orders-table th { font-size:11px; } .rs-list-orders-table small { font-size:10px; } .rs-list-orders-table th:first-child,.rs-list-orders-table td:first-child { padding-left:18px; } .rs-list-view { padding:0 8px; gap:5px; } }
@media(max-width:760px) {
  .rs-list-orders-summary { padding:18px; }
  .rs-list-orders-table,.rs-list-orders-table tbody { display:block; width:100%; }
  .rs-list-orders-table thead,.rs-list-orders-table colgroup { display:none; }
  .rs-list-orders-table tr { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:14px 12px; padding:20px 18px; border-top:1px solid var(--rs-border); }
  .rs-list-orders-table td,.rs-list-orders-table td:first-child { display:block; height:auto; border:0; padding:0; }
  .rs-list-orders-table td[data-label]::before { content:attr(data-label); display:block; color:var(--rs-muted); font-size:11px; margin-bottom:7px; }
  .rs-list-orders-table .rs-list-order-cell { grid-column:1; grid-row:1; }
  .rs-list-orders-table .rs-list-action-cell { grid-column:2; grid-row:1; text-align:right; }
  .rs-list-orders-table .rs-list-customer-cell { grid-column:1; grid-row:2; }
  .rs-list-orders-table .rs-list-total { grid-column:2; grid-row:3; }
  .rs-list-orders-table .rs-list-payment-cell { grid-column:1; grid-row:3; }
  .rs-list-orders-table .rs-list-payment-cell::before { display:inline; margin-right:12px; }
  .rs-list-orders-footer { padding:16px 18px; }
}
@media(max-width:520px) { .rs-orders-toolbar { grid-template-columns:minmax(0,1fr); } }
</style>
