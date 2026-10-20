<script setup>
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import SellerLayout from '../src/layouts/SellerLayout.vue'
import PageHeader from '../src/components/ui/PageHeader.vue'
import UiIcon from '../src/components/ui/UiIcon.vue'
import EmptyState from '../src/components/ui/EmptyState.vue'
import '../src/styles/seller-orders.css'

defineProps({ currentUser: Object, sessionLoading: Boolean })
defineEmits(['open-auth'])
const orders = [
  { id: 4, customer: 'Hải Nguyễn', total: 4030000, financial: 'unpaid', fulfillment: 'unfulfilled', status: 'Pending confirmation', date: '01 Oct 2026 · 21:44' },
  { id: 3, customer: 'Minh Anh', total: 4030000, financial: 'paid', fulfillment: 'processing', status: 'Confirmed', date: '01 Oct 2026 · 20:16' },
  { id: 2, customer: 'Hải Nguyễn', total: 1930000, financial: 'unpaid', fulfillment: 'shipped', status: 'Confirmed', date: '01 Oct 2026 · 16:41' },
  { id: 1, customer: 'Linh Trần', total: 10530000, financial: 'paid', fulfillment: 'delivered', status: 'Completed', date: '01 Oct 2026 · 13:33' }
]
const financialLabels = { unpaid: 'Unpaid', paid: 'Paid' }
const sortLabels = { newest: 'Newest first', oldest: 'Oldest first', total_desc: 'Total: high to low', total_asc: 'Total: low to high' }
const search = ref('')
const query = ref('')
const open = ref(false)
const applied = ref({ financial: 'all', sort: 'newest' })
const draft = ref({ ...applied.value })
const count = computed(() => Number(applied.value.financial !== 'all') + Number(applied.value.sort !== 'newest'))
const rows = computed(() => orders.filter(order => (!query.value || `${order.id} ${order.customer}`.toLowerCase().includes(query.value.toLowerCase())) && (applied.value.financial === 'all' || order.financial === applied.value.financial)).sort((a,b) => applied.value.sort === 'oldest' ? a.id-b.id : applied.value.sort === 'total_desc' ? b.total-a.total || b.id-a.id : applied.value.sort === 'total_asc' ? a.total-b.total || b.id-a.id : b.id-a.id))
const money = value => `${new Intl.NumberFormat('en-US').format(value)} ₫`
function toggle() { draft.value = { ...applied.value }; open.value = !open.value }
function apply() { applied.value = { ...draft.value }; open.value = false }
function reset() { applied.value = { financial: 'all', sort: 'newest' }; open.value = false }
</script>

