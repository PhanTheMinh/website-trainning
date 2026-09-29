<script setup>
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import ManagementSidebar from '../components/ManagementSidebar.vue'
import { createShippingMethod } from '../services/shopService.js'

defineProps({
  currentUser: { type: Object, default: null },
  sessionLoading: { type: Boolean, default: false }
})

const emit = defineEmits(['open-auth'])
const router = useRouter()
const creating = ref(false)
const formError = ref('')
const shopMissing = ref(false)
const form = ref({ preset: 'standard', custom_name: '', description: '', enabled: true })
const presetNames = {
  standard: 'Standard shipping',
  fast: 'Fast shipping',
  express: 'Express shipping'
}

const selectedMethodName = computed(() => form.value.preset === 'custom'
  ? form.value.custom_name.trim()
  : presetNames[form.value.preset]
)

async function submitMethod() {
  const name = selectedMethodName.value
  formError.value = ''
  shopMissing.value = false
  if (name.length < 2) {
    formError.value = 'Please enter a shipping method name.'
    return
  }

  creating.value = true
  try {
    const response = await createShippingMethod({
      name,
      description: form.value.description.trim() || null,
      status: form.value.enabled ? 'active' : 'inactive'
    })
    await router.push({ name: 'shipping-method-list', query: { created: response.data.name } })
  } catch (error) {
    if (error.status === 404) shopMissing.value = true
    formError.value = error.status === 409
      ? 'This shipping method already exists.'
      : error.message || 'Could not create the shipping method.'
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <main class="method-create-page">
    <section class="section method-create-section">
      <div v-if="sessionLoading" class="profile-empty"><h3>Loading shipping management...</h3></div>
      <div v-else-if="!currentUser" class="profile-empty">
        <h3>Sign in to manage shipping</h3>
        <button type="button" @click="emit('open-auth')">Sign in</button>
      </div>
      <div v-else class="method-create-layout">
        <ManagementSidebar />
        <div class="method-create-content">
          <header class="method-create-header">
            <RouterLink :to="{ name: 'shipping-methods' }">← Shipping methods</RouterLink>
            <h1>Add method</h1>
          </header>
          <section class="method-create-panel">
            <div v-if="shopMissing" class="method-create-empty">
              <h2>No shop yet</h2><RouterLink :to="{ name: 'my-shop' }">Create shop</RouterLink>
            </div>
            <form v-else class="method-create-form" @submit.prevent="submitMethod">
              <div class="field">
                <label for="shipping-preset">Shipping type *</label>
                <select id="shipping-preset" v-model="form.preset" :disabled="creating">
                  <option value="standard">Standard shipping</option>
                  <option value="fast">Fast shipping</option>
                  <option value="express">Express shipping</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div v-if="form.preset === 'custom'" class="field">
                <label for="shipping-custom-name">Method name *</label>
                <input id="shipping-custom-name" v-model="form.custom_name" :disabled="creating" maxlength="100" placeholder="Example: Local delivery" required />
              </div>
              <div class="field">
                <label for="shipping-description">Description</label>
                <textarea id="shipping-description" v-model="form.description" :disabled="creating" maxlength="255" rows="3"></textarea>
              </div>
              <label class="method-create-status">
                <input v-model="form.enabled" :disabled="creating" type="checkbox" />
                <strong>Enable after creation</strong>
              </label>
              <p v-if="formError" class="account-notice account-notice--error" role="alert">{{ formError }}</p>
              <div class="method-create-actions">
                <RouterLink :to="{ name: 'shipping-methods' }">Cancel</RouterLink>
                <button type="submit" :disabled="creating">{{ creating ? 'Creating...' : 'Create method' }}</button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.method-create-page { background: var(--rs-page); min-height: calc(100vh - 80px); }
.method-create-section { padding-block: 26px 48px; }
.method-create-layout { display: grid; gap: 20px; grid-template-columns: 260px minmax(0, 1fr); }
.method-create-content { min-width: 0; }
.method-create-header, .method-create-panel { background: var(--rs-surface); border: 1px solid var(--rs-border); border-radius: 12px; }
.method-create-header { align-items: baseline; display: flex; flex-wrap: wrap; gap: 8px 14px; margin-bottom: 14px; padding: 13px 16px; }
.method-create-header a { color: var(--rs-muted); font-size: 0.78rem; text-decoration: none; }
.method-create-header h1 { color: var(--rs-text); font-size: 1.2rem; margin: 0; white-space: nowrap; }
.method-create-panel { padding: 20px; }
.method-create-form { display: grid; gap: 15px; max-width: 680px; }
.method-create-status { align-items: center; background: var(--rs-surface); border: 1px solid var(--rs-border); border-radius: 9px; display: flex; gap: 10px; padding: 11px 12px; }
.method-create-status input { height: 19px; width: 19px; }
.method-create-status strong { color: var(--rs-text); font-size: 0.88rem; }
.method-create-actions { align-items: center; display: flex; gap: 10px; justify-content: flex-end; }
.method-create-actions a { color: var(--rs-muted); font-size: 0.86rem; font-weight: 700; padding: 10px; text-decoration: none; }
.method-create-actions button, .method-create-empty a { background: var(--rs-solid); border: 0; border-radius: 9px; color: var(--rs-on-solid); cursor: pointer; font-weight: 800; padding: 11px 16px; text-decoration: none; }
.method-create-actions button:disabled { cursor: wait; opacity: 0.6; }
.method-create-empty { padding: 20px; text-align: center; }
.method-create-empty h2 { color: var(--rs-text); font-size: 1rem; }
@media (max-width: 860px) { .method-create-layout { grid-template-columns: 1fr; } }
</style>
