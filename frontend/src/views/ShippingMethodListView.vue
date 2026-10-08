<script setup>
import BackButton from '../components/BackButton.vue'
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import ManagementSidebar from '../components/ManagementSidebar.vue'
import { getShippingMethods, updateShippingMethodStatus } from '../services/shopService.js'

const props = defineProps({
  currentUser: { type: Object, default: null },
  sessionLoading: { type: Boolean, default: false }
})

const emit = defineEmits(['open-auth'])
const route = useRoute()
const methods = ref([])
const loading = ref(false)
const updatingIds = ref(new Set())
const loadError = ref('')
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

async function loadMethods(page = pagination.value.page) {
  if (!props.currentUser || props.sessionLoading) return
  loading.value = true
  loadError.value = ''
  shopMissing.value = false
  try {
    const response = await getShippingMethods({
      page,
      limit: pagination.value.limit,
      q: searchTerm.value,
      sort: 'name_asc'
    })
    methods.value = response.data
    pagination.value = response.pagination
  } catch (error) {
    if (error.status === 404) {
      shopMissing.value = true
      methods.value = []
    } else {
      loadError.value = error.message || 'Could not load shipping methods.'
    }
  } finally {
    loading.value = false
  }
}

function submitSearch() {
  searchTerm.value = draftSearch.value.trim()
  loadMethods(1)
}

function goToPage(page) {
  if (page < 1 || page > pagination.value.totalPages || page === pagination.value.page) return
  loadMethods(page)
}

async function toggleMethod(method) {
  if (updatingIds.value.has(method.id)) return
  const nextStatus = method.status === 'active' ? 'inactive' : 'active'
  updatingIds.value = new Set([...updatingIds.value, method.id])
  loadError.value = ''
  notice.value = ''
  try {
    await updateShippingMethodStatus(method.id, nextStatus)
    await loadMethods(pagination.value.page)
    notice.value = nextStatus === 'active' ? `Enabled “${method.name}”.` : `Disabled “${method.name}”.`
  } catch (error) {
    loadError.value = error.message || 'Could not update status.'
  } finally {
    const nextIds = new Set(updatingIds.value)
    nextIds.delete(method.id)
    updatingIds.value = nextIds
  }
}

watch(
  () => [props.currentUser?.id, props.sessionLoading],
  ([userId, sessionLoading]) => { if (userId && !sessionLoading) loadMethods() },
  { immediate: true }
)

watch(
  () => route.query.created,
  (createdName) => {
    if (typeof createdName === 'string' && createdName) notice.value = `Created “${createdName}”.`
  },
  { immediate: true }
)

watch(draftSearch, (value) => {
  if (!value.trim() && searchTerm.value) {
    searchTerm.value = ''
    loadMethods(1)
  }
})
</script>

