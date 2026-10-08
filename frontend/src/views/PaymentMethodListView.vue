<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import SellerLayout from '../layouts/SellerLayout.vue'
import PageHeader from '../components/ui/PageHeader.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import UiButton from '../components/ui/UiButton.vue'
import UiIcon from '../components/ui/UiIcon.vue'
import ConfirmDialog from '../components/ui/ConfirmDialog.vue'
import PaginationNav from '../components/PaginationNav.vue'
import {
  deletePaymentMethod,
  getPaymentMethods,
  updatePaymentMethodStatus
} from '../services/shopService.js'

const props = defineProps({
  currentUser: { type: Object, default: null },
  sessionLoading: Boolean
})
const emit = defineEmits(['open-auth'])
const route = useRoute()
const methods = ref([])
const loading = ref(false)
const busyIds = ref(new Set())
const error = ref('')
const notice = ref('')
const shopMissing = ref(false)
const search = ref('')
const page = ref(1)
const pagination = ref({ page: 1, limit: 8, totalItems: 0, totalPages: 1 })
const deleteTarget = ref(null)
const deleteError = ref('')
let loadVersion = 0
onBeforeUnmount(() => { loadVersion++ })
const pageInfo = computed(() => ({
  currentPage: page.value,
  totalPages: pagination.value.totalPages,
  totalItems: pagination.value.totalItems,
  hasPreviousPage: page.value > 1,
  hasNextPage: page.value < pagination.value.totalPages
}))

async function load(targetPage = page.value) {
  const version = ++loadVersion
  const userId = props.currentUser?.id
  const current = () => version === loadVersion && userId === props.currentUser?.id
  if (!props.currentUser || props.sessionLoading) return
  loading.value = true
  error.value = ''
  shopMissing.value = false
  try {
    const response = await getPaymentMethods({
      page: targetPage,
      limit: pagination.value.limit,
      q: search.value.trim()
    })
    if (!current()) return
    methods.value = response.data
    pagination.value = response.pagination
    page.value = response.pagination.page
  } catch (failure) {
    if (!current()) return
    shopMissing.value = failure.status === 404
    error.value = failure.message || 'Could not load payment methods.'
  } finally {
    if (current()) loading.value = false
  }
}

async function toggle(method) {
  const userId = props.currentUser?.id
  if (!userId || props.sessionLoading) return
  if (busyIds.value.has(method.id)) return
  busyIds.value = new Set([...busyIds.value, method.id])
  error.value = ''
  try {
    const response = await updatePaymentMethodStatus(method.id, !method.is_active)
    if (userId !== props.currentUser?.id) return
    Object.assign(method, response.data)
    notice.value = `${method.name} is now ${method.is_active ? 'enabled' : 'disabled'}.`
  } catch (failure) {
    if (userId !== props.currentUser?.id) return
    error.value = failure.message || 'Could not update the payment method.'
  } finally {
    const next = new Set(busyIds.value)
    next.delete(method.id)
    busyIds.value = next
  }
}

async function remove(method) {
  const userId = props.currentUser?.id
  if (!userId || props.sessionLoading) return
  if (busyIds.value.has(method.id)) return
  deleteError.value = ''
  busyIds.value = new Set([...busyIds.value, method.id])
  error.value = ''
  try {
    await deletePaymentMethod(method.id)
    if (userId !== props.currentUser?.id) return
    notice.value = `Deleted “${method.name}”.`
    deleteTarget.value = null
    await load(methods.value.length === 1 && page.value > 1 ? page.value - 1 : page.value)
  } catch (failure) {
    if (userId !== props.currentUser?.id) return
    deleteError.value = failure.message || 'Could not delete the payment method.'
  } finally {
    const next = new Set(busyIds.value)
    next.delete(method.id)
    busyIds.value = next
  }
}

watch(
  () => [props.currentUser?.id, props.sessionLoading],
  () => {
    methods.value = []
    deleteTarget.value = null
    notice.value = ''
    error.value = ''
    deleteError.value = ''
    loading.value = false
    shopMissing.value = false
    pagination.value = { page: 1, limit: 8, totalItems: 0, totalPages: 1 }
    page.value = 1
    load(1)
  },
  { immediate: true }
)
watch(() => route.query.saved, (value) => {
  if (value) notice.value = 'Payment method saved successfully.'
}, { immediate: true })
</script>


