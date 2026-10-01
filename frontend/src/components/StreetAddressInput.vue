<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { getStreetList } from '../services/checkoutService.js'

const props = defineProps({ modelValue: { type: String, default: '' }, country: String, province: String, city: String })
const emit = defineEmits(['update:modelValue'])
const streets = ref([])
const loading = ref(false)
const message = ref('')
const panelOpen = ref(false)
const activeIndex = ref(-1)
const showAll = ref(true)
const query = value => String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/gi, 'd').toLowerCase()
const suggestions = computed(() => streets.value.filter(street => showAll.value || query(street).includes(query(props.modelValue.trim()))).map(street => ({ street })))
let controller, sequence = 0
function cancel() {
  controller?.abort()
  sequence++
  loading.value = false
  activeIndex.value = -1
}
async function loadList() {
  cancel()
  streets.value = []
  message.value = ''
  if (!props.country || !props.city) { message.value = 'Select a country and city first.'; return }
  const key = sequence
  controller = new AbortController()
  loading.value = true
  try {
    const response = await getStreetList({ country_code: props.country, province_state: props.province || '', city: props.city }, { signal: controller.signal })
    if (key !== sequence) return
    streets.value = (response.data.streets || []).filter(street => typeof street === 'string')
    message.value = response.data.reason === 'boundary_unavailable' ? 'No matching city boundary is available in the map data. Enter your street manually.'
      : !streets.value.length ? 'No named streets are available for this city yet. Enter your street manually.' : ''
  } catch {
    if (key === sequence) message.value = 'Could not download this city’s streets. Retry or enter your street manually.'
  } finally { if (key === sequence) loading.value = false }
}
function selectStreet(event) {
  if (!event.target.value) return
  panelOpen.value = false
  emit('update:modelValue', event.target.value)
  activeIndex.value = -1
}
function closePanel() {
  panelOpen.value = false
  activeIndex.value = -1
}
function openPanel() {
  panelOpen.value = true
  showAll.value = true
}
function togglePanel() {
  if (panelOpen.value) closePanel()
  else openPanel()
}
function inputStreet(event) {
  panelOpen.value = true
  showAll.value = false
  activeIndex.value = -1
  emit('update:modelValue', event.target.value)
}
function moveOption(direction) {
  if (!panelOpen.value) { openPanel(); return }
  if (suggestions.value.length) activeIndex.value = (activeIndex.value + direction + suggestions.value.length) % suggestions.value.length
}
function acceptOption(event) {
  if (panelOpen.value && activeIndex.value >= 0) {
    event.preventDefault()
    selectStreet({ target: { value: suggestions.value[activeIndex.value].street } })
  }
}
function focusOut(event) {
  if (!event.currentTarget.contains(event.relatedTarget)) closePanel()
}
watch(() => [props.country, props.province, props.city], () => { closePanel(); showAll.value = true; loadList() }, { immediate: true })
onBeforeUnmount(cancel)
</script>

<template>
  <div class="street-address-input" @focusout="focusOut">
    <label for="checkout-street">Street *</label>
    <div class="street-control">
      <input id="checkout-street" :value="modelValue" name="street" type="text" autocomplete="address-line1"
        maxlength="200" placeholder="Street name" required role="combobox" aria-autocomplete="list"
        :aria-expanded="panelOpen" aria-controls="street-options" :aria-activedescendant="activeIndex >= 0 ? `street-option-${activeIndex}` : undefined"
        @input="inputStreet" @keydown.down.prevent="moveOption(1)" @keydown.up.prevent="moveOption(-1)" @keydown.enter="acceptOption" @keydown.esc="closePanel" />
      <button type="button" class="street-toggle" aria-label="Show street suggestions" :aria-expanded="panelOpen" aria-controls="street-options" @click="togglePanel" @keydown.esc="closePanel">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </button>
    </div>
    <div v-if="panelOpen" class="street-search-panel" @keydown.esc="closePanel">
      <ul id="street-options" role="listbox" aria-label="Street suggestions">
        <li v-for="(suggestion, index) in suggestions" :id="`street-option-${index}`" :key="suggestion.street" role="option" :aria-selected="activeIndex === index" :class="{ 'is-active': activeIndex === index }" @mousedown.prevent @click="selectStreet({ target: { value: suggestion.street } })">{{ suggestion.street }}</li>
      </ul>
      <small v-if="loading || message || !suggestions.length" role="status">{{ loading ? 'Downloading this city’s streets…' : message || 'No matching streets. You can enter your street manually.' }}</small>
      <button v-if="message && country && city && !loading" class="street-retry" type="button" @click="loadList">Retry download</button>
    </div>
  </div>
</template>

<style scoped>
.street-address-input { position: relative; display: grid; gap: 6px; min-width: 0; align-content: start; }
.street-control { position: relative; }
.street-control input { padding-right: 42px; }
.street-toggle { position: absolute; right: 1px; top: 1px; width: 40px; height: 40px; border: 0; border-radius: 0 5px 5px 0; display: grid; place-items: center; color: var(--rs-text); background: var(--rs-surface); cursor: pointer; }
.street-search-panel { position: absolute; z-index: 20; top: calc(100% + 4px); left: 0; right: 0; max-height: 240px; overflow-y: auto; background: var(--rs-surface); border: 1px solid var(--rs-border); border-radius: 6px; box-shadow: 0 6px 20px rgb(0 0 0 / 12%); }
.street-search-panel ul { padding: 0; margin: 0; list-style: none; }
.street-search-panel li { padding: 10px 12px; cursor: pointer; overflow-wrap: anywhere; line-height: 1.5; }
.street-search-panel li:hover, .street-search-panel li.is-active { background: var(--rs-subtle); }
.street-search-panel small { display: block; padding: 10px 12px; }
.street-retry { margin: 0 12px 12px; color: var(--rs-link); background: var(--rs-surface); border: 1px solid var(--rs-border); padding: 6px 10px; border-radius: 4px; cursor: pointer; }
label { color: var(--rs-muted); font-size: 12px; font-weight: 600; line-height: 20px; min-height: 20px; }
input, select { background: var(--rs-surface); border: 1px solid var(--rs-border); border-radius: 6px; box-sizing: border-box; color: var(--rs-text); height: 42px; min-height: 42px; margin: 0; padding: 10px 11px; width: 100%; min-width: 0; font: inherit; line-height: 20px; }
input:focus-visible, .street-toggle:focus-visible { outline: 2px solid var(--rs-link); outline-offset: 2px; }
small { color: var(--rs-muted); font-size: 11px; line-height: 1.5; }
small:empty { display: none; }
a { color: var(--rs-link); }
</style>