<template>
  <main class="method-list-page">
    <section class="section method-list-section">
      <div v-if="sessionLoading" class="profile-empty"><h3>Loading shipping management...</h3></div>
      <div v-else-if="!currentUser" class="profile-empty">
        <h3>Sign in to manage shipping</h3>
        <button type="button" @click="emit('open-auth')">Sign in</button>
      </div>
      <div v-else class="method-list-layout">
        <ManagementSidebar />
        <div class="method-list-content">
          <header class="method-list-header">
            <div>
              <BackButton :fallback="{ name: 'management' }" />
              <h1>Method list</h1>
            </div>
            <RouterLink class="method-list-add" :to="{ name: 'shipping-method-create' }">Add method</RouterLink>
          </header>

          <div v-if="loading" class="method-list-state" role="status">Loading shipping methods...</div>
          <div v-else-if="shopMissing" class="method-list-state method-list-state--empty">
            <h2>No shop yet</h2><RouterLink :to="{ name: 'my-shop' }">Create shop</RouterLink>
          </div>
          <section v-else class="method-list-panel" aria-label="Shipping method list">
            <div class="method-list-tools">
              <form class="method-search" role="search" @submit.prevent="submitSearch">
                <label class="sr-only" for="method-search-input">Search by method name</label>
                <input id="method-search-input" v-model="draftSearch" type="search" placeholder="Search by method name..." />
                <button type="submit">Search</button>
              </form>
            </div>
            <div class="method-list-summary">
              <span>{{ pagination.totalItems }} methods</span>
              <span>Trang {{ pagination.page }} / {{ pagination.totalPages }}</span>
            </div>

            <div v-if="methods.length" class="method-records">
              <div class="method-records__head" aria-hidden="true">
                <span>Method</span>
                <span>Method code</span>
                <span>Status</span>
                <span>Controls</span>
              </div>
              <article
                v-for="method in methods"
                :key="method.id"
                class="method-record"
                :class="{ 'is-inactive': method.status === 'inactive' }"
              >
                <div class="method-record__name">
                  <h2>{{ method.name }}</h2>
                  <p v-if="method.description">{{ method.description }}</p>
                </div>
                <div class="method-record__cell" data-label="Method code">
                  <strong>{{ method.code }}</strong>
                </div>
                <div class="method-record__cell" data-label="Status">
                  <span class="method-status" :class="{ 'is-active': method.status === 'active' }">
                    {{ method.status === 'active' ? 'Enabled' : 'Disabled' }}
                  </span>
                </div>
                <div class="method-record__cell method-record__action" data-label="Controls">
                  <button
                    class="method-toggle"
                    :class="{ 'is-on': method.status === 'active' }"
                    type="button"
                    role="switch"
                    :aria-checked="method.status === 'active'"
                    :aria-label="`${method.status === 'active' ? 'Disable' : 'Enable'} ${method.name}`"
                    :disabled="updatingIds.has(method.id)"
                    @click="toggleMethod(method)"
                  ><span aria-hidden="true"></span></button>
                </div>
              </article>
            </div>
            <div v-else class="method-list-state method-list-state--empty">
              <h2>{{ searchTerm ? 'No methods found' : 'No shipping methods yet' }}</h2>
              <button v-if="searchTerm" type="button" @click="draftSearch = ''; searchTerm = ''; loadMethods(1)">Clear search</button>
              <RouterLink v-else :to="{ name: 'shipping-method-create' }">Add method</RouterLink>
            </div>

            <nav class="method-pagination" aria-label="Shipping methods pagination">
              <button type="button" :disabled="pagination.page === 1 || loading" @click="goToPage(pagination.page - 1)">Previous</button>
              <button
                v-for="page in pageButtons"
                :key="page"
                type="button"
                :class="{ 'is-active': page === pagination.page }"
                :aria-current="page === pagination.page ? 'page' : undefined"
                :disabled="loading"
                @click="goToPage(page)"
              >{{ page }}</button>
              <button type="button" :disabled="pagination.page === pagination.totalPages || loading" @click="goToPage(pagination.page + 1)">Sau</button>
            </nav>
          </section>

          <p v-if="notice" class="account-notice account-notice--success" role="status">{{ notice }}</p>
          <p v-if="loadError" class="account-notice account-notice--error" role="alert">{{ loadError }}</p>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.method-list-page { background: var(--rs-page); min-height: calc(100vh - 80px); }
