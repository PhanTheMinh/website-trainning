<script setup>
import { onBeforeUnmount, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { categories } from '../data/catalog.js'
import { createProduct } from '../services/productService.js'

defineProps({
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
const router = useRouter()
const imageInput = ref(null)
const selectedImages = ref([])
const submitting = ref(false)
const formError = ref('')

const form = ref({
  title: '',
  description: '',
  category: '',
  price: '',
  stock: '',
  weight_grams: '',
  sizes: '',
  colors: ''
})

const allowedImageTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp'
])

function clearPreview(image) {
  URL.revokeObjectURL(image.previewUrl)
}

function clearAllPreviews() {
  selectedImages.value.forEach(clearPreview)
}

function handleImagesSelected(event) {
  formError.value = ''
  const incomingFiles = Array.from(event.target.files || [])

  if (!incomingFiles.length) {
    return
  }

  if (selectedImages.value.length + incomingFiles.length > 6) {
    formError.value = 'Chỉ được chọn tối đa 6 ảnh cho một sản phẩm.'
    event.target.value = ''
    return
  }

  const invalidType = incomingFiles.find(
    (file) => !allowedImageTypes.has(file.type)
  )

  if (invalidType) {
    formError.value = 'Ảnh phải có định dạng JPEG, PNG hoặc WebP.'
    event.target.value = ''
    return
  }

  const oversizedFile = incomingFiles.find(
    (file) => file.size > 5 * 1024 * 1024
  )

  if (oversizedFile) {
    formError.value = 'Mỗi ảnh không được vượt quá 5 MB.'
    event.target.value = ''
    return
  }

  const timestamp = Date.now()
  selectedImages.value.push(
    ...incomingFiles.map((file, index) => ({
      id: `${timestamp}-${index}-${file.name}`,
      file,
      previewUrl: URL.createObjectURL(file)
    }))
  )

  event.target.value = ''
}

function removeImage(imageId) {
  const imageIndex = selectedImages.value.findIndex(
    (image) => image.id === imageId
  )

  if (imageIndex < 0) {
    return
  }

  clearPreview(selectedImages.value[imageIndex])
  selectedImages.value.splice(imageIndex, 1)
}

function setPrimaryImage(imageId) {
  const imageIndex = selectedImages.value.findIndex(
    (image) => image.id === imageId
  )

  if (imageIndex <= 0) {
    return
  }

  const [primaryImage] = selectedImages.value.splice(imageIndex, 1)
  selectedImages.value.unshift(primaryImage)
}

function parseVariants(value) {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    )
  )
}

function validateForm() {
  const title = form.value.title.trim()
  const description = form.value.description.trim()
  const price = Number(form.value.price)
  const stock = Number(form.value.stock)
  const weight = form.value.weight_grams === ''
    ? null
    : Number(form.value.weight_grams)

  if (title.length < 3) {
    return 'Tiêu đề phải có ít nhất 3 ký tự.'
  }

  if (description.length < 10) {
    return 'Mô tả phải có ít nhất 10 ký tự.'
  }

  if (!form.value.category) {
    return 'Vui lòng chọn danh mục.'
  }

  if (!Number.isFinite(price) || price <= 0) {
    return 'Giá bán phải là số lớn hơn 0.'
  }

  if (!Number.isInteger(stock) || stock < 0) {
    return 'Số lượng tồn kho phải là số nguyên từ 0 trở lên.'
  }

  if (
    weight !== null &&
    (!Number.isInteger(weight) || weight <= 0)
  ) {
    return 'Cân nặng phải là số nguyên lớn hơn 0.'
  }

  if (!selectedImages.value.length) {
    return 'Vui lòng chọn ít nhất một ảnh sản phẩm.'
  }

  return ''
}

async function submitProduct() {
  formError.value = validateForm()

  if (formError.value) {
    return
  }

  submitting.value = true

  try {
    const payload = new FormData()

    payload.append('title', form.value.title.trim())
    payload.append('description', form.value.description.trim())
    payload.append('category', form.value.category)
    payload.append('price', form.value.price)
    payload.append('stock', form.value.stock)
    payload.append('weight_grams', form.value.weight_grams)
    payload.append('sizes', JSON.stringify(parseVariants(form.value.sizes)))
    payload.append('colors', JSON.stringify(parseVariants(form.value.colors)))

    selectedImages.value.forEach((image) => {
      payload.append('images', image.file)
    })

    const response = await createProduct(payload)
    clearAllPreviews()
    selectedImages.value = []

    await router.push({
      name: 'product-detail',
      params: {
        id: response.data.id
      },
      query: {
        created: '1',
        fromCategory: form.value.category
      }
    })
  } catch (error) {
    formError.value = error.message
  } finally {
    submitting.value = false
  }
}

onBeforeUnmount(clearAllPreviews)
</script>

