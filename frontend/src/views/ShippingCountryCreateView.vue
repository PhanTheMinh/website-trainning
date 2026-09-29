<script setup>
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import ManagementSidebar from '../components/ManagementSidebar.vue'
import { createCountry } from '../services/shopService.js'

defineProps({
  currentUser: { type: Object, default: null },
  sessionLoading: { type: Boolean, default: false }
})

const emit = defineEmits(['open-auth'])
const router = useRouter()
const saving = ref(false)
const errorMessage = ref('')
const shopMissing = ref(false)
const form = ref({ name: '', country_code: '', phone_code: '' })

async function submitCountry() {
  const name = form.value.name.trim()
  const countryCode = form.value.country_code.trim().toUpperCase()
  const phoneCode = form.value.phone_code.trim()
  errorMessage.value = ''
  shopMissing.value = false

  if (name.length < 2) {
    errorMessage.value = 'Country name must have at least 2 characters.'
    return
  }
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    errorMessage.value = 'Country code must have exactly 2 letters, such as VN.'
    return
  }
  if (!/^\+[1-9]\d{0,6}$/.test(phoneCode)) {
    errorMessage.value = 'Phone code must start with +, such as +84.'
    return
  }

  saving.value = true
  try {
    const response = await createCountry({ name, country_code: countryCode, phone_code: phoneCode })
    await router.push({ name: 'shipping-country-list', query: { created: response.data.name } })
  } catch (error) {
    if (error.status === 404) shopMissing.value = true
    errorMessage.value = error.status === 409
      ? 'This country name or code already exists.'
      : error.message || 'Could not add country.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <main class="country-create-page">
    <section class="section country-create-section">
      <div v-if="sessionLoading" class="profile-empty"><h3>Loading...</h3></div>
      <div v-else-if="!currentUser" class="profile-empty">
        <h3>Sign in to manage countries</h3>
        <button type="button" @click="emit('open-auth')">Sign in</button>
      </div>
      <div v-else class="country-create-layout">
        <ManagementSidebar />
        <div class="country-create-content">
          <header class="country-create-header">
            <RouterLink :to="{ name: 'shipping-country-list' }">← Country list</RouterLink>
            <h1>Add country</h1>
          </header>
          <section class="country-create-panel">
            <div v-if="shopMissing" class="country-create-empty">
              <h2>No shop yet</h2><RouterLink :to="{ name: 'my-shop' }">Create shop</RouterLink>
            </div>
            <form v-else class="country-create-form" @submit.prevent="submitCountry">
              <div class="field country-create-form__wide">
                <label for="country-name">Country name *</label>
                <input id="country-name" v-model="form.name" maxlength="100" placeholder="Vietnam" required />
              </div>
              <div class="field">
                <label for="country-code">Country code *</label>
                <input id="country-code" v-model="form.country_code" maxlength="2" placeholder="VN" required />
              </div>
              <div class="field">
                <label for="phone-code">Phone code *</label>
                <input id="phone-code" v-model="form.phone_code" maxlength="8" placeholder="+84" required />
              </div>
              <p v-if="errorMessage" class="account-notice account-notice--error country-create-form__wide" role="alert">{{ errorMessage }}</p>
              <div class="country-create-actions country-create-form__wide">
                <RouterLink :to="{ name: 'shipping-country-list' }">Cancel</RouterLink>
                <button type="submit" :disabled="saving">{{ saving ? 'Adding...' : 'Add country' }}</button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.country-create-page { background: var(--rs-page); min-height: calc(100vh - 80px); }
.country-create-section { padding-block: 26px 48px; }
.country-create-layout { display: grid; gap: 20px; grid-template-columns: 260px minmax(0, 1fr); }
.country-create-content { min-width: 0; }
.country-create-header, .country-create-panel { background: var(--rs-surface); border: 1px solid var(--rs-border); border-radius: 12px; }
.country-create-header { align-items: baseline; display: flex; flex-wrap: wrap; gap: 8px 14px; margin-bottom: 14px; padding: 13px 16px; }
.country-create-header a { color: var(--rs-muted); font-size: .78rem; text-decoration: none; }
.country-create-header h1 { color: var(--rs-text); font-size: 1.2rem; margin: 0; white-space: nowrap; }
.country-create-panel { padding: 20px; }
.country-create-form { display: grid; gap: 15px; grid-template-columns: 1fr 1fr; max-width: 680px; }
.country-create-form__wide { grid-column: 1 / -1; }
.country-create-actions { align-items: center; display: flex; gap: 10px; justify-content: flex-end; }
.country-create-actions a { color: var(--rs-muted); font-size: .86rem; font-weight: 700; padding: 10px; text-decoration: none; }
.country-create-actions button, .country-create-empty a { background: var(--rs-solid); border: 0; border-radius: 9px; color: var(--rs-on-solid); cursor: pointer; font-weight: 800; padding: 11px 16px; text-decoration: none; }
.country-create-actions button:disabled { cursor: wait; opacity: .6; }
.country-create-empty { padding: 20px; text-align: center; }
.country-create-empty h2 { color: var(--rs-text); font-size: 1rem; }
@media (max-width: 860px) { .country-create-layout { grid-template-columns: 1fr; } }
@media (max-width: 620px) { .country-create-form { grid-template-columns: 1fr; } .country-create-form__wide { grid-column: auto; } }
</style>
