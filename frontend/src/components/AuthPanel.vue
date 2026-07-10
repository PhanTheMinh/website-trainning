<script setup>
import { computed, reactive, ref } from 'vue'

const emit = defineEmits(['authenticated', 'close'])

const mode = ref('login')
const form = reactive({
  name: '',
  email: '',
  password: '',
  sport: 'Gym & Fitness'
})
const message = ref('')

const isRegister = computed(() => mode.value === 'register')

function switchMode(nextMode) {
  mode.value = nextMode
  message.value = ''
}

function submitAuth() {
  if (!form.email || !form.password || (isRegister.value && !form.name)) {
    message.value = 'Vui long dien day du thong tin bat buoc.'
    return
  }

  const user = {
    name: isRegister.value ? form.name : form.email.split('@')[0],
    email: form.email,
    sport: form.sport,
    membership: isRegister.value ? 'Rookie member' : 'Returning member'
  }

  emit('authenticated', user)
  message.value = ''
}
</script>

<template>
  <section class="auth-panel" aria-label="Tai khoan">
    <div class="auth-copy">
      <p class="eyebrow">Tai khoan</p>
      <h2>{{ isRegister ? 'Tao tai khoan moi' : 'Dang nhap thanh vien' }}</h2>
      <p>
        Luu thong tin khach hang, theo doi gio hang va chuan bi cho cac API auth cua
        backend Node.js.
      </p>
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
        <input id="auth-name" v-model="form.name" autocomplete="name" placeholder="Nguyen Van A" />
      </div>

      <div class="field">
        <label for="auth-email">Email</label>
        <input
          id="auth-email"
          v-model="form.email"
          autocomplete="email"
          placeholder="you@example.com"
          type="email"
        />
      </div>

      <div class="field">
        <label for="auth-password">Mat khau</label>
        <input
          id="auth-password"
          v-model="form.password"
          autocomplete="current-password"
          placeholder="Nhap mat khau"
          type="password"
        />
      </div>

      <div v-if="isRegister" class="field">
        <label for="auth-sport">Mon the thao yeu thich</label>
        <select id="auth-sport" v-model="form.sport">
          <option>Gym & Fitness</option>
          <option>Giay chay bo</option>
          <option>Bong da</option>
          <option>Bong ro</option>
        </select>
      </div>

      <button class="submit-auth" type="submit">
        {{ isRegister ? 'Tao tai khoan' : 'Dang nhap' }}
      </button>

      <button class="text-button" type="button" @click="emit('close')">Dong</button>
      <p v-if="message" class="form-message">{{ message }}</p>
    </form>
  </section>
</template>
