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
    message.value = 'Vui long dien day du thong tin bat buoc.'
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

      message.value = `${response.message}. Ban co the dang nhap ngay bay gio.`
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
  <section class="auth-panel" aria-label="Tai khoan">
    <div class="auth-copy">
      <p class="eyebrow">Tai khoan</p>
      <h2>{{ isRegister ? 'Tao tai khoan moi' : 'Dang nhap thanh vien' }}</h2>
      <p>Dang ky de luu thong tin khach hang va quan ly ho so tren moi thiet bi.</p>
    </div>

    <form class="auth-form" @submit.prevent="submitAuth">
      <div class="auth-tabs" role="tablist" aria-label="Chon form tai khoan">
        <button
          type="button"
          :class="{ active: mode === 'login' }"
          @click="switchMode('login')"
        >
          Login
        </button>
        <button
          type="button"
          :class="{ active: mode === 'register' }"
          @click="switchMode('register')"
        >
          Register
        </button>
      </div>

      <div v-if="isRegister" class="field">
        <label for="auth-name">Ho ten</label>
        <input
          id="auth-name"
          v-model="form.full_name"
          autocomplete="name"
          placeholder="Nguyen Van A"
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
        <label for="auth-phone">So dien thoai</label>
        <input
          id="auth-phone"
          v-model="form.phone"
          autocomplete="tel"
          placeholder="0901234567"
        />
      </div>

      <div v-if="isRegister" class="field">
        <label for="auth-address">Dia chi</label>
        <input
          id="auth-address"
          v-model="form.address"
          autocomplete="street-address"
        />
      </div>

      <div class="field">
        <label for="auth-password">Mat khau</label>
        <input
          id="auth-password"
          v-model="form.password"
          :autocomplete="isRegister ? 'new-password' : 'current-password'"
          minlength="6"
          placeholder="Nhap mat khau"
          type="password"
          required
        />
      </div>

      <button class="submit-auth" type="submit" :disabled="submitting">
        {{
          submitting
            ? 'Dang xu ly...'
            : isRegister
              ? 'Tao tai khoan'
              : 'Dang nhap'
        }}
      </button>

      <button class="text-button" type="button" @click="emit('close')">Dong</button>
      <p v-if="message" class="form-message">{{ message }}</p>
    </form>
  </section>
</template>
