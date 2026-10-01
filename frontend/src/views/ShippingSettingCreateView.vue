<script setup>
import BackButton from '../components/BackButton.vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import ManagementSidebar from '../components/ManagementSidebar.vue'
import { createShippingRate, getCountries, getShippingMethods } from '../services/shopService.js'

const props = defineProps({
  currentUser: { type: Object, default: null },
  sessionLoading: { type: Boolean, default: false }
})

const emit = defineEmits(['open-auth'])
const router = useRouter()
const methods = ref([])
const countryTotal = ref(0)
const countryQuery = ref('')
const countrySuggestions = ref([])
const selectedCountries = ref([])
const suggestionsOpen = ref(false)
const searchingCountries = ref(false)
const loading = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const shopMissing = ref(false)
const form = ref({
  shipping_method_id: '',
  min_delivery_days: '3',
  max_delivery_days: '7',
  fixed_fee: '30000'
})

let searchTimer
let searchRequestId = 0

const readyToConfigure = computed(() => methods.value.length && countryTotal.value)
const availableSuggestions = computed(() => {
  const selectedIds = new Set(selectedCountries.value.map((country) => country.id))
  return countrySuggestions.value.filter((country) => !selectedIds.has(country.id))
})

async function loadOptions() {
  if (!props.currentUser || props.sessionLoading) return
  loading.value = true
  errorMessage.value = ''
  shopMissing.value = false
  try {
    const [methodResponse, countryResponse] = await Promise.all([
      getShippingMethods({ limit: 100 }),
      getCountries({ limit: 8 })
    ])
    methods.value = methodResponse.data
    countrySuggestions.value = countryResponse.data
    countryTotal.value = countryResponse.pagination.totalItems
    if (methods.value.length) form.value.shipping_method_id = String(methods.value[0].id)
  } catch (error) {
    if (error.status === 404) shopMissing.value = true
    else errorMessage.value = error.message || 'Could not load shipping settings data.'
  } finally {
    loading.value = false
  }
}

async function searchCountries(query) {
  const requestId = ++searchRequestId
  searchingCountries.value = true
  try {
    const response = await getCountries({ q: query.trim(), limit: 8 })
    if (requestId !== searchRequestId) return
    countrySuggestions.value = response.data
    suggestionsOpen.value = true
  } catch (error) {
    if (requestId === searchRequestId) {
      errorMessage.value = error.message || 'Could not search countries.'
    }
  } finally {
    if (requestId === searchRequestId) searchingCountries.value = false
  }
}

function addCountry(country) {
  if (!selectedCountries.value.some((item) => item.id === country.id)) {
    selectedCountries.value.push(country)
  }
  countryQuery.value = ''
  suggestionsOpen.value = false
}

function removeCountry(countryId) {
  selectedCountries.value = selectedCountries.value.filter((country) => country.id !== countryId)
}

function closeSuggestions() {
  window.setTimeout(() => { suggestionsOpen.value = false }, 120)
}

async function submitRate() {
  const methodId = Number(form.value.shipping_method_id)
  const minDays = Number(form.value.min_delivery_days)
  const maxDays = Number(form.value.max_delivery_days)
  const fixedFee = Number(form.value.fixed_fee)
  errorMessage.value = ''

  if (!Number.isSafeInteger(methodId) || methodId <= 0) {
    errorMessage.value = 'Please select a shipping method.'
    return
  }
  if (!selectedCountries.value.length) {
    errorMessage.value = 'Please select at least one country.'
    return
  }
  if (!Number.isInteger(minDays) || minDays < 0 || !Number.isInteger(maxDays) || maxDays < minDays) {
    errorMessage.value = 'Maximum days must be at least minimum days.'
    return
  }
  if (!Number.isFinite(fixedFee) || fixedFee < 0) {
    errorMessage.value = 'Fixed fee must be zero or greater.'
    return
  }

  saving.value = true
  try {
    await createShippingRate({
      shipping_method_id: methodId,
      country_ids: selectedCountries.value.map((country) => Number(country.id)),
      min_delivery_days: minDays,
      max_delivery_days: maxDays,
      fixed_fee: fixedFee
    })
    await router.push({ name: 'shipping-setting-list', query: { created: '1' } })
  } catch (error) {
    errorMessage.value = error.status === 409
      ? 'A selected country already has a rate for this method.'
      : error.message || 'Could not add shipping setting.'
  } finally {
    saving.value = false
  }
}

