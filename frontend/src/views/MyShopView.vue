<script setup>
import BackButton from '../components/BackButton.vue'
import { ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import {
  createShop,
  getMyShop,
  updateMyShop
} from '../services/shopService.js'

const props = defineProps({
  currentUser: {
    type: Object,
    default: null
  },
  sessionLoading: {
    type: Boolean,
    default: false
  }
})
const emit = defineEmits(['open-auth'])
const shop = ref(null)
const form = ref(emptyForm())
const loading = ref(false)
const saving = ref(false)
const loadError = ref('')
const notice = ref('')

function emptyForm() {
  return {
    name: '',
    description: '',
    logo_url: '',
    cover_url: '',
    status: 'active'
  }
}

function applyShop(nextShop) {
  shop.value = nextShop
  form.value = nextShop
    ? {
        name: nextShop.name,
        description: nextShop.description || '',
        logo_url: nextShop.logo_url || '',
        cover_url: nextShop.cover_url || '',
        status: nextShop.status
      }
    : {
        ...emptyForm(),
        name: props.currentUser?.full_name
          ? props.currentUser.full_name
          : ''
      }
}

async function loadShop() {
  if (!props.currentUser) return
  loading.value = true
  loadError.value = ''

  try {
    const response = await getMyShop()
    applyShop(response.data)
  } catch (error) {
    loadError.value = error.message
  } finally {
    loading.value = false
  }
}

async function saveShop() {
  const wasExisting = Boolean(shop.value)
  saving.value = true
  loadError.value = ''
  notice.value = ''

  const payload = {
    name: form.value.name,
    description: form.value.description || null,
    logo_url: form.value.logo_url || null,
    cover_url: form.value.cover_url || null,
    ...(shop.value ? { status: form.value.status } : {})
  }

  try {
    const response = shop.value
      ? await updateMyShop(payload)
      : await createShop(payload)
    applyShop(response.data)
    notice.value = wasExisting
      ? 'Shop information saved.'
      : 'Shop created successfully.'
  } catch (error) {
    loadError.value = error.message
  } finally {
    saving.value = false
  }
}

watch(
  () => [props.currentUser?.id, props.sessionLoading],
  ([userId, sessionLoading]) => {
    if (userId && !sessionLoading) loadShop()
  },
  { immediate: true }
)
</script>

<template>
  <main class="my-shop-page">
    <section class="section profile-section">
      <BackButton :fallback="{ name: 'profile' }" />

      <div v-if="sessionLoading || loading" class="profile-empty" role="status">
        <h3>Loading shop information...</h3>
      </div>

      <div v-else-if="!currentUser" class="profile-empty">
        <h3>Sign in to manage your shop</h3>
        <p>Sign in before creating or updating your shop.</p>
        <button type="button" @click="emit('open-auth')">Sign in</button>
      </div>

      <template v-else>
        <div class="section-heading my-shop-heading">
          <div>
            <h1>{{ shop ? 'Manage shop' : 'Create shop' }}</h1>
          </div>
          <div class="my-shop-heading__actions">
            <RouterLink :to="{ name: 'my-products' }">Manage products</RouterLink>
            <RouterLink
              v-if="shop?.status === 'active'"
              :to="{ name: 'shop', params: { identifier: shop.identifier } }"
            >View public shop</RouterLink>
          </div>
        </div>

        <form class="profile-form my-shop-form" @submit.prevent="saveShop">
          <div class="field">
            <label for="shop-name">Shop name</label>
            <input id="shop-name" v-model="form.name" minlength="2" maxlength="120" required />
          </div>
          <div class="field">
            <label for="shop-status">Status</label>
            <select id="shop-status" v-model="form.status" :disabled="!shop">
              <option value="active">Active</option>
              <option value="closed">Temporarily closed</option>
            </select>
            <small v-if="shop && form.status === 'closed'">
              Closing the shop will hide all its products.
            </small>
          </div>
          <div class="field">
            <label for="shop-logo">Logo</label>
            <input id="shop-logo" v-model="form.logo_url" maxlength="255" placeholder="https://... or /uploads/..." />
          </div>
          <div class="field">
            <label for="shop-cover">Cover image</label>
            <input id="shop-cover" v-model="form.cover_url" maxlength="255" placeholder="https://... or /uploads/..." />
          </div>
          <div class="field my-shop-form__description">
            <label for="shop-description">Description</label>
            <textarea id="shop-description" v-model="form.description" maxlength="2000" rows="6"></textarea>
          </div>
          <div class="my-shop-form__actions">
            <button class="account-button account-button--primary" type="submit" :disabled="saving">
              {{ saving ? 'Saving...' : shop ? 'Save shop information' : 'Create shop' }}
            </button>
          </div>
          <p v-if="notice" class="account-notice account-notice--success" role="status">{{ notice }}</p>
          <p v-if="loadError" class="account-notice account-notice--error" role="alert">{{ loadError }}</p>
        </form>
      </template>
    </section>
  </main>
</template>
