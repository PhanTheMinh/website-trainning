<script setup>
import BackButton from '../components/BackButton.vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import ManagementSidebar from '../components/ManagementSidebar.vue'
import {
  getCountries,
  getShippingMethods,
  getShippingRate,
  updateShippingRate
} from '../services/shopService.js'

const props = defineProps({
  currentUser: { type: Object, default: null },
  sessionLoading: { type: Boolean, default: false }
})

const emit = defineEmits(['open-auth'])
const route = useRoute()
const methods = ref([])
const selectedCountries = ref([])
const countrySuggestions = ref([])
const countryQuery = ref('')
const suggestionsOpen = ref(false)
const searchingCountries = ref(false)
const loading = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const notice = ref('')
const notFound = ref(false)
const form = ref({ shipping_method_id: '', min_delivery_days: '', max_delivery_days: '', fixed_fee: '' })
let searchTimer
let searchRequestId = 0

const availableSuggestions = computed(() => {
  const selectedIds = new Set(selectedCountries.value.map((country) => country.id))
  return countrySuggestions.value.filter((country) => !selectedIds.has(country.id))
})

async function loadDetail() {
  if (!props.currentUser || props.sessionLoading) return
  const rateId = Number(route.params.id)
  if (!Number.isSafeInteger(rateId) || rateId <= 0) {
    notFound.value = true
    return
  }
  loading.value = true
  errorMessage.value = ''
  notFound.value = false
  try {
    const [rateResponse, methodResponse, countryResponse] = await Promise.all([
      getShippingRate(rateId),
      getShippingMethods({ limit: 100 }),
      getCountries({ limit: 8 })
    ])
    const rate = rateResponse.data
    methods.value = methodResponse.data
    countrySuggestions.value = countryResponse.data
    selectedCountries.value = rate.countries
    form.value = {
      shipping_method_id: String(rate.shipping_method_id),
      min_delivery_days: String(rate.min_delivery_days),
      max_delivery_days: String(rate.max_delivery_days),
      fixed_fee: String(Number(rate.fixed_fee))
    }
  } catch (error) {
    if (error.status === 404) notFound.value = true
    else errorMessage.value = error.message || 'Could not load setting details.'
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
    if (requestId === searchRequestId) errorMessage.value = error.message || 'Could not search countries.'
  } finally {
    if (requestId === searchRequestId) searchingCountries.value = false
  }
}

function addCountry(country) {
  if (!selectedCountries.value.some((item) => item.id === country.id)) selectedCountries.value.push(country)
  countryQuery.value = ''
  suggestionsOpen.value = false
}

function removeCountry(countryId) {
  selectedCountries.value = selectedCountries.value.filter((country) => country.id !== countryId)
}

function closeSuggestions() {
  window.setTimeout(() => { suggestionsOpen.value = false }, 120)
}

async function saveRate() {
  const methodId = Number(form.value.shipping_method_id)
  const minDays = Number(form.value.min_delivery_days)
  const maxDays = Number(form.value.max_delivery_days)
  const fixedFee = Number(form.value.fixed_fee)
  errorMessage.value = ''
  notice.value = ''

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
    const response = await updateShippingRate(route.params.id, {
      shipping_method_id: methodId,
      country_ids: selectedCountries.value.map((country) => Number(country.id)),
      min_delivery_days: minDays,
      max_delivery_days: maxDays,
      fixed_fee: fixedFee
    })
    selectedCountries.value = response.data.countries
    notice.value = 'Shipping setting updated.'
  } catch (error) {
    errorMessage.value = error.status === 409
      ? 'A selected country already has a rate for this method.'
      : error.message || 'Could not update setting.'
  } finally {
    saving.value = false
  }
}

