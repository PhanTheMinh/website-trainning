<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import ManagementSidebar from '../components/ManagementSidebar.vue'
import { deleteShippingRate, getShippingRates } from '../services/shopService.js'

const props = defineProps({
  currentUser: { type: Object, default: null },
  sessionLoading: { type: Boolean, default: false }
})

const emit = defineEmits(['open-auth'])
const route = useRoute()
const rates = ref([])
const loading = ref(false)
const deletingIds = ref(new Set())
const errorMessage = ref('')
const notice = ref('')
const shopMissing = ref(false)
const draftSearch = ref('')
const searchTerm = ref('')
const pagination = ref({ page: 1, limit: 8, totalItems: 0, totalPages: 1 })
const moneyFormatter = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 })

const pageButtons = computed(() => {
  const total = pagination.value.totalPages
  const current = pagination.value.page
  const start = Math.max(1, Math.min(current - 2, total - 4))
  const end = Math.min(total, start + 4)
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
})

function deliveryLabel(rate) {
  return rate.min_delivery_days === rate.max_delivery_days
    ? `${rate.min_delivery_days} days`
    : `${rate.min_delivery_days}–${rate.max_delivery_days} days`
}

async function loadRates(page = pagination.value.page) {
  if (!props.currentUser || props.sessionLoading) return
  loading.value = true
  errorMessage.value = ''
  shopMissing.value = false
  try {
    const response = await getShippingRates({ page, limit: pagination.value.limit, q: searchTerm.value })
    rates.value = response.data
    pagination.value = response.pagination
  } catch (error) {
    if (error.status === 404) {
      shopMissing.value = true
      rates.value = []
    } else {
      errorMessage.value = error.message || 'Could not load shipping settings.'
    }
  } finally {
    loading.value = false
  }
}

function submitSearch() {
  searchTerm.value = draftSearch.value.trim()
  loadRates(1)
}

function goToPage(page) {
  if (page < 1 || page > pagination.value.totalPages || page === pagination.value.page) return
  loadRates(page)
}

async function removeRate(rate) {
  if (!window.confirm(`Delete setting for ${rate.shipping_method.name}?`)) return
  deletingIds.value = new Set([...deletingIds.value, rate.id])
  errorMessage.value = ''
  notice.value = ''
  try {
    await deleteShippingRate(rate.id)
    const targetPage = rates.value.length === 1 && pagination.value.page > 1
      ? pagination.value.page - 1
      : pagination.value.page
    await loadRates(targetPage)
    notice.value = 'Shipping setting deleted.'
  } catch (error) {
    errorMessage.value = error.message || 'Could not delete shipping setting.'
  } finally {
    const nextIds = new Set(deletingIds.value)
    nextIds.delete(rate.id)
    deletingIds.value = nextIds
  }
}

watch(
  () => [props.currentUser?.id, props.sessionLoading],
  ([userId, sessionLoading]) => { if (userId && !sessionLoading) loadRates(1) },
  { immediate: true }
)

watch(
  () => route.query.created,
  (created) => { if (created === '1') notice.value = 'Shipping setting added.' },
  { immediate: true }
)

watch(draftSearch, (value) => {
  if (!value.trim() && searchTerm.value) {
    searchTerm.value = ''
    loadRates(1)
  }
})
</script>

