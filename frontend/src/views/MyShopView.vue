<script setup>
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
      ? 'Thông tin shop đã được lưu.'
      : 'Shop đã được tạo thành công.'
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
      <RouterLink class="profile-back" :to="{ name: 'profile' }">
        ← Quay lại tài khoản
      </RouterLink>

      <div v-if="sessionLoading || loading" class="profile-empty" role="status">
        <h3>Đang tải thông tin shop...</h3>
      </div>

      <div v-else-if="!currentUser" class="profile-empty">
        <h3>Đăng nhập để quản lý shop</h3>
        <p>Bạn cần đăng nhập trước khi tạo hoặc cập nhật cửa hàng.</p>
        <button type="button" @click="emit('open-auth')">Đăng nhập</button>
      </div>

      <template v-else>
        <div class="section-heading my-shop-heading">
          <div>
            <h1>{{ shop ? 'Quản lý shop' : 'Tạo shop' }}</h1>
          </div>
          <div class="my-shop-heading__actions">
            <RouterLink :to="{ name: 'my-products' }">Quản lý sản phẩm</RouterLink>
            <RouterLink
              v-if="shop?.status === 'active'"
              :to="{ name: 'shop', params: { identifier: shop.identifier } }"
            >Xem shop công khai</RouterLink>
          </div>
        </div>

        <form class="profile-form my-shop-form" @submit.prevent="saveShop">
          <div class="field">
            <label for="shop-name">Tên shop</label>
            <input id="shop-name" v-model="form.name" minlength="2" maxlength="120" required />
          </div>
          <div class="field">
            <label for="shop-status">Trạng thái</label>
            <select id="shop-status" v-model="form.status" :disabled="!shop">
              <option value="active">Đang hoạt động</option>
              <option value="closed">Tạm đóng shop</option>
            </select>
            <small v-if="shop && form.status === 'closed'">
              Đóng shop sẽ ẩn toàn bộ sản phẩm.
            </small>
          </div>
          <div class="field">
            <label for="shop-logo">Logo</label>
            <input id="shop-logo" v-model="form.logo_url" maxlength="255" placeholder="https://... hoặc /uploads/..." />
          </div>
          <div class="field">
            <label for="shop-cover">Ảnh bìa</label>
            <input id="shop-cover" v-model="form.cover_url" maxlength="255" placeholder="https://... hoặc /uploads/..." />
          </div>
          <div class="field my-shop-form__description">
            <label for="shop-description">Mô tả</label>
            <textarea id="shop-description" v-model="form.description" maxlength="2000" rows="6"></textarea>
          </div>
          <div class="my-shop-form__actions">
            <button class="account-button account-button--primary" type="submit" :disabled="saving">
              {{ saving ? 'Đang lưu...' : shop ? 'Lưu thông tin shop' : 'Tạo shop' }}
            </button>
          </div>
          <p v-if="notice" class="account-notice account-notice--success" role="status">{{ notice }}</p>
          <p v-if="loadError" class="account-notice account-notice--error" role="alert">{{ loadError }}</p>
        </form>
      </template>
    </section>
  </main>
</template>