<template>
  <main class="product-create-page">
    <section class="section product-create-section">
      <RouterLink class="profile-back" to="/products">
        ← Quay lại sản phẩm
      </RouterLink>

      <div class="section-heading">
        <p class="eyebrow">Đăng bán</p>
        <h1>Thêm sản phẩm</h1>
        <p>
          Điền thông tin sản phẩm. Tài khoản của bạn sẽ được ghi nhận là chủ
          sở hữu sản phẩm này.
        </p>
      </div>

      <div v-if="sessionLoading" class="profile-empty">
        <h3>Đang kiểm tra phiên đăng nhập...</h3>
      </div>

      <div v-else-if="!currentUser" class="profile-empty">
        <h3>Đăng nhập để thêm sản phẩm</h3>
        <p>Bạn cần đăng nhập trước khi đăng sản phẩm bán.</p>
        <button type="button" @click="emit('open-auth')">
          Login / Register
        </button>
      </div>

      <form
        v-else
        class="product-create-form"
        novalidate
        :aria-busy="submitting"
        @submit.prevent="submitProduct"
      >
        <div class="product-form-main">
          <div class="field">
            <label for="product-title">Tiêu đề *</label>
            <input
              id="product-title"
              v-model="form.title"
              :disabled="submitting"
              maxlength="180"
              placeholder="Ví dụ: Giày chạy bộ nhẹ dành cho đường dài"
              required
            />
          </div>

          <div class="field">
            <label for="product-description">Mô tả *</label>
            <textarea
              id="product-description"
              v-model="form.description"
              :disabled="submitting"
              maxlength="5000"
              placeholder="Mô tả tình trạng, chất liệu và điểm nổi bật..."
              rows="7"
              required
            ></textarea>
          </div>

          <div class="field">
            <label for="product-images">Hình ảnh *</label>
            <input
              id="product-images"
              ref="imageInput"
              accept="image/jpeg,image/png,image/webp"
              :disabled="submitting"
              multiple
              type="file"
              @change="handleImagesSelected"
            />
            <small>
              JPEG, PNG hoặc WebP; tối đa 6 ảnh, mỗi ảnh 5 MB. Ảnh đầu tiên
              sẽ là ảnh chính.
            </small>
          </div>

          <div v-if="selectedImages.length" class="product-image-previews">
            <article
              v-for="(image, index) in selectedImages"
              :key="image.id"
              class="product-image-preview"
              :class="{ 'is-primary': index === 0 }"
            >
              <span v-if="index === 0" class="product-image-preview__badge">
                Ảnh chính
              </span>
              <img :src="image.previewUrl" :alt="image.file.name" />
              <div class="product-image-preview__actions">
                <button
                  v-if="index > 0"
                  class="product-image-preview__primary-action"
                  type="button"
                  :disabled="submitting"
                  :aria-label="`Đặt ${image.file.name} làm ảnh chính`"
                  @click="setPrimaryImage(image.id)"
                >
                  Đặt làm ảnh chính
                </button>
                <button
                  class="product-image-preview__remove-action"
                  type="button"
                  :disabled="submitting"
                  :aria-label="`Xóa ảnh ${image.file.name}`"
                  @click="removeImage(image.id)"
                >
                  Xóa ảnh
                </button>
              </div>
            </article>
          </div>
        </div>

        <aside class="product-form-sidebar">
          <div class="field">
            <label for="product-category">Danh mục *</label>
            <select
              id="product-category"
              v-model="form.category"
              :disabled="submitting"
              required
            >
              <option value="" disabled>Chọn danh mục</option>
              <option
                v-for="category in categories"
                :key="category.slug"
                :value="category.value"
              >
                {{ category.name }}
              </option>
            </select>
          </div>

          <div class="field">
            <label for="product-price">Giá bán (VNĐ) *</label>
            <input
              id="product-price"
              v-model="form.price"
              :disabled="submitting"
              inputmode="decimal"
              min="1"
              step="1000"
              type="number"
              required
            />
          </div>

          <div class="field">
            <label for="product-stock">Số lượng tồn kho *</label>
            <input
              id="product-stock"
              v-model="form.stock"
              :disabled="submitting"
              inputmode="numeric"
              min="0"
              step="1"
              type="number"
              required
            />
          </div>

          <div class="field">
            <label for="product-weight">Cân nặng vận chuyển (gram)</label>
            <input
              id="product-weight"
              v-model="form.weight_grams"
              :disabled="submitting"
              inputmode="numeric"
              min="1"
              step="1"
              type="number"
            />
          </div>

          <div class="field">
            <label for="product-sizes">Size</label>
            <input
              id="product-sizes"
              v-model="form.sizes"
              :disabled="submitting"
              placeholder="S, M, L hoặc 39, 40, 41"
            />
            <small>Phân tách các lựa chọn bằng dấu phẩy.</small>
          </div>

          <div class="field">
            <label for="product-colors">Màu sắc</label>
            <input
              id="product-colors"
              v-model="form.colors"
              :disabled="submitting"
              placeholder="Đen, Trắng, Xanh"
            />
            <small>Phân tách các lựa chọn bằng dấu phẩy.</small>
          </div>

          <p v-if="formError" class="result error" role="alert">
            {{ formError }}
          </p>

          <button
            class="product-submit-button"
            type="submit"
            :disabled="submitting"
          >
            {{ submitting ? 'Đang đăng sản phẩm...' : 'Đăng sản phẩm' }}
          </button>
        </aside>
      </form>
    </section>
  </main>
</template>
