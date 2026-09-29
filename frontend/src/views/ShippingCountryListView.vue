<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import ManagementSidebar from '../components/ManagementSidebar.vue'
import { deleteCountry, getCountries } from '../services/shopService.js'

const props = defineProps({
  currentUser: { type: Object, default: null },
  sessionLoading: { type: Boolean, default: false }
})

const emit = defineEmits(['open-auth'])
const route = useRoute()
const countries = ref([])
const loading = ref(false)
const deletingIds = ref(new Set())
const errorMessage = ref('')
const notice = ref('')
const shopMissing = ref(false)
const draftSearch = ref('')
const searchTerm = ref('')
const pagination = ref({ page: 1, limit: 8, totalItems: 0, totalPages: 1 })

const pageButtons = computed(() => {
  const total = pagination.value.totalPages
  const current = pagination.value.page
  const start = Math.max(1, Math.min(current - 2, total - 4))
  const end = Math.min(total, start + 4)
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
})

async function loadCountries(page = pagination.value.page) {
  if (!props.currentUser || props.sessionLoading) return
  loading.value = true
  errorMessage.value = ''
  shopMissing.value = false
  try {
    const response = await getCountries({
      page,
      limit: pagination.value.limit,
      q: searchTerm.value
    })
    countries.value = response.data
    pagination.value = response.pagination
  } catch (error) {
    if (error.status === 404) {
      shopMissing.value = true
      countries.value = []
    } else {
      errorMessage.value = error.message || 'Could not load countries.'
    }
  } finally {
    loading.value = false
  }
}

function submitSearch() {
  searchTerm.value = draftSearch.value.trim()
  loadCountries(1)
}

function goToPage(page) {
  if (page < 1 || page > pagination.value.totalPages || page === pagination.value.page) return
  loadCountries(page)
}

async function removeCountry(country) {
  if (!window.confirm(`Delete ${country.name} from the country list?`)) return
  deletingIds.value = new Set([...deletingIds.value, country.id])
  errorMessage.value = ''
  notice.value = ''
  try {
    await deleteCountry(country.id)
    const targetPage = countries.value.length === 1 && pagination.value.page > 1
      ? pagination.value.page - 1
      : pagination.value.page
    await loadCountries(targetPage)
    notice.value = `Deleted ${country.name}.`
  } catch (error) {
    errorMessage.value = error.status === 409
      ? 'This country is in use and cannot be deleted.'
      : error.message || 'Could not delete country.'
  } finally {
    const nextIds = new Set(deletingIds.value)
    nextIds.delete(country.id)
    deletingIds.value = nextIds
  }
}

watch(
  () => [props.currentUser?.id, props.sessionLoading],
  ([userId, sessionLoading]) => { if (userId && !sessionLoading) loadCountries(1) },
  { immediate: true }
)

watch(
  () => route.query.created,
  (countryName) => {
    if (typeof countryName === 'string' && countryName) notice.value = `Added ${countryName}.`
  },
  { immediate: true }
)

watch(draftSearch, (value) => {
  if (!value.trim() && searchTerm.value) {
    searchTerm.value = ''
    loadCountries(1)
  }
})
</script>

