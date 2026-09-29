<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import SellerLayout from '../layouts/SellerLayout.vue'
import PageHeader from '../components/ui/PageHeader.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import UiButton from '../components/ui/UiButton.vue'
import {
  createPaymentMethod,
  getPaymentMethod,
  updatePaymentMethod
} from '../services/shopService.js'

const props = defineProps({
  currentUser: { type: Object, default: null },
  sessionLoading: Boolean
})
const emit = defineEmits(['open-auth'])
const route = useRoute()
const router = useRouter()
const editing = computed(() => Boolean(route.params.id))
const loading = ref(false)
const saving = ref(false)
const loadFailed = ref(false)
const error = ref('')
const shopMissing = ref(false)
const defaultForm = () => ({
  name: 'Cash on delivery',
  description: 'Pay in cash when your order arrives.',
  instructions: '',
  is_active: true
})
const form = ref(defaultForm())
let loadVersion = 0
onBeforeUnmount(() => { loadVersion++ })

async function load() {
  const version = ++loadVersion
  const userId = props.currentUser?.id
  const methodId = route.params.id
  const current = () => version === loadVersion && userId === props.currentUser?.id && methodId === route.params.id
  form.value = defaultForm()
  loading.value = false
  error.value = ''
  shopMissing.value = false
  loadFailed.value = false
  if (!props.currentUser || props.sessionLoading) return
  if (!editing.value) {
    form.value = defaultForm()
    loadFailed.value = false
    shopMissing.value = false
    error.value = ''
    return
  }
  loading.value = true
  loadFailed.value = false
  shopMissing.value = false
  error.value = ''
  try {
    const response = await getPaymentMethod(methodId)
    if (!current()) return
    form.value = {
      name: response.data.name,
      description: response.data.payment_data.description || '',
      instructions: response.data.payment_data.instructions || '',
      is_active: response.data.is_active
    }
  } catch (failure) {
    if (!current()) return
    shopMissing.value = failure.status === 404 && failure.message === 'Shop not found'
    loadFailed.value = true
    error.value = failure.message || 'Could not load the payment method.'
  } finally {
    if (current()) loading.value = false
  }
}

async function submit() {
  if (!props.currentUser || props.sessionLoading || saving.value || loading.value || loadFailed.value) return
  const version = loadVersion
  saving.value = true
  error.value = ''
  shopMissing.value = false
  const payload = {
    name: form.value.name.trim(),
    payment_data: {
      type: 'cod',
      description: form.value.description.trim() || null,
      instructions: form.value.instructions.trim() || null
    },
    is_active: form.value.is_active
  }
  try {
    if (editing.value) await updatePaymentMethod(route.params.id, payload)
    else await createPaymentMethod(payload)
    if (version !== loadVersion) return
    await router.push({ name: 'payment-method-list', query: { saved: '1' } })
  } catch (failure) {
    if (version !== loadVersion) return
    shopMissing.value = failure.status === 404 && failure.message === 'Shop not found'
    error.value = failure.status === 409
      ? 'COD already exists for this shop.'
      : failure.message || 'Could not save the payment method.'
  } finally {
    saving.value = false
  }
}

watch(
  () => [props.currentUser?.id, props.sessionLoading, route.params.id],
  () => load(),
  { immediate: true }
)
</script>


<template>
  <SellerLayout :current-user="currentUser" :session-loading="sessionLoading" @open-auth="emit('open-auth')">
    <RouterLink class="rs-payment-form__back rs-link" :to="{ name: 'payment-method-list' }">← Payment methods</RouterLink>
    <PageHeader :title="editing ? 'Edit payment method' : 'Add payment method'" description="Set up cash on delivery for your shop." />
    <div v-if="loading" class="rs-payment-form__loading" role="status"><div class="rs-skeleton"></div><p>Loading payment method…</p></div>
    <EmptyState v-else-if="shopMissing" title="Create your shop first" description="Set up a shop before adding payment methods." icon="store"><RouterLink class="rs-button" :to="{ name: 'my-shop' }">Set up shop</RouterLink></EmptyState>
    <EmptyState v-else-if="loadFailed" title="Payment method unavailable" :description="error" icon="credit"><UiButton @click="load">Try again</UiButton></EmptyState>
    <form v-else class="rs-payment-form" @submit.prevent="submit">
      <fieldset :disabled="saving">
        <legend>Payment details</legend>
        <label class="rs-field"><span>Payment type</span><input class="rs-input" value="Cash on delivery (COD)" disabled /></label>
        <label class="rs-field"><span>Display name <span aria-hidden="true">*</span></span><input v-model="form.name" class="rs-input" required minlength="2" maxlength="100" autocomplete="off" /></label>
        <label class="rs-field"><span>Description <small>Optional</small></span><textarea v-model="form.description" class="rs-input" maxlength="500" rows="3" placeholder="A short description customers will see at checkout"></textarea></label>
        <label class="rs-field"><span>Payment instructions <small>Optional</small></span><textarea v-model="form.instructions" class="rs-input" maxlength="1000" rows="4" placeholder="Anything customers should know before paying"></textarea></label>
        <label class="rs-payment-form__check"><input v-model="form.is_active" class="rs-checkbox" type="checkbox" /><span>Available at checkout<small>Customers can choose COD when all shops in their checkout support it.</small></span></label>
      </fieldset>
      <p v-if="error" class="rs-alert rs-alert--error" role="alert">{{ error }}</p>
      <div class="rs-payment-form__actions"><RouterLink class="rs-button rs-button--secondary" :to="{ name: 'payment-method-list' }">Cancel</RouterLink><UiButton type="submit" :busy="saving">{{ saving ? 'Saving…' : 'Save payment method' }}</UiButton></div>
    </form>
  </SellerLayout>
</template>
<style scoped>
.rs-payment-form__back { display: inline-block; margin-bottom: 24px; font-size: 14px; }
.rs-payment-form { padding: 32px; background: var(--rs-surface); border: 1px solid var(--rs-border); border-radius: 8px; max-width: 760px; }
.rs-payment-form fieldset { display: grid; gap: 24px; border: 0; margin: 0; padding: 0; min-width: 0; }
.rs-payment-form legend { font-size: 18px; font-weight: 600; margin-bottom: 24px; color: var(--rs-text); }
.rs-payment-form small { color: var(--rs-muted); font-size: 13px; font-weight: 400; }
.rs-payment-form .rs-field > span { display: flex; justify-content: space-between; gap: 12px; }
.rs-payment-form__check { display: flex; align-items: flex-start; gap: 12px; padding: 16px; border-radius: 6px; background: var(--rs-subtle); font-size: 14px; color: var(--rs-text); }
.rs-payment-form__check input { flex-shrink: 0; margin: 2px 0 0; }
.rs-payment-form__check small { display: block; margin-top: 4px; }
.rs-payment-form__actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 12px; margin-top: 32px; padding-top: 24px; border-top: 1px solid var(--rs-border); }
.rs-payment-form__loading { color: var(--rs-muted); }
.rs-payment-form__loading .rs-skeleton { height: 300px; margin-bottom: 16px; }
@media (max-width: 640px) { .rs-payment-form { padding: 20px 16px; } .rs-payment-form__actions .rs-button { flex: 1; } }
</style>