<template>
  <SellerLayout :current-user="currentUser" :session-loading="sessionLoading" @open-auth="$emit('open-auth')">
    <PageHeader title="Orders" />
    <form class="rs-orders-toolbar" role="search" @submit.prevent="query = search.trim()">
      <div class="rs-orders-search"><input v-model="search" aria-label="Search orders or customers" type="search" /><button class="rs-orders-search-button" type="submit" aria-label="Search orders"><UiIcon name="search" :size="24" /></button></div>
      <div class="rs-orders-filter-wrap" @keydown.esc="open = false">
        <button class="rs-orders-filter-trigger" type="button" :aria-expanded="open" aria-controls="demo-order-filters" @click="toggle"><span>Sort &amp; filter <span v-if="count" class="rs-orders-filter-count">{{ count }}</span></span><UiIcon name="chevron" /></button>
        <div v-if="open" id="demo-order-filters" class="rs-orders-filter-menu">
          <label>Financial status<select v-model="draft.financial" class="rs-input"><option value="all">All payments</option><option v-for="(label,value) in financialLabels" :key="value" :value="value">{{ label }}</option></select></label>
          <label>Sort<select v-model="draft.sort" class="rs-input"><option v-for="(label,value) in sortLabels" :key="value" :value="value">{{ label }}</option></select></label>
          <div class="rs-orders-filter-actions"><button type="button" class="rs-button rs-button--secondary" @click="reset">Reset</button><button type="button" class="rs-button" @click="apply">Apply</button></div>
        </div>
      </div>
    </form>
    <section class="demo-orders-panel" aria-label="Shop orders">
      <div class="demo-orders-summary"><span>All orders <span class="demo-orders-count">{{ rows.length }}</span></span></div>
      <div v-if="rows.length" class="rs-orders-table-wrap"><table class="demo-orders-table">
        <colgroup><col class="demo-col-order" /><col class="demo-col-customer" /><col class="demo-col-total" /><col class="demo-col-payment" /><col class="demo-col-action" /></colgroup>
        <thead><tr><th>Order</th><th>Customer</th><th class="demo-total">Total</th><th>Financial status</th><th><span class="sr-only">Actions</span></th></tr></thead>
        <tbody><tr v-for="order in rows" :key="order.id">
          <td class="demo-order-cell"><div class="demo-order-title"><RouterLink :to="{name:'seller-order-detail',params:{id:order.id}}">#{{ String(order.id).padStart(4,'0') }}</RouterLink></div><small>{{ order.date }}</small></td>
          <td class="demo-customer-cell" data-label="Customer"><span class="demo-customer">{{ order.customer }}</span></td>
          <td class="demo-total" data-label="Total"><strong>{{ money(order.total) }}</strong></td>
          <td class="demo-payment-cell" data-label="Financial status"><span class="demo-status" :data-status="order.financial"><span class="demo-status-dot"></span>{{ financialLabels[order.financial] }}</span></td>
          <td class="demo-action-cell"><RouterLink class="demo-view" :aria-label="`View order #${String(order.id).padStart(4,'0')}`" :to="{name:'seller-order-detail',params:{id:order.id}}">View<UiIcon name="arrow" :size="15" /></RouterLink></td>
        </tr></tbody>
      </table></div>
      <EmptyState v-else title="No matching orders" description="Try a different search or reset your filters." icon="package" />
      <div class="demo-orders-footer">{{ rows.length }} orders <span>Page 1 of 1</span></div>
    </section>
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
.demo-orders-panel { border:1px solid var(--rs-border); border-radius:16px; background:var(--rs-surface); overflow:hidden; }
.demo-orders-summary { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:20px 24px; font-size:13px; font-weight:600; }
.demo-orders-count { display:inline-grid; place-items:center; min-width:24px; height:24px; margin-left:8px; background:var(--rs-subtle); border-radius:6px; font-size:12px; }
.demo-orders-table { width:100%; border-collapse:collapse; text-align:left; font-size:14px; }
.demo-col-order { width:25%; } .demo-col-customer { width:25%; } .demo-col-total { width:23%; } .demo-col-payment { width:18%; } .demo-col-action { width:9%; }
.demo-orders-table th { padding:15px 24px; background:var(--rs-subtle); color:var(--rs-muted); font-size:12px; font-weight:500; white-space:nowrap; }
.demo-orders-table td { padding:22px 24px; border-bottom:1px solid var(--rs-border); vertical-align:middle; height:88px; box-sizing:border-box; }
.demo-orders-table th:first-child,.demo-orders-table td:first-child { padding-left:24px; }
.demo-orders-table tr:last-child td { border-bottom:0; }
.demo-orders-table tbody tr:hover { background:var(--rs-subtle); }
.demo-order-title { display:flex; align-items:center; gap:10px; }
.demo-order-title a { font-weight:700; text-decoration:none; color:var(--rs-text); }
.demo-order-title a:hover { color:var(--rs-link); }
.demo-orders-table small { display:block; margin-top:7px; color:var(--rs-muted); font-size:11px; white-space:nowrap; }
.demo-customer { font-weight:500; }
.demo-total { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
.demo-total strong { font-weight:600; }
.demo-status { display:inline-flex; align-items:center; gap:7px; border-radius:20px; padding:6px 10px; font-size:12px; line-height:1.2; background:var(--rs-subtle); color:var(--rs-text); white-space:nowrap; }
.demo-status-dot { width:5px; height:5px; border-radius:50%; background:currentColor; }
.demo-status[data-status='paid'] { color:var(--rs-success); background:var(--rs-success-bg); }
.demo-status[data-status='unpaid'] { color:var(--rs-warning); background:var(--rs-warning-bg); }
.demo-view { display:inline-flex; align-items:center; gap:8px; min-height:36px; border:1px solid var(--rs-border); border-radius:8px; padding:0 12px; color:var(--rs-text); font-size:12px; text-decoration:none; }
.demo-view:hover { border-color:var(--rs-link); color:var(--rs-link); }
.demo-orders-footer { display:flex; justify-content:space-between; padding:16px 24px; border-top:1px solid var(--rs-border); color:var(--rs-muted); font-size:11px; }
@media(min-width:761px) and (max-width:1100px) { .demo-orders-table { font-size:12px; } .demo-orders-table th,.demo-orders-table td { padding-left:12px; padding-right:12px; } .demo-orders-table th { font-size:11px; } .demo-orders-table small { font-size:10px; } .demo-orders-table th:first-child,.demo-orders-table td:first-child { padding-left:18px; } .demo-view { padding:0 8px; gap:5px; } }
@media(max-width:760px) {
  .demo-orders-summary { padding:18px; }
  .demo-orders-table,.demo-orders-table tbody { display:block; width:100%; }
  .demo-orders-table thead,.demo-orders-table colgroup { display:none; }
  .demo-orders-table tr { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:14px 12px; padding:20px 18px; border-top:1px solid var(--rs-border); }
  .demo-orders-table td,.demo-orders-table td:first-child { display:block; height:auto; border:0; padding:0; }
  .demo-orders-table td[data-label]::before { content:attr(data-label); display:block; color:var(--rs-muted); font-size:11px; margin-bottom:7px; }
  .demo-orders-table .demo-order-cell { grid-column:1; grid-row:1; }
  .demo-orders-table .demo-action-cell { grid-column:2; grid-row:1; text-align:right; }
  .demo-orders-table .demo-customer-cell { grid-column:1; grid-row:2; }
  .demo-orders-table .demo-total { grid-column:2; grid-row:2; }
  .demo-orders-table .demo-payment-cell { grid-column:1 / -1; grid-row:3; }
  .demo-orders-table .demo-payment-cell::before { display:inline; margin-right:12px; }
  .demo-orders-footer { padding:16px 18px; }
}
@media(max-width:520px) { .rs-orders-toolbar { grid-template-columns:minmax(0,1fr); } }
</style>