.method-list-section { padding-block: 26px 48px; }
.method-list-layout { display: grid; gap: 20px; grid-template-columns: 260px minmax(0, 1fr); }
.method-list-content { min-width: 0; }
.method-list-header, .method-list-panel, .method-list-state { background: var(--rs-surface); border: 1px solid var(--rs-border); border-radius: 12px; }
.method-list-header { align-items: center; display: flex; justify-content: space-between; margin-bottom: 14px; padding: 13px 16px; }
.method-list-header div { align-items: baseline; display: flex; flex-wrap: wrap; gap: 8px 14px; min-width: 0; }
.method-list-header a:not(.method-list-add) { color: var(--rs-muted); font-size: 0.78rem; text-decoration: none; }
.method-list-header h1 { color: var(--rs-text); font-size: 1.2rem; margin: 0; white-space: nowrap; }
.method-list-add, .method-list-state a { background: var(--rs-solid); border-radius: 9px; color: var(--rs-on-solid); display: inline-block; font-size: 0.85rem; font-weight: 800; padding: 10px 14px; text-decoration: none; }
.method-list-panel { padding: 16px; }
.method-list-tools { max-width: 620px; }
.method-search { display: grid; grid-template-columns: minmax(0, 1fr) auto; }
.method-search input { background: var(--rs-surface); border: 1px solid var(--rs-border); border-radius: 9px 0 0 9px; box-sizing: border-box; color: var(--rs-text); min-height: 42px; padding: 9px 11px; width: 100%; }
.method-search button { background: var(--rs-solid); border: 0; color: var(--rs-on-solid); cursor: pointer; font-size: 0.84rem; font-weight: 800; min-height: 42px; padding: 10px 14px; }
.method-search button { border-radius: 0 9px 9px 0; }
.method-list-summary { color: var(--rs-muted); display: flex; font-size: 0.8rem; justify-content: space-between; margin: 13px 0 10px; }
.method-records { border: 1px solid var(--rs-border); border-radius: 9px; overflow: hidden; }
.method-records__head, .method-record { align-items: center; display: grid; gap: 14px; grid-template-columns: minmax(210px, 1.5fr) minmax(140px, 0.8fr) 105px 82px; }
.method-records__head { background: var(--rs-surface); color: var(--rs-muted); font-size: 0.74rem; font-weight: 800; padding: 10px 13px; text-transform: uppercase; }
.method-record { background: var(--rs-surface); border-top: 1px solid var(--rs-border); min-height: 66px; padding: 11px 13px; transition: background 160ms ease; }
.method-record:hover { background: var(--rs-surface); }
.method-record.is-inactive { background: var(--rs-success-bg); }
.method-record__name { min-width: 0; }
.method-record__name h2 { color: var(--rs-text); font-size: 0.9rem; margin: 0; }
.method-record__name p { color: var(--rs-muted); font-size: 0.76rem; line-height: 1.4; margin: 3px 0 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.method-record__cell { min-width: 0; }
.method-record__cell > strong { color: var(--rs-muted); display: block; font-size: 0.77rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.method-status { background: var(--rs-subtle); border-radius: 999px; color: var(--rs-muted); display: inline-block; font-size: 0.7rem; font-weight: 800; padding: 5px 8px; white-space: nowrap; }
.method-status.is-active { background: var(--rs-success-bg); color: var(--rs-success); }
.method-record__action { display: flex; justify-content: center; }
.method-toggle { background: var(--rs-subtle); border: 0; border-radius: 999px; cursor: pointer; flex: 0 0 auto; height: 28px; padding: 3px; width: 50px; }
.method-toggle span { background: var(--rs-surface); border-radius: 50%; display: block; height: 22px; transform: translateX(0); transition: transform 160ms ease; width: 22px; }
.method-toggle.is-on { background: var(--rs-solid); }
.method-toggle.is-on span { transform: translateX(22px); }
.method-toggle:disabled { cursor: wait; opacity: 0.55; }
.method-list-state { color: var(--rs-muted); padding: 24px; text-align: center; }
.method-list-state--empty h2 { color: var(--rs-text); font-size: 1rem; margin: 0 0 12px; }
.method-list-state--empty button { background: transparent; border: 0; color: var(--rs-link); cursor: pointer; font-weight: 800; }
.method-pagination { display: flex; gap: 6px; justify-content: center; margin-top: 16px; }
.method-pagination button { background: var(--rs-surface); border: 1px solid var(--rs-border); border-radius: 7px; color: var(--rs-muted); cursor: pointer; min-height: 34px; min-width: 36px; padding: 7px 9px; }
.method-pagination button.is-active { background: var(--rs-solid); border-color: var(--rs-border); color: var(--rs-on-solid); font-weight: 800; }
.method-pagination button:disabled { cursor: default; opacity: 0.45; }
.sr-only { clip: rect(0, 0, 0, 0); height: 1px; margin: -1px; overflow: hidden; position: absolute; width: 1px; }
@media (max-width: 860px) { .method-list-layout { grid-template-columns: 1fr; } }
@media (max-width: 720px) {
  .method-records { border: 0; display: grid; gap: 8px; overflow: visible; }
  .method-records__head { display: none; }
  .method-record { border: 1px solid var(--rs-border); border-radius: 9px; gap: 9px; grid-template-columns: 1fr auto; padding: 12px; }
  .method-record__name { grid-column: 1 / -1; }
  .method-record__cell::before { color: var(--rs-muted); content: attr(data-label); display: block; font-size: 0.68rem; margin-bottom: 3px; }
  .method-record__action { align-items: flex-end; grid-column: 2; grid-row: 2 / span 2; }
}
@media (max-width: 620px) { .method-list-header { align-items: flex-start; gap: 12px; } .method-pagination { flex-wrap: wrap; } }
</style>