watch(
  () => [props.currentUser?.id, props.sessionLoading],
  ([userId, sessionLoading]) => { if (userId && !sessionLoading) loadOptions() },
  { immediate: true }
)

watch(countryQuery, (value) => {
  window.clearTimeout(searchTimer)
  if (!value.trim()) {
    searchRequestId += 1
    searchingCountries.value = false
    return
  }
  searchTimer = window.setTimeout(() => searchCountries(value), 250)
})

onBeforeUnmount(() => window.clearTimeout(searchTimer))
</script>

<template>
  <main class="setting-create-page">
    <section class="section setting-create-section">
      <div v-if="sessionLoading" class="profile-empty"><h3>Loading...</h3></div>
      <div v-else-if="!currentUser" class="profile-empty">
        <h3>Sign in to manage shipping settings</h3>
        <button type="button" @click="emit('open-auth')">Sign in</button>
      </div>
      <div v-else class="setting-create-layout">
        <ManagementSidebar />
        <div class="setting-create-content">
          <header class="setting-create-header">
            <BackButton :fallback="{ name: 'shipping-setting-list' }" />
            <h1>Add setting</h1>
          </header>

          <div v-if="loading" class="setting-create-panel">Loading data...</div>
          <section v-else class="setting-create-panel">
            <div v-if="shopMissing" class="setting-create-empty"><h2>No shop yet</h2></div>
            <div v-else-if="!readyToConfigure" class="setting-create-empty">
              <p>You need at least one method and one country.</p>
              <RouterLink v-if="!methods.length" :to="{ name: 'shipping-method-create' }">Add method</RouterLink>
              <RouterLink v-if="!countryTotal" :to="{ name: 'shipping-country-create' }">Add country</RouterLink>
            </div>
            <form v-else class="setting-create-form" @submit.prevent="submitRate">
              <div class="field setting-create-form__wide">
                <label for="rate-method">Method *</label>
                <select id="rate-method" v-model="form.shipping_method_id" required>
                  <option v-for="method in methods" :key="method.id" :value="String(method.id)">{{ method.name }}{{ method.status === 'inactive' ? ' (disabled)' : '' }}</option>
                </select>
              </div>

              <div class="field country-selector setting-create-form__wide">
                <label for="country-search">Country *</label>
                <div class="country-selector__control">
                  <div v-if="selectedCountries.length" class="country-selected" aria-label="Selected countries">
                    <div v-for="country in selectedCountries" :key="country.id" class="country-chip">
                      <strong>{{ country.country_code }}</strong>
                      <small>{{ country.name }}</small>
                      <button type="button" :aria-label="`Remove ${country.name}`" @click="removeCountry(country.id)">×</button>
                    </div>
                  </div>
                  <div class="country-autocomplete" @focusout="closeSuggestions">
                    <input
                      id="country-search"
                      v-model="countryQuery"
                      type="search"
                      autocomplete="off"
                      placeholder="Type a country name, e.g. Vietnam"
                      role="combobox"
                      aria-autocomplete="list"
                      :aria-expanded="suggestionsOpen"
                      aria-controls="country-suggestions"
                      @focus="suggestionsOpen = true"
                      @keydown.esc="suggestionsOpen = false"
                    />
                    <span v-if="searchingCountries" class="country-autocomplete__loading">Searching...</span>
                    <div v-if="suggestionsOpen" id="country-suggestions" class="country-suggestions" role="listbox">
                      <button
                        v-for="country in availableSuggestions"
                        :key="country.id"
                        type="button"
                        role="option"
                        @mousedown.prevent
                        @click="addCountry(country)"
                      >
                        <span><strong>{{ country.name }}</strong><small>{{ country.phone_code }}</small></span>
                        <b>{{ country.country_code }}</b>
                      </button>
                      <p v-if="!searchingCountries && !availableSuggestions.length">
                        {{ countryQuery.trim() ? 'No countries found' : 'No more countries to select' }}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div class="field">
                <label for="min-days">Minimum (days) *</label>
                <input id="min-days" v-model="form.min_delivery_days" min="0" max="365" type="number" required />
              </div>
              <div class="field">
                <label for="max-days">Maximum (days) *</label>
                <input id="max-days" v-model="form.max_delivery_days" min="0" max="365" type="number" required />
              </div>
              <div class="field setting-create-form__wide">
                <label for="fixed-fee">Fixed fee (VND) *</label>
                <input id="fixed-fee" v-model="form.fixed_fee" min="0" step="1000" type="number" required />
              </div>
              <p v-if="errorMessage" class="account-notice account-notice--error setting-create-form__wide" role="alert">{{ errorMessage }}</p>
              <div class="setting-create-actions setting-create-form__wide">
                <RouterLink :to="{ name: 'shipping-setting-list' }">Cancel</RouterLink>
                <button type="submit" :disabled="saving">{{ saving ? 'Saving...' : 'Save setting' }}</button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.setting-create-page { background: var(--rs-page); min-height: calc(100vh - 80px); }