watch(
  () => [props.currentUser?.id, props.sessionLoading, route.params.id],
  ([userId, sessionLoading]) => { if (userId && !sessionLoading) loadDetail() },
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
  <main class="setting-detail-page">
    <section class="section setting-detail-section">
      <div v-if="sessionLoading" class="profile-empty"><h3>Loading...</h3></div>
      <div v-else-if="!currentUser" class="profile-empty">
        <h3>Sign in to view shipping settings</h3>
        <button type="button" @click="emit('open-auth')">Sign in</button>
      </div>
      <div v-else class="setting-detail-layout">
        <ManagementSidebar />
        <div class="setting-detail-content">
          <header class="setting-detail-header">
            <BackButton :fallback="{ name: 'shipping-setting-list' }" />
            <h1>Setting details</h1>
          </header>
          <div v-if="loading" class="setting-detail-panel">Loading details...</div>
          <div v-else-if="notFound" class="setting-detail-panel setting-detail-empty">
            <h2>No settings found</h2>
            <BackButton :fallback="{ name: 'shipping-setting-list' }" />
          </div>
          <form v-else class="setting-detail-panel setting-detail-form" @submit.prevent="saveRate">
            <div class="field setting-detail-form__wide">
              <label for="detail-method">Method *</label>
              <select id="detail-method" v-model="form.shipping_method_id" required>
                <option v-for="method in methods" :key="method.id" :value="String(method.id)">{{ method.name }}{{ method.status === 'inactive' ? ' (disabled)' : '' }}</option>
              </select>
            </div>

            <div class="field country-selector setting-detail-form__wide">
              <label for="detail-country-search">Country *</label>
              <div class="country-selected">
                <div v-for="country in selectedCountries" :key="country.id" class="country-chip">
                  <strong>{{ country.country_code }}</strong><small>{{ country.name }}</small>
                  <button type="button" :aria-label="`Remove ${country.name}`" @click="removeCountry(country.id)">×</button>
                </div>
              </div>
              <div class="country-autocomplete" @focusout="closeSuggestions">
                <input id="detail-country-search" v-model="countryQuery" type="search" autocomplete="off" placeholder="Type a country name to add" role="combobox" :aria-expanded="suggestionsOpen" aria-controls="detail-country-suggestions" @focus="suggestionsOpen = true" @keydown.esc="suggestionsOpen = false" />
                <span v-if="searchingCountries" class="country-autocomplete__loading">Searching...</span>
                <div v-if="suggestionsOpen" id="detail-country-suggestions" class="country-suggestions" role="listbox">
                  <button v-for="country in availableSuggestions" :key="country.id" type="button" role="option" @mousedown.prevent @click="addCountry(country)">
                    <span><strong>{{ country.name }}</strong><small>{{ country.phone_code }}</small></span><b>{{ country.country_code }}</b>
                  </button>
                  <p v-if="!searchingCountries && !availableSuggestions.length">{{ countryQuery.trim() ? 'No countries found' : 'No more countries to select' }}</p>
                </div>
              </div>
            </div>

            <div class="field"><label for="detail-min-days">Minimum (days) *</label><input id="detail-min-days" v-model="form.min_delivery_days" min="0" max="365" type="number" required /></div>
            <div class="field"><label for="detail-max-days">Maximum (days) *</label><input id="detail-max-days" v-model="form.max_delivery_days" min="0" max="365" type="number" required /></div>
            <div class="field setting-detail-form__wide"><label for="detail-fee">Fixed fee (VND) *</label><input id="detail-fee" v-model="form.fixed_fee" min="0" step="1000" type="number" required /></div>
            <p v-if="notice" class="account-notice account-notice--success setting-detail-form__wide" role="status">{{ notice }}</p>
            <p v-if="errorMessage" class="account-notice account-notice--error setting-detail-form__wide" role="alert">{{ errorMessage }}</p>
            <div class="setting-detail-actions setting-detail-form__wide">
              <RouterLink :to="{ name: 'shipping-setting-list' }">Cancel</RouterLink>
              <button type="submit" :disabled="saving">{{ saving ? 'Saving...' : 'Save changes' }}</button>
            </div>
          </form>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.setting-detail-page { background: var(--rs-page); min-height: calc(100vh - 80px); }
.setting-detail-section { padding-block: 26px 48px; }
.setting-detail-layout { display: grid; gap: 20px; grid-template-columns: 260px minmax(0, 1fr); }
.setting-detail-content { min-width: 0; }
.setting-detail-header, .setting-detail-panel { background: var(--rs-surface); border: 1px solid var(--rs-border); border-radius: 12px; }
.setting-detail-header { align-items: baseline; display: flex; flex-wrap: wrap; gap: 8px 14px; margin-bottom: 14px; padding: 13px 16px; }
.setting-detail-header a { color: var(--rs-muted); font-size: .78rem; text-decoration: none; }
.setting-detail-header h1 { color: var(--rs-text); font-size: 1.2rem; margin: 0; white-space: nowrap; }
.setting-detail-panel { padding: 20px; }
.setting-detail-form { display: grid; gap: 14px; grid-template-columns: 1fr 1fr; max-width: 760px; }
.setting-detail-form__wide { grid-column: 1 / -1; }
.country-selected { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 9px; }
.country-chip { background: var(--rs-subtle); border: 1px solid var(--rs-border); border-radius: 9px; display: grid; gap: 1px; min-width: 92px; padding: 9px 28px 8px 10px; position: relative; }
.country-chip strong { color: var(--rs-text); font-size: .84rem; }
.country-chip small { color: var(--rs-muted); font-size: .7rem; }
.country-chip button { background: transparent; border: 0; color: var(--rs-muted); cursor: pointer; font-size: 1rem; position: absolute; right: 5px; top: 3px; }
.country-autocomplete { position: relative; }
.country-autocomplete > input { box-sizing: border-box; width: 100%; }
.country-autocomplete__loading { color: var(--rs-muted); font-size: .72rem; position: absolute; right: 12px; top: 13px; }
.country-suggestions { background: var(--rs-surface); border: 1px solid var(--rs-border); border-radius: 9px; box-shadow: 0 12px 28px rgba(10,37,51,.13); left: 0; max-height: 250px; overflow-y: auto; padding: 5px; position: absolute; right: 0; top: calc(100% + 5px); z-index: 5; }
.country-suggestions button { align-items: center; background: var(--rs-surface); border: 0; border-radius: 7px; color: var(--rs-text); cursor: pointer; display: flex; justify-content: space-between; padding: 9px 10px; text-align: left; width: 100%; }
.country-suggestions button:hover { background: var(--rs-surface); }
.country-suggestions button > span { display: grid; gap: 2px; }
.country-suggestions small, .country-suggestions p { color: var(--rs-muted); font-size: .7rem; }
.country-suggestions b { background: var(--rs-subtle); border-radius: 5px; font-size: .72rem; padding: 4px 6px; }
.country-suggestions p { margin: 0; padding: 12px; text-align: center; }
.setting-detail-actions { align-items: center; display: flex; gap: 10px; justify-content: flex-end; }
.setting-detail-actions a { color: var(--rs-muted); font-size: .86rem; font-weight: 700; padding: 10px; text-decoration: none; }
.setting-detail-actions button, .setting-detail-empty a { background: var(--rs-solid); border: 0; border-radius: 9px; color: var(--rs-on-solid); cursor: pointer; font-weight: 800; padding: 11px 16px; text-decoration: none; }
.setting-detail-actions button:disabled { cursor: wait; opacity: .6; }
.setting-detail-empty { color: var(--rs-muted); text-align: center; }
.setting-detail-empty h2 { color: var(--rs-text); font-size: 1rem; }
@media (max-width: 860px) { .setting-detail-layout { grid-template-columns: 1fr; } }
@media (max-width: 620px) { .setting-detail-form { grid-template-columns: 1fr; } .setting-detail-form__wide { grid-column: auto; } }
</style>
