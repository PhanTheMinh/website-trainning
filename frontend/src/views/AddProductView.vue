<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { getCategories } from '../services/categoryService.js'
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
const variants = ref([])
const categories = ref([])
const categoriesLoading = ref(false)
const categoriesError = ref('')

const form = ref({
  title: '',
  description: '',
  category_id: '',
  brand: '',
  price: '',
  weight_grams: '',
  sizes: '',
  colors: ''
})

const allowedImageTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif'
])

function parseOptionValues(value) {
  const seen = new Set()

  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => {
      const key = item.toLocaleLowerCase('vi')

      if (!item || seen.has(key)) {
        return false
      }

      seen.add(key)
      return true
    })
}

const optionDefinitions = computed(() => {
  const definitions = []
  const colors = parseOptionValues(form.value.colors)
  const sizes = parseOptionValues(form.value.sizes)

  if (colors.length) {
    definitions.push({
      code: 'color',
      name: 'Màu sắc',
      values: colors
    })
  }

  if (sizes.length) {
    definitions.push({
      code: 'size',
      name: 'Kích thước',
      values: sizes
    })
  }

  return definitions
})

const enabledVariants = computed(() =>
  variants.value.filter((variant) => variant.enabled)
)

const totalStock = computed(() =>
  enabledVariants.value.reduce((total, variant) => {
    const quantity = Number(variant.stock_quantity)
    return total + (Number.isInteger(quantity) && quantity >= 0 ? quantity : 0)
  }, 0)
)

function buildCombinationKey(optionValues) {
  const entries = Object.entries(optionValues)

  return entries.length
    ? entries
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([code, value]) => `${code}:${value.toLocaleLowerCase('vi')}`)
        .join('|')
    : 'default'
}

function buildCombinations(definitions) {
  if (!definitions.length) {
    return [{}]
  }

  return definitions.reduce(
    (combinations, option) => combinations.flatMap(
      (combination) => option.values.map((value) => ({
        ...combination,
        [option.code]: value
      }))
    ),
    [{}]
  )
}

function syncVariants() {
  const existingByKey = new Map(
    variants.value.map((variant) => [variant.key, variant])
  )
  const combinations = buildCombinations(optionDefinitions.value)
  const nextKeys = new Set(
    combinations.map((values) => buildCombinationKey(values))
  )

  variants.value
    .filter((variant) => !nextKeys.has(variant.key))
    .flatMap((variant) => variant.images)
    .forEach(clearPreview)

  variants.value = combinations.map(
    (optionValues) => {
      const key = buildCombinationKey(optionValues)
      const existing = existingByKey.get(key)

      return existing || {
        key,
        option_values: optionValues,
        enabled: true,
        sku: '',
        price: '',
        stock_quantity: '0',
        images: []
      }
    }
  )
}

function variantLabel(variant) {
  const labels = optionDefinitions.value.map(
    (option) => variant.option_values[option.code]
  )

  return labels.length ? labels.join(' / ') : 'Phiên bản mặc định'
}

function clearPreview(image) {
  URL.revokeObjectURL(image.previewUrl)
}

function clearAllPreviews() {
  selectedImages.value.forEach(clearPreview)
  variants.value.flatMap((variant) => variant.images).forEach(clearPreview)
}

function validateIncomingImages(incomingFiles, currentCount, maximum, label) {
  if (currentCount + incomingFiles.length > maximum) {
    return `${label} chỉ được có tối đa ${maximum} ảnh.`
  }
  if (incomingFiles.some((file) => !allowedImageTypes.has(file.type))) {
    return 'Ảnh phải có định dạng JPEG, PNG, WebP hoặc AVIF.'
  }
  if (incomingFiles.some((file) => file.size > 5 * 1024 * 1024)) {
    return 'Mỗi ảnh không được vượt quá 5 MB.'
  }
  return ''
}