<template>
  <main class="country-list-page">
    <section class="section country-list-section">
      <div v-if="sessionLoading" class="profile-empty"><h3>Loading...</h3></div>
      <div v-else-if="!currentUser" class="profile-empty">
        <h3>Sign in to manage countries</h3>
        <button type="button" @click="emit('open-auth')">Sign in</button>
      </div>
      <div v-else class="country-list-layout">
        <ManagementSidebar />
        <div class="country-list-content">
          <header class="country-list-header">
            <h1>Country list</h1>
            <RouterLink :to="{ name: 'shipping-country-create' }">Add country</RouterLink>
          </header>

          <div v-if="loading" class="country-state" role="status">Loading countries...</div>
          <div v-else-if="shopMissing" class="country-state"><h2>No shop yet</h2></div>
          <section v-else class="country-panel" aria-label="Country list">
            <form class="country-search" role="search" @submit.prevent="submitSearch">
              <label class="sr-only" for="country-search-input">Search by country name</label>
              <input id="country-search-input" v-model="draftSearch" type="search" placeholder="Search by country name..." />
              <button type="submit">Search</button>
            </form>

            <div class="country-summary">
              <span>{{ pagination.totalItems }} countries</span>
              <span>Trang {{ pagination.page }} / {{ pagination.totalPages }}</span>
            </div>

            <div v-if="countries.length" class="country-records">
              <div class="country-records__head" aria-hidden="true">
                <span>Country</span><span>Country code</span><span>Phone code</span><span></span>
              </div>
              <article v-for="country in countries" :key="country.id" class="country-record">
                <strong class="country-record__name">{{ country.name }}</strong>
                <div data-label="Country code"><span class="country-code">{{ country.country_code }}</span></div>
                <div data-label="Phone code"><span>{{ country.phone_code }}</span></div>
                <div class="country-record__action">
                  <button type="button" :disabled="deletingIds.has(country.id)" @click="removeCountry(country)">
                    {{ deletingIds.has(country.id) ? 'Deleting...' : 'Delete' }}
                  </button>
                </div>
              </article>
            </div>
            <div v-else class="country-state">
              <h2>{{ searchTerm ? 'No countries found' : 'No countries yet' }}</h2>
              <button v-if="searchTerm" type="button" @click="draftSearch = ''; searchTerm = ''; loadCountries(1)">Clear search</button>
              <RouterLink v-else :to="{ name: 'shipping-country-create' }">Add country</RouterLink>
            </div>

            <nav class="country-pagination" aria-label="Countries pagination">
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
.country-list-page { background: var(--rs-page); min-height: calc(100vh - 80px); }
.country-list-section { padding-block: 26px 48px; }
.country-list-layout { display: grid; gap: 20px; grid-template-columns: 260px minmax(0, 1fr); }
.country-list-content { min-width: 0; }
.country-list-header, .country-panel, .country-state { background: var(--rs-surface); border: 1px solid var(--rs-border); border-radius: 12px; }
.country-list-header { align-items: center; display: flex; justify-content: space-between; margin-bottom: 14px; padding: 13px 16px; }
.country-list-header h1 { color: var(--rs-text); font-size: 1.2rem; margin: 0; white-space: nowrap; }
.country-list-header a, .country-state a { background: var(--rs-solid); border-radius: 9px; color: var(--rs-on-solid); font-size: .85rem; font-weight: 800; padding: 10px 14px; text-decoration: none; }
.country-panel { padding: 16px; }
.country-search { display: grid; grid-template-columns: minmax(0, 1fr) auto; max-width: 620px; }
.country-search input { border: 1px solid var(--rs-border); border-radius: 9px 0 0 9px; min-height: 42px; padding: 9px 11px; }
.country-search button { background: var(--rs-solid); border: 0; border-radius: 0 9px 9px 0; color: var(--rs-on-solid); cursor: pointer; font-size: .84rem; font-weight: 800; padding: 10px 14px; }
.country-summary { color: var(--rs-muted); display: flex; font-size: .8rem; justify-content: space-between; margin: 13px 0 10px; }
.country-records { border: 1px solid var(--rs-border); border-radius: 9px; overflow: hidden; }
.country-records__head, .country-record { align-items: center; display: grid; gap: 14px; grid-template-columns: minmax(210px, 1.5fr) 130px 120px 75px; }
.country-records__head { background: var(--rs-surface); color: var(--rs-muted); font-size: .74rem; font-weight: 800; padding: 10px 13px; text-transform: uppercase; }
.country-record { border-top: 1px solid var(--rs-border); min-height: 58px; padding: 8px 13px; }
.country-record__name { color: var(--rs-text); font-size: .9rem; }
.country-code { background: var(--rs-subtle); border-radius: 6px; color: var(--rs-text); font-size: .76rem; font-weight: 900; padding: 4px 7px; }
.country-record__action { text-align: right; }
.country-record__action button { background: var(--rs-surface); border: 0; border-radius: 7px; color: var(--rs-link); cursor: pointer; font-size: .76rem; font-weight: 800; padding: 7px 10px; }
.country-record__action button:disabled { cursor: wait; opacity: .6; }
.country-state { color: var(--rs-muted); padding: 24px; text-align: center; }
.country-state h2 { color: var(--rs-text); font-size: 1rem; margin: 0 0 12px; }
.country-state > button { background: transparent; border: 0; color: var(--rs-link); cursor: pointer; font-weight: 800; }
.country-pagination { display: flex; gap: 6px; justify-content: center; margin-top: 16px; }
.country-pagination button { background: var(--rs-surface); border: 1px solid var(--rs-border); border-radius: 7px; color: var(--rs-muted); cursor: pointer; min-height: 34px; min-width: 36px; padding: 7px 9px; }
.country-pagination button.is-active { background: var(--rs-solid); border-color: var(--rs-border); color: var(--rs-on-solid); font-weight: 800; }
.country-pagination button:disabled { cursor: default; opacity: .45; }
.sr-only { clip: rect(0, 0, 0, 0); height: 1px; margin: -1px; overflow: hidden; position: absolute; width: 1px; }
@media (max-width: 860px) { .country-list-layout { grid-template-columns: 1fr; } }
@media (max-width: 680px) {
  .country-records { border: 0; display: grid; gap: 8px; overflow: visible; }
  .country-records__head { display: none; }
  .country-record { border: 1px solid var(--rs-border); border-radius: 9px; grid-template-columns: 1fr auto; padding: 12px; }
  .country-record__name { grid-column: 1 / -1; }
  .country-record > div::before { color: var(--rs-muted); content: attr(data-label); display: block; font-size: .68rem; margin-bottom: 4px; }
  .country-record__action { grid-column: 2; grid-row: 2 / span 2; }
  .country-record__action::before { display: none !important; }
  .country-pagination { flex-wrap: wrap; }
}
</style>