<template>
  <main class="setting-list-page">
    <section class="section setting-list-section">
      <div v-if="sessionLoading" class="profile-empty"><h3>Loading...</h3></div>
      <div v-else-if="!currentUser" class="profile-empty">
        <h3>Sign in to manage shipping settings</h3>
        <button type="button" @click="emit('open-auth')">Sign in</button>
      </div>
      <div v-else class="setting-list-layout">
        <ManagementSidebar />
        <div class="setting-list-content">
          <header class="setting-list-header">
            <h1>Settings list</h1>
            <RouterLink :to="{ name: 'shipping-setting-create' }">Add setting</RouterLink>
          </header>

          <div v-if="loading" class="setting-state" role="status">Loading shipping settings...</div>
          <div v-else-if="shopMissing" class="setting-state"><h2>No shop yet</h2></div>
          <section v-else class="setting-panel" aria-label="Shipping settings list">
            <form class="setting-search" role="search" @submit.prevent="submitSearch">
              <label class="sr-only" for="setting-search-input">Search by shipping method name</label>
              <input id="setting-search-input" v-model="draftSearch" type="search" placeholder="Search by method name..." />
              <button type="submit">Search</button>
            </form>

            <div class="setting-summary"><span>{{ pagination.totalItems }} settings</span><span>Page {{ pagination.page }} / {{ pagination.totalPages }}</span></div>

            <div v-if="rates.length" class="setting-records">
              <div class="setting-records__head" aria-hidden="true">
                <span>Method</span><span>Country</span><span>Delivery time</span><span>Fee</span><span></span>
              </div>
              <article v-for="rate in rates" :key="rate.id" class="setting-record">
                <div class="setting-record__method">
                  <RouterLink :to="{ name: 'shipping-setting-detail', params: { id: rate.id } }">
                    {{ rate.shipping_method.name }}
                  </RouterLink>
                  <small>{{ rate.shipping_method.status === 'active' ? 'Enabled' : 'Disabled' }}</small>
                </div>
                <div class="setting-record__countries" data-label="Country">
                  <span v-for="country in rate.countries" :key="country.id">{{ country.country_code }}</span>
                </div>
                <div class="setting-record__cell" data-label="Delivery time">{{ deliveryLabel(rate) }}</div>
                <div class="setting-record__cell setting-record__fee" data-label="Fee">{{ moneyFormatter.format(Number(rate.fixed_fee) || 0) }}</div>
                <div class="setting-record__action">
                  <button type="button" :disabled="deletingIds.has(rate.id)" @click="removeRate(rate)">{{ deletingIds.has(rate.id) ? 'Deleting...' : 'Delete' }}</button>
                </div>
              </article>
            </div>
            <div v-else class="setting-state">
              <h2>{{ searchTerm ? 'No settings found' : 'No shipping settings yet' }}</h2>
              <button v-if="searchTerm" type="button" @click="draftSearch = ''; searchTerm = ''; loadRates(1)">Clear search</button>
              <RouterLink v-else :to="{ name: 'shipping-setting-create' }">Add setting</RouterLink>
            </div>

            <nav class="setting-pagination" aria-label="Shipping settings pagination">
              <button type="button" :disabled="pagination.page === 1 || loading" @click="goToPage(pagination.page - 1)">Previous</button>
              <button v-for="page in pageButtons" :key="page" type="button" :class="{ 'is-active': page === pagination.page }" :aria-current="page === pagination.page ? 'page' : undefined" :disabled="loading" @click="goToPage(page)">{{ page }}</button>
              <button type="button" :disabled="pagination.page === pagination.totalPages || loading" @click="goToPage(pagination.page + 1)">Sau</button>
            </nav>
          </section>

          <p v-if="notice" class="account-notice account-notice--success" role="status">{{ notice }}</p>
          <p v-if="errorMessage" class="account-notice account-notice--error" role="alert">{{ errorMessage }}</p>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.setting-list-page { background: var(--rs-page); min-height: calc(100vh - 80px); }
