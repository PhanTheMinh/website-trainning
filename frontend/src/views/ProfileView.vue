<script setup>
import { ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import AvatarUploader from '../components/AvatarUploader.vue'
import {
  logout as logoutRequest,
  updateProfile
} from '../services/authService.js'

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

const emit = defineEmits(['logged-out', 'open-auth', 'user-updated'])

const profileForm = ref({
  full_name: '',
  email: '',
  phone: '',
  address: ''
})
const profileLoading = ref(false)
const profileMessage = ref('')
const profileError = ref('')
const logoutLoading = ref(false)

watch(
  () => props.currentUser,
  (user) => {
    if (!user) {
      return
    }

    profileForm.value = {
      full_name: user.full_name,
      email: user.email,
      phone: user.phone || '',
      address: user.address || ''
    }
  },
  {
    immediate: true
  }
)

async function saveProfile() {
  profileLoading.value = true
  profileMessage.value = ''
  profileError.value = ''

  try {
    const response = await updateProfile({
      full_name: profileForm.value.full_name,
      phone: profileForm.value.phone || null,
      address: profileForm.value.address || null
    })

    emit('user-updated', response.data)
    profileMessage.value = response.message
  } catch (error) {
    profileError.value = error.message
  } finally {
    profileLoading.value = false
  }
}

async function logout() {
  logoutLoading.value = true
  profileError.value = ''

  try {
    await logoutRequest()
    emit('logged-out')
  } catch (error) {
    profileError.value = error.message
  } finally {
    logoutLoading.value = false
  }
}
</script>

<template>
  <main class="profile-page">
    <section class="section profile-section">
      <RouterLink class="profile-back" to="/">← Quay lại trang chủ</RouterLink>

      <div class="section-heading">
        <p class="eyebrow">Tài khoản</p>
        <h1>Không gian của bạn</h1>
        <p>Quản lý hồ sơ, ảnh đại diện và hoạt động bán hàng trên SportBase.</p>
      </div>

      <div v-if="sessionLoading" class="profile-empty">
        <h3>Đang tải hồ sơ...</h3>
      </div>

      <div v-else-if="currentUser" class="account-dashboard">
        <div class="account-dashboard__primary">
          <AvatarUploader
            :current-user="currentUser"
            @user-updated="emit('user-updated', $event)"
          />

          <form class="profile-form account-profile-card" @submit.prevent="saveProfile">
            <div class="account-card__heading">
              <div>
                <p class="account-card__eyebrow">Thông tin cá nhân</p>
                <h2>Hồ sơ tài khoản</h2>
              </div>
              <span class="account-profile-card__badge">Đã xác thực</span>
            </div>

            <div class="field">
              <label for="profile-name">Họ và tên</label>
              <input
                id="profile-name"
                v-model="profileForm.full_name"
                autocomplete="name"
                required
              />
            </div>

            <div class="field">
              <label for="profile-email">Email</label>
              <input
                id="profile-email"
                v-model="profileForm.email"
                autocomplete="email"
                disabled
              />
            </div>

            <div class="field">
              <label for="profile-address">Địa chỉ</label>
              <input
                id="profile-address"
                v-model="profileForm.address"
                autocomplete="street-address"
              />
            </div>

            <div class="field">
              <label for="profile-phone">Số điện thoại</label>
              <input
                id="profile-phone"
                v-model="profileForm.phone"
                autocomplete="tel"
              />
            </div>

            <div class="account-profile-card__actions">
              <button class="account-button account-button--primary" type="submit" :disabled="profileLoading">
                {{ profileLoading ? 'Đang lưu...' : 'Lưu thông tin' }}
              </button>
              <button
                class="account-button account-button--quiet"
                type="button"
                :disabled="logoutLoading"
                @click="logout"
              >
                {{ logoutLoading ? 'Đang đăng xuất...' : 'Đăng xuất' }}
              </button>
            </div>

            <p v-if="profileMessage" class="account-notice account-notice--success" role="status">
              {{ profileMessage }}
            </p>
            <p v-if="profileError" class="account-notice account-notice--error" role="alert">
              {{ profileError }}
            </p>
          </form>
        </div>

        <section class="seller-card" aria-labelledby="seller-card-title">
          <div class="seller-card__icon" aria-hidden="true"></div>
          <div class="seller-card__copy">
            <p class="account-card__eyebrow">Quản lý bán hàng</p>
            <h2 id="seller-card-title">Bán hàng cùng chúng tôi</h2>
            <p>Đăng sản phẩm của bạn và bắt đầu bán hàng trên hệ thống.</p>
          </div>
          <RouterLink class="seller-card__action" :to="{ name: 'product-create' }">
            <span class="seller-card__plus" aria-hidden="true"></span>
            Thêm sản phẩm
            <span class="seller-card__arrow" aria-hidden="true"></span>
          </RouterLink>
        </section>
      </div>

      <div v-else class="profile-empty">
        <h3>Đăng nhập để quản lý tài khoản</h3>
        <p>
          Bạn cần đăng nhập trước khi xem và cập nhật thông tin tài khoản.
        </p>
        <button type="button" @click="emit('open-auth')">
          Đăng nhập / Đăng ký
        </button>
      </div>
    </section>
  </main>
</template>