.setting-create-section { padding-block: 26px 48px; }
.setting-create-layout { display: grid; gap: 20px; grid-template-columns: 260px minmax(0, 1fr); }
.setting-create-content { min-width: 0; }
.setting-create-header, .setting-create-panel { background: var(--rs-surface); border: 1px solid var(--rs-border); border-radius: 12px; }
.setting-create-header { align-items: baseline; display: flex; flex-wrap: wrap; gap: 8px 14px; margin-bottom: 14px; padding: 13px 16px; }
.setting-create-header a { color: var(--rs-muted); font-size: .78rem; text-decoration: none; }
.setting-create-header h1 { color: var(--rs-text); font-size: 1.2rem; margin: 0; white-space: nowrap; }
.setting-create-panel { padding: 20px; }
.setting-create-form { display: grid; gap: 14px; grid-template-columns: 1fr 1fr; max-width: 760px; }
.setting-create-form__wide { grid-column: 1 / -1; }
.country-selector__control { display: grid; gap: 9px; }
.country-selected { display: flex; flex-wrap: wrap; gap: 8px; }
.country-chip { background: var(--rs-subtle); border: 1px solid var(--rs-border); border-radius: 9px; display: grid; gap: 1px; min-width: 92px; padding: 9px 28px 8px 10px; position: relative; }
.country-chip strong { color: var(--rs-text); font-size: .84rem; }
.country-chip small { color: var(--rs-muted); font-size: .7rem; max-width: 125px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.country-chip button { align-items: center; background: transparent; border: 0; color: var(--rs-muted); cursor: pointer; display: flex; font-size: 1rem; height: 22px; justify-content: center; padding: 0; position: absolute; right: 4px; top: 3px; width: 22px; }
.country-chip button:hover { color: var(--rs-link); }
.country-autocomplete { position: relative; }
.country-autocomplete > input { box-sizing: border-box; width: 100%; }
.country-autocomplete__loading { color: var(--rs-muted); font-size: .72rem; position: absolute; right: 12px; top: 13px; }
.country-suggestions { background: var(--rs-surface); border: 1px solid var(--rs-border); border-radius: 9px; box-shadow: 0 12px 28px rgba(10, 37, 51, .13); left: 0; max-height: 250px; overflow-y: auto; padding: 5px; position: absolute; right: 0; top: calc(100% + 5px); z-index: 5; }
.country-suggestions button { align-items: center; background: var(--rs-surface); border: 0; border-radius: 7px; color: var(--rs-text); cursor: pointer; display: flex; justify-content: space-between; padding: 9px 10px; text-align: left; width: 100%; }
.country-suggestions button:hover, .country-suggestions button:focus-visible { background: var(--rs-surface); }
.country-suggestions button > span { display: grid; gap: 2px; }
.country-suggestions small { color: var(--rs-muted); font-size: .7rem; }
.country-suggestions b { background: var(--rs-subtle); border-radius: 5px; font-size: .72rem; padding: 4px 6px; }
.country-suggestions p { color: var(--rs-muted); font-size: .8rem; margin: 0; padding: 12px; text-align: center; }
.setting-create-actions { align-items: center; display: flex; gap: 10px; justify-content: flex-end; }
.setting-create-actions a { color: var(--rs-muted); font-size: .86rem; font-weight: 700; padding: 10px; text-decoration: none; }
.setting-create-actions button, .setting-create-empty a { background: var(--rs-solid); border: 0; border-radius: 9px; color: var(--rs-on-solid); cursor: pointer; display: inline-block; font-weight: 800; margin: 4px; padding: 11px 16px; text-decoration: none; }
.setting-create-actions button:disabled { cursor: wait; opacity: .6; }
.setting-create-empty { color: var(--rs-muted); padding: 20px; text-align: center; }
.setting-create-empty h2 { color: var(--rs-text); font-size: 1rem; }
@media (max-width: 860px) { .setting-create-layout { grid-template-columns: 1fr; } }
@media (max-width: 620px) { .setting-create-form { grid-template-columns: 1fr; } .setting-create-form__wide { grid-column: auto; } }
</style>