.setting-list-section { padding-block: 26px 48px; }
.setting-list-layout { display: grid; gap: 20px; grid-template-columns: 260px minmax(0, 1fr); }
.setting-list-content { min-width: 0; }
.setting-list-header, .setting-panel, .setting-state { background: var(--rs-surface); border: 1px solid var(--rs-border); border-radius: 12px; }
.setting-list-header { align-items: center; display: flex; justify-content: space-between; margin-bottom: 14px; padding: 13px 16px; }
.setting-list-header h1 { color: var(--rs-text); font-size: 1.2rem; margin: 0; white-space: nowrap; }
.setting-list-header a, .setting-state a { background: var(--rs-solid); border-radius: 9px; color: var(--rs-on-solid); font-size: .85rem; font-weight: 800; padding: 10px 14px; text-decoration: none; }
.setting-panel { padding: 16px; }
.setting-search { display: grid; grid-template-columns: minmax(0, 1fr) auto; max-width: 620px; }
.setting-search input { border: 1px solid var(--rs-border); border-radius: 9px 0 0 9px; min-height: 42px; padding: 9px 11px; }
.setting-search button { background: var(--rs-solid); border: 0; border-radius: 0 9px 9px 0; color: var(--rs-on-solid); cursor: pointer; font-size: .84rem; font-weight: 800; padding: 10px 14px; }
.setting-summary { color: var(--rs-muted); display: flex; font-size: .8rem; justify-content: space-between; margin: 13px 0 10px; }
.setting-records { border: 1px solid var(--rs-border); border-radius: 9px; overflow: hidden; }
.setting-records__head, .setting-record { align-items: center; display: grid; gap: 12px; grid-template-columns: minmax(150px, 1.1fr) minmax(150px, 1.2fr) 100px 110px 62px; }
.setting-records__head { background: var(--rs-surface); color: var(--rs-muted); font-size: .72rem; font-weight: 800; padding: 10px 12px; text-transform: uppercase; }
.setting-record { border-top: 1px solid var(--rs-border); min-height: 62px; padding: 9px 12px; }
.setting-record__method { display: grid; gap: 3px; min-width: 0; }
.setting-record__method a { color: var(--rs-text); font-size: .86rem; font-weight: 800; overflow: hidden; text-decoration: none; text-overflow: ellipsis; white-space: nowrap; }
.setting-record__method a:hover { color: var(--rs-link); text-decoration: underline; }
.setting-record__method small { color: var(--rs-link); font-size: .68rem; font-weight: 800; }
.setting-record__countries { display: flex; flex-wrap: wrap; gap: 4px; }
.setting-record__countries span { background: var(--rs-subtle); border-radius: 5px; color: var(--rs-text); font-size: .7rem; font-weight: 850; padding: 3px 5px; }
.setting-record__cell { color: var(--rs-muted); font-size: .78rem; }
.setting-record__fee { color: var(--rs-text); font-weight: 800; }
.setting-record__action { text-align: right; }
.setting-record__action button { background: var(--rs-surface); border: 0; border-radius: 7px; color: var(--rs-link); cursor: pointer; font-size: .74rem; font-weight: 800; padding: 7px 9px; }
.setting-record__action button:disabled { cursor: wait; opacity: .6; }
.setting-state { color: var(--rs-muted); padding: 24px; text-align: center; }
.setting-state h2 { color: var(--rs-text); font-size: 1rem; margin: 0 0 12px; }
.setting-state > button { background: transparent; border: 0; color: var(--rs-link); cursor: pointer; font-weight: 800; }
.setting-pagination { display: flex; gap: 6px; justify-content: center; margin-top: 16px; }
.setting-pagination button { background: var(--rs-surface); border: 1px solid var(--rs-border); border-radius: 7px; color: var(--rs-muted); cursor: pointer; min-height: 34px; min-width: 36px; padding: 7px 9px; }
.setting-pagination button.is-active { background: var(--rs-solid); border-color: var(--rs-border); color: var(--rs-on-solid); font-weight: 800; }
.setting-pagination button:disabled { cursor: default; opacity: .45; }
.sr-only { clip: rect(0, 0, 0, 0); height: 1px; margin: -1px; overflow: hidden; position: absolute; width: 1px; }
@media (max-width: 860px) { .setting-list-layout { grid-template-columns: 1fr; } }
@media (max-width: 740px) {
  .setting-records { border: 0; display: grid; gap: 8px; overflow: visible; }
  .setting-records__head { display: none; }
  .setting-record { border: 1px solid var(--rs-border); border-radius: 9px; grid-template-columns: 1fr 1fr; padding: 12px; }
  .setting-record__method, .setting-record__countries { grid-column: 1 / -1; }
  .setting-record__cell::before { color: var(--rs-muted); content: attr(data-label); display: block; font-size: .68rem; margin-bottom: 3px; }
  .setting-record__action { grid-column: 2; text-align: right; }
  .setting-pagination { flex-wrap: wrap; }
}
</style>