<template>
  <SellerLayout :current-user="currentUser" :session-loading="sessionLoading" @open-auth="emit('open-auth')">
    <PageHeader title="Payment methods" description="Choose how customers can pay for your products." eyebrow="Seller workspace / Payments">
      <RouterLink class="rs-button" :to="{ name: 'payment-method-create' }"><UiIcon name="plus" :size="18" />Add method</RouterLink>
    </PageHeader>
    <p v-if="notice" class="rs-alert rs-alert--success" role="status">{{ notice }}</p>
    <p v-if="error && !shopMissing" class="rs-alert rs-alert--error" role="alert">{{ error }} <button type="button" class="rs-button rs-button--quiet" :disabled="loading" @click="load()">Try again</button></p>
    <EmptyState v-if="shopMissing" title="Create your shop first" description="Payment methods belong to your shop. Set it up to get started." icon="store"><RouterLink class="rs-button" :to="{ name: 'my-shop' }">Set up shop</RouterLink></EmptyState>
    <section v-else class="rs-payments" aria-label="Payment methods" :aria-busy="loading">
      <form class="rs-payments__toolbar" role="search" @submit.prevent="load(1)">
        <label class="rs-sr-only" for="payment-search">Search payment methods</label>
        <input id="payment-search" v-model="search" class="rs-input" type="search" maxlength="100" placeholder="Search payment methods" />
        <UiButton type="submit" variant="secondary" :busy="loading">Search</UiButton>
      </form>
      <div v-if="loading" class="rs-payments__loading" role="status"><span class="rs-sr-only">Loading payment methods…</span><div v-for="row in 3" :key="row" class="rs-skeleton"></div></div>
      <div v-else-if="methods.length" class="rs-payments__table-wrap">
        <table class="rs-payments__table">
          <caption class="rs-sr-only">Your shop’s payment methods</caption>
          <thead><tr><th scope="col">Payment method</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
          <tbody><tr v-for="method in methods" :key="method.id">
            <td><div class="rs-payments__name"><span class="rs-payments__icon"><UiIcon name="credit" /></span><div><strong>{{ method.name }}</strong><small>Cash on delivery</small></div></div></td>
            <td><span class="rs-badge" :class="{ 'rs-badge--success': method.is_active }">{{ method.is_active ? 'Active' : 'Inactive' }}</span></td>
            <td><div class="rs-payments__actions">
              <UiButton variant="quiet" :busy="busyIds.has(method.id)" :aria-label="(method.is_active ? 'Disable ' : 'Enable ') + method.name" @click="toggle(method)">{{ method.is_active ? 'Disable' : 'Enable' }}</UiButton>
              <RouterLink class="rs-button rs-button--secondary" :aria-label="'Edit ' + method.name" :to="{ name: 'payment-method-edit', params: { id: method.id } }">Edit</RouterLink>
              <UiButton variant="danger" :disabled="busyIds.has(method.id)" :aria-label="'Delete ' + method.name" @click="deleteTarget = method; deleteError = ''">Delete</UiButton>
            </div></td>
          </tr></tbody>
        </table>
      </div>
      <EmptyState v-else-if="!error" :title="search.trim() ? 'No matching payment methods' : 'Set up your first payment method'" :description="search.trim() ? 'Try a different name or clear your search.' : 'Let customers pay in cash when their order arrives.'" icon="credit">
        <UiButton v-if="search.trim()" variant="secondary" @click="search = ''; load(1)">Clear search</UiButton>
        <RouterLink v-else class="rs-button" :to="{ name: 'payment-method-create' }">Add cash on delivery</RouterLink>
      </EmptyState>
      <PaginationNav :pagination="pageInfo" :disabled="loading" item-label="methods" @change="load" />
    </section>
    <ConfirmDialog :open="Boolean(deleteTarget)" :busy="Boolean(deleteTarget && busyIds.has(deleteTarget.id))" title="Delete payment method?" :description="deleteTarget ? 'Remove “' + deleteTarget.name + '” from your shop’s available payment methods?' : ''" :error="deleteError" @cancel="deleteTarget = null" @confirm="deleteTarget && remove(deleteTarget)" />
  </SellerLayout>
</template>
<style scoped>
.rs-payments { padding: 24px; border: 1px solid var(--rs-border); border-radius: 8px; background: var(--rs-surface); }
.rs-payments__toolbar { display: flex; gap: 12px; margin-bottom: 24px; }
.rs-payments__toolbar input { max-width: 400px; }
.rs-payments__table { width: 100%; border-collapse: collapse; text-align: left; }
.rs-payments__table th { color: var(--rs-muted); font-size: 13px; font-weight: 500; padding: 12px 0; border-bottom: 1px solid var(--rs-border); }
.rs-payments__table td { padding: 20px 0; border-bottom: 1px solid var(--rs-border); vertical-align: middle; }
.rs-payments__table td + td, .rs-payments__table th + th { padding-left: 24px; }
.rs-payments__table tr:last-child td { border-bottom: 0; }
.rs-payments__table th:last-child { text-align: right; }
.rs-payments__name { display: flex; align-items: center; gap: 12px; }
.rs-payments__name strong { font-size: 14px; font-weight: 600; color: var(--rs-text); overflow-wrap: anywhere; }
.rs-payments__name small { display: block; color: var(--rs-muted); font-size: 13px; margin-top: 4px; }
.rs-payments__icon { display: grid; place-items: center; width: 44px; height: 44px; flex-shrink: 0; border-radius: 6px; background: var(--rs-subtle); color: var(--rs-link); }
.rs-payments__actions { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
.rs-payments__actions .rs-button { font-size: 13px; padding-inline: 12px; }
.rs-payments__loading { display: grid; gap: 16px; }
.rs-payments__loading > div { height: 72px; }
@media (max-width: 1100px) and (min-width: 861px), (max-width: 640px) {
  .rs-payments__table, .rs-payments__table tbody { display: block; }
  .rs-payments__table thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  .rs-payments__table tr { display: grid; grid-template-columns: 1fr auto; gap: 16px; padding: 20px 0; border-bottom: 1px solid var(--rs-border); }
  .rs-payments__table tr:last-child { border-bottom: 0; }
  .rs-payments__table td, .rs-payments__table td + td { display: block; border: 0; padding: 0; }
  .rs-payments__table td:last-child { grid-column: 1 / -1; }
  .rs-payments__actions { justify-content: flex-start; }
}
@media (max-width: 640px) { .rs-payments { padding: 16px; } .rs-payments__toolbar { gap: 8px; } .rs-payments__icon { display: none; } }
</style>
