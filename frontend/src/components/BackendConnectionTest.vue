<script setup>
import { ref } from 'vue'
import { API_BASE_URL } from '../services/apiClient'
import { checkBackendConnection } from '../services/backendService'

const endpoint = ref('/health')
const loading = ref(false)
const error = ref('')
const result = ref(null)

async function testConnection() {
  loading.value = true
  error.value = ''
  result.value = null

  try {
    result.value = await checkBackendConnection(endpoint.value)
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="connection-test">
    <div class="field">
      <label for="api-base-url">Backend base URL</label>
      <input id="api-base-url" :value="API_BASE_URL" disabled />
    </div>

    <div class="field">
      <label for="api-endpoint">Endpoint test</label>
      <input id="api-endpoint" v-model="endpoint" placeholder="/health" />
    </div>

    <button type="button" :disabled="loading" @click="testConnection">
      {{ loading ? 'Dang ket noi...' : 'Test API' }}
    </button>

    <pre v-if="result" class="result success">{{ JSON.stringify(result, null, 2) }}</pre>
    <p v-if="error" class="result error">{{ error }}</p>
  </div>
</template>