function handleImagesSelected(event) {
  formError.value = ''
  const incomingFiles = Array.from(event.target.files || [])

  if (!incomingFiles.length) {
    return
  }

  if (selectedImages.value.length + incomingFiles.length > 12) {
    formError.value = 'Chỉ được chọn tối đa 12 ảnh cho một sản phẩm.'
    event.target.value = ''
    return
  }

  const invalidType = incomingFiles.find(
    (file) => !allowedImageTypes.has(file.type)
  )

  if (invalidType) {
    formError.value = 'Ảnh phải có định dạng JPEG, PNG, WebP hoặc AVIF.'
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

function handleVariantImagesSelected(event, variant) {
  formError.value = ''
  const incomingFiles = Array.from(event.target.files || [])
  const totalVariantImages = variants.value.reduce(
    (total, item) => total + item.images.length,
    0
  )

  if (totalVariantImages + incomingFiles.length > 48) {
    formError.value = 'Mỗi lần lưu được tải lên tối đa 48 ảnh variant.'
    event.target.value = ''
    return
  }
  const validationMessage = validateIncomingImages(
    incomingFiles,
    variant.images.length,
    8,
    `Variant “${variantLabel(variant)}”`
  )

  if (validationMessage) {
    formError.value = validationMessage
    event.target.value = ''
    return
  }

  const timestamp = Date.now()
  variant.images.push(...incomingFiles.map((file, index) => ({
    id: `${variant.key}-${timestamp}-${index}-${file.name}`,
    file,
    previewUrl: URL.createObjectURL(file)
  })))
  event.target.value = ''
}

function removeVariantImage(variant, imageId) {
  const imageIndex = variant.images.findIndex((image) => image.id === imageId)
  if (imageIndex < 0) return
  clearPreview(variant.images[imageIndex])
  variant.images.splice(imageIndex, 1)
}

function moveVariantImage(variant, imageId, direction) {
  const imageIndex = variant.images.findIndex((image) => image.id === imageId)
  const targetIndex = imageIndex + direction
  if (imageIndex < 0 || targetIndex < 0 || targetIndex >= variant.images.length) return
  const [image] = variant.images.splice(imageIndex, 1)
  variant.images.splice(targetIndex, 0, image)
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

async function loadCategories() {
  categoriesLoading.value = true
  categoriesError.value = ''

  try {
    const response = await getCategories()
    categories.value = response.data
  } catch {
    categoriesError.value = 'Không thể tải danh mục. Vui lòng thử lại.'
  } finally {
    categoriesLoading.value = false
  }
}

function validateForm() {
  const title = form.value.title.trim()
  const description = form.value.description.trim()
  const price = Number(form.value.price)
  const weight = form.value.weight_grams === ''
    ? null
    : Number(form.value.weight_grams)

  if (title.length < 3) {
    return { message: 'Tiêu đề phải có ít nhất 3 ký tự.', target: '#product-title' }
  }

  if (description.length < 10) {
    return { message: 'Mô tả phải có ít nhất 10 ký tự.', target: '#product-description' }
  }

  if (!form.value.category_id) {
    return { message: 'Vui lòng chọn danh mục.', target: '#product-category' }
  }

  if (form.value.brand.trim().length > 100) {
    return { message: 'Thương hiệu không được vượt quá 100 ký tự.', target: '#product-brand' }
  }

  if (!Number.isFinite(price) || price <= 0) {
    return { message: 'Giá mặc định phải là số lớn hơn 0.', target: '#product-price' }
  }

  if (
    weight !== null &&
    (!Number.isInteger(weight) || weight <= 0)
  ) {
    return { message: 'Cân nặng phải là số nguyên lớn hơn 0.', target: '#product-weight' }
  }

  if (
    !selectedImages.value.length &&
    !enabledVariants.value.some((variant) => variant.images.length)
  ) {
    return { message: 'Vui lòng chọn ít nhất một ảnh chung hoặc ảnh variant.', target: '#product-images' }
  }

  if (
    optionDefinitions.value.some((option) => option.values.length > 20)
  ) {
    return { message: 'Mỗi loại tùy chọn chỉ được có tối đa 20 giá trị.', target: '#product-colors' }
  }

  if (!enabledVariants.value.length) {
    return { message: 'Phải có ít nhất một phiên bản đang bán.', target: '#product-colors' }
  }

  for (const variant of enabledVariants.value) {
    const stock = Number(variant.stock_quantity)
    const variantPrice = variant.price === ''
      ? null
      : Number(variant.price)

    if (!Number.isInteger(stock) || stock < 0 || stock > 1000000000) {
      return {
        message: `Tồn kho của “${variantLabel(variant)}” phải là số nguyên từ 0 trở lên.`,
        target: '.variant-table input[type="number"]'
      }
    }

    if (
      variantPrice !== null &&
      (!Number.isFinite(variantPrice) || variantPrice <= 0)
    ) {
      return {
        message: `Giá của “${variantLabel(variant)}” phải lớn hơn 0 hoặc để trống.`,
        target: '.variant-table input[type="number"]'
      }
    }
  }

  return null
}

async function submitProduct() {
  const validationError = validateForm()
  formError.value = validationError?.message || ''

  if (validationError) {
    await nextTick()
    document.querySelector(validationError.target)?.focus()
    return
  }

  submitting.value = true

  try {
    const payload = new FormData()
    const variantFiles = []
    const variantPayload = enabledVariants.value.map((variant) => ({
      sku: variant.sku.trim() || null,
      option_values: variant.option_values,
      price: variant.price === '' ? null : Number(variant.price),
      stock_quantity: Number(variant.stock_quantity),
      image_index: null,
      images: variant.images.map((image) => {
        const index = variantFiles.length
        variantFiles.push(image.file)
        return `new:${index}`
      }),
      status: 'active'
    }))

    payload.append('title', form.value.title.trim())
    payload.append('description', form.value.description.trim())
    payload.append('category_id', form.value.category_id)
    payload.append('brand', form.value.brand.trim())
    payload.append('price', form.value.price)
    payload.append('weight_grams', form.value.weight_grams)
    payload.append('options', JSON.stringify(optionDefinitions.value))
    payload.append('variants', JSON.stringify(variantPayload))

    selectedImages.value.forEach((image) => {
      payload.append('images', image.file)
    })
    variantFiles.forEach((file) => payload.append('variant_images', file))

    await createProduct(payload)
    clearAllPreviews()
    selectedImages.value = []

    await router.push({
      name: 'my-products',
      query: {
        created: '1'
      }
    })
  } catch (error) {
    formError.value = error.message
  } finally {
    submitting.value = false
  }
}

watch(
  () => [form.value.colors, form.value.sizes],
  syncVariants,
  { immediate: true }
)

onBeforeUnmount(clearAllPreviews)
onMounted(loadCategories)
</script>

<template>
  <main class="product-create-page">
    <section class="section product-create-section">
      <header class="seller-form-hero">
        <div>
          <RouterLink class="seller-breadcrumb" :to="{ name: 'my-products' }">
            Quản lý sản phẩm <span aria-hidden="true">/</span> Thêm mới
          </RouterLink>
          <p class="eyebrow">Đăng bán · Seller studio</p>
          <h1>Thêm sản phẩm</h1>
          <p>Tạo thông tin, thư viện ảnh và tồn kho từng phiên bản trong một luồng tập trung.</p>
        </div>
        <div class="seller-form-hero__signal" aria-hidden="true">
          <strong>01</strong><span>READY TO LIST</span>
        </div>
      </header>

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
        <div class="product-form-main seller-form-stack">
          <section class="seller-form-section" aria-labelledby="new-product-basic">
            <div class="seller-form-section__heading">
              <span aria-hidden="true">01</span>
              <div><p>Thông tin cơ bản</p><h2 id="new-product-basic">Nội dung sản phẩm</h2></div>
            </div>
          <div class="field">
            <label for="product-title">Tiêu đề *</label>
            <input
              id="product-title"
              v-model="form.title"
              :disabled="submitting"
              maxlength="180"
              placeholder="Ví dụ: Giày chạy bộ Nike Pegasus 41"
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
          </section>

          <section class="seller-form-section" aria-labelledby="new-product-media">
            <div class="seller-form-section__heading">
              <span aria-hidden="true">02</span>
              <div><p>Hình ảnh</p><h2 id="new-product-media">Thư viện sản phẩm</h2></div>
            </div>
          <div class="field">
            <label for="product-images">Hình ảnh chung *</label>
            <input
              id="product-images"
              ref="imageInput"
              accept="image/jpeg,image/png,image/webp,image/avif"
              :disabled="submitting"
              multiple
              type="file"
              @change="handleImagesSelected"
            />
            <small>
              Có thể chọn nhiều ảnh cùng lúc. JPEG, PNG, WebP hoặc AVIF; tối đa
              12 ảnh chung, mỗi ảnh 5 MB. Ảnh variant được quản lý riêng bên dưới.
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
                  @click="setPrimaryImage(image.id)"
                >
                  Đặt làm ảnh chính
                </button>
                <button
                  class="product-image-preview__remove-action"
                  type="button"
                  :disabled="submitting"
                  @click="removeImage(image.id)"
                >
                  Xóa ảnh
                </button>
              </div>
            </article>
          </div>
          </section>

          <section class="variant-builder seller-form-section" aria-labelledby="variant-heading">
            <div class="variant-builder__heading">
              <div>
                <p class="eyebrow">Phiên bản</p>
                <h2 id="variant-heading">Màu sắc, kích thước và tồn kho</h2>
              </div>
              <strong>{{ enabledVariants.length }} phiên bản · {{ totalStock }} sản phẩm</strong>
            </div>

            <div class="variant-option-inputs">
              <div class="field">
                <label for="product-colors">Màu sắc</label>
                <input
                  id="product-colors"
                  v-model="form.colors"
                  :disabled="submitting"
                  placeholder="Đen, Trắng, Xanh"
                />
                <small>Phân tách bằng dấu phẩy.</small>
              </div>
              <div class="field">
                <label for="product-sizes">Kích thước</label>
                <input
                  id="product-sizes"
                  v-model="form.sizes"
                  :disabled="submitting"
                  placeholder="S, M, L hoặc 39, 40, 41"
                />
                <small>Để trống cả hai ô để dùng variant mặc định.</small>
              </div>
            </div>

            <div class="variant-table-wrap">
              <table class="variant-table">
                <thead>
                  <tr>
                    <th>Bán</th>
                    <th>Tổ hợp</th>
                    <th>SKU</th>
                    <th>Giá riêng</th>
                    <th>Tồn kho *</th>
                    <th>Thư viện ảnh riêng</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="variant in variants"
                    :key="variant.key"
                    :class="{ 'is-disabled': !variant.enabled }"
                  >
                    <td>
                      <input
                        v-model="variant.enabled"
                        type="checkbox"
                        :disabled="submitting || variants.length === 1"
                        :aria-label="`Bán ${variantLabel(variant)}`"
                      />
                    </td>
                    <th scope="row">{{ variantLabel(variant) }}</th>
                    <td>
                      <input
                        v-model="variant.sku"
                        :disabled="submitting || !variant.enabled"
                        maxlength="64"
                        placeholder="Tự sinh nếu trống"
                      />
                    </td>
                    <td>
                      <input
                        v-model="variant.price"
                        :disabled="submitting || !variant.enabled"
                        min="1"
                        step="1000"
                        type="number"
                        placeholder="Kế thừa"
                      />
                    </td>
                    <td>
                      <input
                        v-model="variant.stock_quantity"
                        :disabled="submitting || !variant.enabled"
                        min="0"
                        step="1"
                        type="number"
                        required
                      />
                    </td>
                    <td>
                      <input
                        accept="image/jpeg,image/png,image/webp,image/avif"
                        :aria-label="`Chọn ảnh cho ${variantLabel(variant)}`"
                        :disabled="submitting || !variant.enabled"
                        multiple
                        type="file"
                        @change="handleVariantImagesSelected($event, variant)"
                      />
                      <div v-if="variant.images.length" class="variant-image-list">
                        <figure v-for="(image, imageIndex) in variant.images" :key="image.id">
                          <img :src="image.previewUrl" :alt="image.file.name" />
                          <span class="variant-image-order-actions">
                            <button type="button" :aria-label="`Đưa ảnh ${imageIndex + 1} sang trái`" :disabled="submitting || imageIndex === 0" @click="moveVariantImage(variant, image.id, -1)">←</button>
                            <button type="button" :aria-label="`Đưa ảnh ${imageIndex + 1} sang phải`" :disabled="submitting || imageIndex === variant.images.length - 1" @click="moveVariantImage(variant, image.id, 1)">→</button>
                          </span>
                          <button type="button" :aria-label="`Xóa ảnh ${imageIndex + 1} của ${variantLabel(variant)}`" :disabled="submitting" @click="removeVariantImage(variant, image.id)">×</button>
                        </figure>
                      </div>
                      <small>Tối đa 8 ảnh riêng.</small>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside class="product-form-sidebar seller-form-sidebar">
          <div class="seller-form-sidebar__heading">
            <span aria-hidden="true">03</span>
            <div><p>Thiết lập bán hàng</p><h2>Sẵn sàng lên kệ</h2></div>
          </div>
          <div class="field seller-side-section">
            <label for="product-category">Danh mục *</label>
            <select
              id="product-category"
              v-model="form.category_id"
              :disabled="submitting || categoriesLoading"
              required
            >
              <option value="" disabled>
                {{ categoriesLoading ? 'Đang tải danh mục...' : 'Chọn danh mục' }}
              </option>
              <option
                v-for="category in categories"
                :key="category.id"
                :value="String(category.id)"
              >
                {{ category.name }}
              </option>
            </select>
            <div v-if="categoriesError" class="product-category-error" role="alert">
              <span>{{ categoriesError }}</span>
              <button type="button" :disabled="categoriesLoading" @click="loadCategories">
                Thử lại
              </button>
            </div>
          </div>

          <div class="field seller-side-section">
            <label for="product-brand">Thương hiệu</label>
            <input
              id="product-brand"
              v-model="form.brand"
              :disabled="submitting"
              maxlength="100"
              placeholder="Ví dụ: Nike"
            />
          </div>

          <div class="field seller-side-section">
            <label for="product-price">Giá mặc định (VNĐ) *</label>
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
            <small>Variant để trống giá sẽ kế thừa giá này.</small>
          </div>

          <div class="field seller-side-section">
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

          <p class="variant-publish-note">
            Sản phẩm sẽ được đăng khi có ít nhất một variant hợp lệ. Variant
            tồn kho 0 vẫn được đăng nhưng sẽ hiển thị hết hàng.
          </p>

          <p v-if="formError" class="result error" role="alert">
            {{ formError }}
          </p>

          <div class="product-edit-actions seller-form-actions">
            <button class="product-submit-button" type="submit" :disabled="submitting">
              <span v-if="submitting" class="seller-button-spinner" aria-hidden="true"></span>
              {{ submitting ? 'Đang đăng sản phẩm...' : 'Đăng sản phẩm' }}
            </button>
            <RouterLink class="product-edit-cancel" :to="{ name: 'my-products' }">Hủy</RouterLink>
          </div>
        </aside>
      </form>
    </section>
  </main>
</template>
