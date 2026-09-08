<script setup>
import { computed, reactive, ref } from 'vue'
import { login, register } from '../services/authService.js'

const emit = defineEmits(['authenticated', 'close'])

const mode = ref('login')
const form = reactive({
  full_name: '',
  email: '',
  phone: '',
  password: '',
  address: ''
})
const message = ref('')
const submitting = ref(false)

const isRegister = computed(() => mode.value === 'register')

function switchMode(nextMode) {
  mode.value = nextMode
  message.value = ''
}

async function submitAuth() {
  if (!form.email || !form.password || (isRegister.value && !form.full_name)) {
    message.value = 'Vui lòng điền đầy đủ thông tin bắt buộc.'
    return
  }

  submitting.value = true
  message.value = ''

  try {
    if (isRegister.value) {
      const response = await register({
        full_name: form.full_name,
        email: form.email,
        phone: form.phone || null,
        address: form.address || null,
        password: form.password
      })

      message.value = `${response.message}. Bạn có thể đăng nhập ngay bây giờ.`
      mode.value = 'login'
      return
    }

    const response = await login({
      email: form.email,
      password: form.password
    })

    emit('authenticated', response.data)
  } catch (error) {
    message.value = error.message
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="auth-panel" aria-label="Tài khoản">
    <div class="auth-copy">
      <p class="eyebrow">Tài khoản</p>
      <h2>{{ isRegister ? 'Tạo tài khoản' : 'Đăng nhập' }}</h2>
      <p>{{ isRegister ? 'Tạo tài khoản để quản lý hồ sơ và sản phẩm.' : 'Đăng nhập để tiếp tục với RunStore.' }}</p>
    </div>

    <form class="auth-form" @submit.prevent="submitAuth">
      <div class="auth-tabs" role="tablist" aria-label="Chọn biểu mẫu tài khoản">
        <button
          type="button"
          :class="{ active: mode === 'login' }"
          @click="switchMode('login')"
        >
          Đăng nhập
        </button>
        <button
          type="button"
          :class="{ active: mode === 'register' }"
          @click="switchMode('register')"
        >
          Đăng ký
        </button>
      </div>

      <div v-if="isRegister" class="field">
        <label for="auth-name">Họ và tên</label>
        <input
          id="auth-name"
          v-model="form.full_name"
          autocomplete="name"
          placeholder="Nguyễn Văn A"
          required
        />
      </div>

      <div class="field">
        <label for="auth-email">Email</label>
        <input
          id="auth-email"
          v-model="form.email"
          autocomplete="email"
          placeholder="you@example.com"
          type="email"
          required
        />
      </div>

      <div v-if="isRegister" class="field">
        <label for="auth-phone">Số điện thoại</label>
        <input
          id="auth-phone"
          v-model="form.phone"
          autocomplete="tel"
          placeholder="0901234567"
        />
      </div>

      <div v-if="isRegister" class="field">
        <label for="auth-address">Địa chỉ</label>
        <input
          id="auth-address"
          v-model="form.address"
          autocomplete="street-address"
        />
      </div>

      <div class="field">
        <label for="auth-password">Mật khẩu</label>
        <input
          id="auth-password"
          v-model="form.password"
          :autocomplete="isRegister ? 'new-password' : 'current-password'"
          minlength="6"
          placeholder="Nhập mật khẩu"
          type="password"
          required
        />
      </div>

      <button class="submit-auth" type="submit" :disabled="submitting">
        {{
          submitting
            ? 'Đang xử lý...'
            : isRegister
              ? 'Tạo tài khoản'
              : 'Đăng nhập'
        }}
      </button>

      <button class="text-button" type="button" @click="emit('close')">Đóng</button>
      <p v-if="message" class="form-message">{{ message }}</p>
    </form>
  </section>
</template>
