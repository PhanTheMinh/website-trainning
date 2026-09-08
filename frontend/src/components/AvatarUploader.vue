<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { API_BASE_URL } from '../services/apiClient.js'
import { uploadAvatar } from '../services/authService.js'

const props = defineProps({
  currentUser: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['user-updated'])
const fileInput = ref(null)
const selectedFile = ref(null)
const previewUrl = ref('')
const imageLoadFailed = ref(false)
const uploading = ref(false)
const successMessage = ref('')
const errorMessage = ref('')

const allowedTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp'
])
const maximumFileSize = 2 * 1024 * 1024

const initials = computed(() => {
  const words = props.currentUser.full_name?.trim().split(/\s+/).filter(Boolean) || []

  if (!words.length) {
    return 'TK'
  }

  return `${words[0][0]}${words.length > 1 ? words.at(-1)[0] : ''}`.toUpperCase()
})

const savedAvatarUrl = computed(() => {
  if (!props.currentUser.avatar_url) {
    return ''
  }

  return new URL(props.currentUser.avatar_url, API_BASE_URL).toString()
})

const displayedAvatarUrl = computed(() => {
  if (imageLoadFailed.value) {
    return ''
  }

  return previewUrl.value || savedAvatarUrl.value
})

const fileDetails = computed(() => {
  if (!selectedFile.value) {
    return ''
  }

  const sizeInMb = selectedFile.value.size / (1024 * 1024)
  return `${selectedFile.value.name} · ${sizeInMb.toFixed(2)} MB`
})

function openFilePicker() {
  if (!uploading.value) {
    fileInput.value?.click()
  }
}

function revokePreview() {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = ''
  }
}

function resetInput() {
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

function cancelSelection() {
  selectedFile.value = null
  revokePreview()
  resetInput()
  imageLoadFailed.value = false
  errorMessage.value = ''
  successMessage.value = ''
}

function handleFileSelected(event) {
  const [file] = event.target.files || []

  selectedFile.value = null
  revokePreview()
  imageLoadFailed.value = false
  successMessage.value = ''
  errorMessage.value = ''

  if (!file) {
    return
  }

  if (!allowedTypes.has(file.type)) {
    errorMessage.value = 'Chỉ chấp nhận ảnh JPG, PNG hoặc WebP.'
    resetInput()
    return
  }

  if (file.size > maximumFileSize) {
    errorMessage.value = 'Ảnh đại diện không được vượt quá 2 MB.'
    resetInput()
    return
  }

  selectedFile.value = file
  previewUrl.value = URL.createObjectURL(file)
}

async function saveAvatar() {
  if (!selectedFile.value || uploading.value) {
    return
  }

  uploading.value = true
  successMessage.value = ''
  errorMessage.value = ''

  try {
    const response = await uploadAvatar(selectedFile.value)
    emit('user-updated', response.data)
    selectedFile.value = null
    revokePreview()
    resetInput()
    imageLoadFailed.value = false
    successMessage.value = 'Ảnh đại diện đã được cập nhật.'
  } catch (error) {
    errorMessage.value = `${error.message}. Ảnh đại diện hiện tại vẫn được giữ nguyên.`
  } finally {
    uploading.value = false
  }
}

watch(
  () => props.currentUser.avatar_url,
  () => {
    imageLoadFailed.value = false
  }
)

onBeforeUnmount(revokePreview)
</script>

<template>
  <section class="avatar-editor" aria-labelledby="avatar-editor-title">
    <div class="avatar-editor__heading">
      <div>
        <p class="account-card__eyebrow">Ảnh đại diện</p>
        <h2 id="avatar-editor-title">Hình ảnh tài khoản</h2>
      </div>
      <span class="avatar-editor__status">Công khai</span>
    </div>

    <div class="avatar-editor__content">
      <div class="avatar-editor__portrait-wrap">
        <div class="avatar-editor__portrait">
          <img
            v-if="displayedAvatarUrl"
            :src="displayedAvatarUrl"
            :alt="`Ảnh đại diện của ${currentUser.full_name}`"
            @error="imageLoadFailed = true"
          />
          <span v-else>{{ initials }}</span>
        </div>

        <button
          class="avatar-editor__camera"
          type="button"
          :disabled="uploading"
          aria-label="Chọn ảnh đại diện mới"
          @click="openFilePicker"
        >
          <span class="avatar-editor__camera-icon" aria-hidden="true"></span>
        </button>
      </div>

      <div class="avatar-editor__copy">
        <h3>{{ selectedFile ? 'Ảnh xem trước' : currentUser.full_name }}</h3>
        <p>
          {{ selectedFile
            ? 'Kiểm tra ảnh trước khi lưu thay đổi.'
            : 'Một ảnh rõ nét giúp tài khoản của bạn dễ nhận biết hơn.'
          }}
        </p>
        <small>Chấp nhận JPG, PNG hoặc WebP — dung lượng tối đa 2 MB.</small>
      </div>
    </div>

    <input
      id="profile-avatar"
      ref="fileInput"
      class="visually-hidden"
      accept="image/jpeg,image/png,image/webp"
      type="file"
      :disabled="uploading"
      @change="handleFileSelected"
    />

    <p v-if="fileDetails" class="avatar-editor__file" aria-live="polite">
      {{ fileDetails }}
    </p>

    <div class="avatar-editor__actions">
      <button
        class="account-button account-button--secondary"
        type="button"
        :disabled="uploading"
        @click="openFilePicker"
      >
        {{ selectedFile ? 'Chọn ảnh khác' : 'Thay đổi ảnh đại diện' }}
      </button>

      <button
        v-if="selectedFile"
        class="account-button account-button--quiet"
        type="button"
        :disabled="uploading"
        @click="cancelSelection"
      >
        Hủy
      </button>

      <button
        v-if="selectedFile"
        class="account-button account-button--primary"
        type="button"
        :disabled="uploading"
        @click="saveAvatar"
      >
        {{ uploading ? 'Đang lưu ảnh...' : 'Lưu ảnh đại diện' }}
      </button>
    </div>

    <p v-if="successMessage" class="account-notice account-notice--success" role="status">
      {{ successMessage }}
    </p>
    <p v-if="errorMessage" class="account-notice account-notice--error" role="alert">
      {{ errorMessage }}
    </p>
  </section>
</template>
