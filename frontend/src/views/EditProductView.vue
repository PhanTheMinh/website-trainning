<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  watch
} from 'vue'
import {
  RouterLink,
  onBeforeRouteLeave,
  useRoute,
  useRouter
} from 'vue-router'
import { getCategories } from '../services/categoryService.js'
import { API_BASE_URL } from '../services/apiClient.js'
import {
  getManagedProduct,
  updateManagedProduct
} from '../services/productService.js'

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
const route = useRoute()
const router = useRouter()
const imageInput = ref(null)
const product = ref(null)
const media = ref([])
const variants = ref([])
const preservedOptions = ref([])
const categories = ref([])
const loading = ref(false)
const categoriesLoading = ref(false)
const submitting = ref(false)
const loadError = ref('')
const categoriesError = ref('')
const formError = ref('')
const fieldErrors = ref({})
const conflictDetected = ref(false)
const baselineSnapshot = ref('')
const saveSucceeded = ref(false)
const hydrating = ref(false)

let requestSequence = 0

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

  return String(value || '')
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
  const definitions = preservedOptions.value.map((option) => ({
    code: option.code,
    name: option.name,
    values: [...option.values]
  }))
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

const activeVariants = computed(() => variants.value.filter(
  (variant) => variant.enabled
))
const totalStock = computed(() => activeVariants.value.reduce(
  (total, variant) => {
    const quantity = Number(variant.stock_quantity)
    return total + (Number.isInteger(quantity) && quantity >= 0 ? quantity : 0)
  },
  0
))

function buildCombinationKey(optionValues) {
  const entries = Object.entries(optionValues)

  return entries.length
    ? entries
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([code, value]) => `${code}:${String(value).toLocaleLowerCase('vi')}`)
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
  if (hydrating.value) {
    return
  }

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

      return existingByKey.get(key) || {
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

function absoluteImageUrl(imageUrl) {
  return new URL(imageUrl, API_BASE_URL).toString()
}

function clearPreview(image) {
  if (image.source === 'new') {
    URL.revokeObjectURL(image.previewUrl)
  }
}

function clearAllPreviews() {
  media.value.forEach(clearPreview)
  variants.value
    .flatMap((variant) => variant.images || [])
    .forEach(clearPreview)
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
  fieldErrors.value = {
    ...fieldErrors.value,
    images: ''
  }
  const incomingFiles = Array.from(event.target.files || [])

  if (!incomingFiles.length) {
    return
  }

  if (media.value.length + incomingFiles.length > 12) {
    fieldErrors.value.images = 'Chỉ được dùng tối đa 12 ảnh cho một sản phẩm.'
    event.target.value = ''
    return
  }

  if (incomingFiles.some((file) => !allowedImageTypes.has(file.type))) {
    fieldErrors.value.images = 'Ảnh phải có định dạng JPEG, PNG, WebP hoặc AVIF.'
    event.target.value = ''
    return
  }

  if (incomingFiles.some((file) => file.size > 5 * 1024 * 1024)) {
    fieldErrors.value.images = 'Mỗi ảnh không được vượt quá 5 MB.'
    event.target.value = ''
    return
  }

  const timestamp = Date.now()

  media.value.push(...incomingFiles.map((file, index) => ({
    key: `new:${timestamp}-${index}-${file.name}`,
    source: 'new',
    file,
    previewUrl: URL.createObjectURL(file),
    label: file.name
  })))
  event.target.value = ''
}

function removeImage(imageKey) {
  const imageIndex = media.value.findIndex((image) => image.key === imageKey)

  if (imageIndex < 0) {
    return
  }

  clearPreview(media.value[imageIndex])
  media.value.splice(imageIndex, 1)
}

function handleVariantImagesSelected(event, variant) {
  formError.value = ''
  fieldErrors.value = { ...fieldErrors.value, variants: '' }
  const incomingFiles = Array.from(event.target.files || [])
  const pendingVariantImages = variants.value
    .flatMap((item) => item.images)
    .filter((image) => image.source === 'new').length

  if (pendingVariantImages + incomingFiles.length > 48) {
    fieldErrors.value.variants = 'Mỗi lần lưu được tải lên tối đa 48 ảnh variant.'
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
    fieldErrors.value.variants = validationMessage
    event.target.value = ''
    return
  }

  const timestamp = Date.now()
  variant.images.push(...incomingFiles.map((file, index) => ({
    key: `new:${variant.key}:${timestamp}-${index}-${file.name}`,
    source: 'new',
    file,
    previewUrl: URL.createObjectURL(file),
    label: file.name
  })))
  event.target.value = ''
}

function removeVariantImage(variant, imageKey) {
  const imageIndex = variant.images.findIndex((image) => image.key === imageKey)
  if (imageIndex < 0) return
  clearPreview(variant.images[imageIndex])
  variant.images.splice(imageIndex, 1)
}

function moveVariantImage(variant, imageKey, direction) {
  const imageIndex = variant.images.findIndex((image) => image.key === imageKey)
  const targetIndex = imageIndex + direction
  if (imageIndex < 0 || targetIndex < 0 || targetIndex >= variant.images.length) return
  const [image] = variant.images.splice(imageIndex, 1)
  variant.images.splice(targetIndex, 0, image)
}

function moveImage(imageKey, direction) {
  const imageIndex = media.value.findIndex((image) => image.key === imageKey)
  const targetIndex = imageIndex + direction

  if (
    imageIndex < 0 ||
    targetIndex < 0 ||
    targetIndex >= media.value.length
  ) {
    return
  }

  const [movedImage] = media.value.splice(imageIndex, 1)
  media.value.splice(targetIndex, 0, movedImage)
}

function setPrimaryImage(imageKey) {
  const imageIndex = media.value.findIndex((image) => image.key === imageKey)

  if (imageIndex <= 0) {
    return
  }

  const [primaryImage] = media.value.splice(imageIndex, 1)
  media.value.unshift(primaryImage)
}

function snapshotForm() {
  return JSON.stringify({
    form: form.value,
    preservedOptions: preservedOptions.value,
    media: media.value.map((image) => image.key),
    variants: variants.value.map((variant) => ({
      key: variant.key,
      enabled: variant.enabled,
      sku: variant.sku,
      price: variant.price,
      stock_quantity: variant.stock_quantity,
      images: variant.images.map((image) => image.key)
    }))
  })
}

const isDirty = computed(() => Boolean(
  product.value &&
  baselineSnapshot.value &&
  snapshotForm() !== baselineSnapshot.value
))

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

function optionValuesFor(productData, code) {
  return productData.options.find((option) => option.code === code)
    ?.values.map((value) => value.value) || []
}

async function hydrateProduct(productData) {
  hydrating.value = true
  clearAllPreviews()
  product.value = productData
  form.value = {
    title: productData.title || '',
    description: productData.description || '',
    category_id: productData.category_id ? String(productData.category_id) : '',
    brand: productData.brand || '',
    price: String(productData.price ?? ''),
    weight_grams: productData.weight_grams === null
      ? ''
      : String(productData.weight_grams),
    colors: optionValuesFor(productData, 'color').join(', '),
    sizes: optionValuesFor(productData, 'size').join(', ')
  }
  preservedOptions.value = productData.options
    .filter((option) => !['color', 'size'].includes(option.code))
    .map((option) => ({
      code: option.code,
      name: option.name,
      values: option.values.map((value) => value.value)
    }))
  media.value = productData.images.map((image) => ({
    key: `existing:${image.id}`,
    source: 'existing',
    id: image.id,
    imageUrl: image.image_url,
    previewUrl: absoluteImageUrl(image.image_url),
    label: `Ảnh hiện có ${image.id}`
  }))
  variants.value = productData.variants.map((variant) => {
    const optionValues = Object.fromEntries(
      variant.option_values.map((value) => [value.option_code, value.value])
    )

    return {
      key: buildCombinationKey(optionValues),
      option_values: optionValues,
      enabled: variant.status === 'active',
      sku: variant.sku || '',
      price: variant.price === null ? '' : String(variant.price),
      stock_quantity: String(variant.stock_quantity),
      images: (variant.images || []).map((image) => ({
        key: `existing:${image.id}`,
        source: 'existing',
        id: image.id,
        imageUrl: image.image_url,
        previewUrl: absoluteImageUrl(image.image_url),
        label: `Ảnh variant hiện có ${image.id}`
      }))
    }
  })
  await nextTick()
  hydrating.value = false
  syncVariants()
  fieldErrors.value = {}
  formError.value = ''
  conflictDetected.value = false
  baselineSnapshot.value = snapshotForm()
}

async function loadProduct() {
  const currentRequest = ++requestSequence

  loading.value = true
  loadError.value = ''

  try {
    const response = await getManagedProduct(route.params.id)

    if (currentRequest !== requestSequence) {
      return
    }

    await hydrateProduct(response.data)
  } catch (error) {
    if (currentRequest !== requestSequence) {
      return
    }

    loadError.value = error.status === 404
      ? 'Không tìm thấy sản phẩm này hoặc bạn không có quyền chỉnh sửa.'
      : error.message || 'Không thể tải thông tin sản phẩm.'
  } finally {
    if (currentRequest === requestSequence) {
      loading.value = false
    }
  }
}

function validateForm() {
  const errors = {}
  const title = form.value.title.trim()
  const description = form.value.description.trim()
  const price = Number(form.value.price)
  const weight = form.value.weight_grams === ''
    ? null
    : Number(form.value.weight_grams)

  if (title.length < 3) {
    errors.title = 'Tiêu đề phải có ít nhất 3 ký tự.'
  }
  if (description.length < 10) {
    errors.description = 'Mô tả phải có ít nhất 10 ký tự.'
  }
  if (!form.value.category_id) {
    errors.category_id = 'Vui lòng chọn danh mục.'
  }
  if (form.value.brand.trim().length > 100) {
    errors.brand = 'Thương hiệu không được vượt quá 100 ký tự.'
  }
  if (!Number.isFinite(price) || price <= 0) {
    errors.price = 'Giá mặc định phải là số lớn hơn 0.'
  }
  if (weight !== null && (!Number.isInteger(weight) || weight <= 0)) {
    errors.weight_grams = 'Cân nặng phải là số nguyên lớn hơn 0.'
  }
  if (media.value.length > 12) {
    errors.images = 'Sản phẩm chỉ được có tối đa 12 ảnh chung.'
  }
  if (
    !media.value.length &&
    !variants.value.some((variant) => variant.images.length)
  ) {
    errors.images = 'Sản phẩm phải có ít nhất một ảnh chung hoặc ảnh variant.'
  }
  if (optionDefinitions.value.some((option) => option.values.length > 20)) {
    errors.options = 'Mỗi loại tùy chọn chỉ được có tối đa 20 giá trị.'
  }
  if (!activeVariants.value.length) {
    errors.variants = 'Phải có ít nhất một phiên bản đang bán.'
  }

  const normalizedSkus = new Set()

  for (const variant of variants.value) {
    const stock = Number(variant.stock_quantity)
    const variantPrice = variant.price === '' ? null : Number(variant.price)
    const normalizedSku = variant.sku.trim().toUpperCase()

    if (!Number.isInteger(stock) || stock < 0 || stock > 1000000000) {
      errors.variants = `Tồn kho của “${variantLabel(variant)}” phải là số nguyên từ 0 trở lên.`
      break
    }
    if (
      variantPrice !== null &&
      (!Number.isFinite(variantPrice) || variantPrice <= 0)
    ) {
      errors.variants = `Giá của “${variantLabel(variant)}” phải lớn hơn 0 hoặc để trống.`
      break
    }
    if (normalizedSku && normalizedSkus.has(normalizedSku)) {
      errors.variants = 'SKU không được trùng nhau trong cùng một sản phẩm.'
      break
    }
    if (normalizedSku) {
      normalizedSkus.add(normalizedSku)
    }
  }

  fieldErrors.value = errors
  const firstError = Object.keys(errors)[0]

  if (firstError) {
    const fieldId = {
      title: 'edit-product-title',
      description: 'edit-product-description',
      category_id: 'edit-product-category',
      brand: 'edit-product-brand',
      price: 'edit-product-price',
      weight_grams: 'edit-product-weight',
      images: 'edit-product-images',
      options: 'edit-product-colors',
      variants: 'edit-product-variants'
    }[firstError]

    nextTick(() => document.getElementById(fieldId)?.focus())
  }

  return !firstError
}

async function submitProduct() {
  if (submitting.value || !product.value || !validateForm()) {
    return
  }

  submitting.value = true
  formError.value = ''
  conflictDetected.value = false

  try {
    const payload = new FormData()
    const newImages = media.value.filter((image) => image.source === 'new')
    const newImageIndex = new Map(
      newImages.map((image, index) => [image.key, index])
    )
    const imageOrder = media.value.map((image) => image.source === 'existing'
      ? `existing:${image.id}`
      : `new:${newImageIndex.get(image.key)}`
    )
    const newVariantImages = []
    const variantPayload = variants.value.map((variant) => ({
      sku: variant.sku.trim() || null,
      option_values: variant.option_values,
      price: variant.price === '' ? null : Number(variant.price),
      stock_quantity: Number(variant.stock_quantity),
      image_index: null,
      images: variant.images.map((image) => {
        if (image.source === 'existing') return `existing:${image.id}`
        const index = newVariantImages.length
        newVariantImages.push(image.file)
        return `new:${index}`
      }),
      status: variant.enabled ? 'active' : 'inactive'
    }))

    payload.append('title', form.value.title.trim())
    payload.append('description', form.value.description.trim())
    payload.append('category_id', form.value.category_id)
    payload.append('brand', form.value.brand.trim())
    payload.append('price', form.value.price)
    payload.append('weight_grams', form.value.weight_grams)
    payload.append('options', JSON.stringify(optionDefinitions.value))
    payload.append('variants', JSON.stringify(variantPayload))
    payload.append('image_order', JSON.stringify(imageOrder))
    payload.append('updated_at', product.value.updated_at)
    payload.append('lock_version', String(product.value.lock_version))
    newImages.forEach((image) => payload.append('images', image.file))
    newVariantImages.forEach((file) => payload.append('variant_images', file))

    await updateManagedProduct(product.value.id, payload)
    saveSucceeded.value = true
    await router.push({
      name: 'my-products',
      query: { updated: '1' }
    })
  } catch (error) {
    if (error.status === 409) {
      conflictDetected.value = true
      formError.value = 'Sản phẩm đã được thay đổi ở nơi khác. Hãy tải lại dữ liệu trước khi lưu tiếp.'
    } else {
      formError.value = error.message || 'Không thể lưu thay đổi. Vui lòng thử lại.'
    }
  } finally {
    submitting.value = false
  }
}

function handleBeforeUnload(event) {
  if (!isDirty.value || saveSucceeded.value) {
    return
  }

  event.preventDefault()
  event.returnValue = ''
}

watch(
  () => [form.value.colors, form.value.sizes],
  syncVariants
)

watch(
  [
    () => props.sessionLoading,
    () => props.currentUser,
    () => route.params.id
  ],
  () => {
    if (!props.sessionLoading && props.currentUser) {
      loadCategories()
      loadProduct()
    }
  },
  { immediate: true }
)

onBeforeRouteLeave(() => {
  if (
    isDirty.value &&
    !saveSucceeded.value &&
    !window.confirm('Bạn có thay đổi chưa lưu. Bạn vẫn muốn rời trang?')
  ) {
    return false
  }

  return true
})

window.addEventListener('beforeunload', handleBeforeUnload)

onBeforeUnmount(() => {
  requestSequence += 1
  clearAllPreviews()
  window.removeEventListener('beforeunload', handleBeforeUnload)
})
</script>

<template>
  <main class="product-create-page product-edit-page">
    <section class="section product-create-section">
      <header class="seller-form-hero product-edit-heading">
        <div>
          <RouterLink class="seller-breadcrumb" :to="{ name: 'my-products' }">
            Quản lý sản phẩm <span aria-hidden="true">/</span> Chỉnh sửa
          </RouterLink>
          <p class="eyebrow">Seller studio · Chỉnh sửa</p>
          <h1>Hoàn thiện sản phẩm</h1>
          <p>Cập nhật nội dung, thư viện ảnh và tồn kho trong một lần lưu an toàn.</p>
        </div>
        <div class="seller-form-hero__signal" aria-hidden="true">
          <strong>LIVE</strong><span>SYNC CONTROL</span>
        </div>
      </header>

      <div v-if="sessionLoading || loading" class="product-edit-loading" role="status">
        <span>Đang tải dữ liệu sản phẩm...</span>
        <i></i><i></i><i></i>
      </div>

      <div v-else-if="!currentUser" class="profile-empty">
        <h3>Đăng nhập để chỉnh sửa sản phẩm</h3>
        <p>Bạn cần đăng nhập bằng đúng tài khoản sở hữu sản phẩm.</p>
        <button type="button" @click="emit('open-auth')">Đăng nhập / Đăng ký</button>
      </div>

      <div v-else-if="loadError" class="my-products-state my-products-state--error">
        <div class="my-products-state__mark" aria-hidden="true">!</div>
        <div>
          <h3>Không thể mở trình chỉnh sửa</h3>
          <p>{{ loadError }}</p>
        </div>
        <button class="account-button account-button--quiet" type="button" @click="loadProduct">
          Thử lại
        </button>
      </div>

      <form
        v-else-if="product"
        class="product-create-form product-edit-form"
        novalidate
        :aria-busy="submitting"
        @submit.prevent="submitProduct"
      >
        <div class="product-form-main seller-form-stack">
          <div class="product-edit-context">
            <div>
              <span>Sản phẩm #{{ product.id }}</span>
              <strong>{{ product.status === 'active' ? 'Đang bán' : product.status === 'unactive' ? 'Ngưng bán' : 'Bản nháp' }}</strong>
            </div>
            <p v-if="isDirty">Bạn có thay đổi chưa lưu.</p>
            <p v-else>Dữ liệu đang đồng bộ với máy chủ.</p>
          </div>

          <section class="seller-form-section" aria-labelledby="edit-product-basic">
            <div class="seller-form-section__heading">
              <span aria-hidden="true">01</span>
              <div><p>Thông tin cơ bản</p><h2 id="edit-product-basic">Nội dung sản phẩm</h2></div>
            </div>
          <div class="field">
            <label for="edit-product-title">Tiêu đề *</label>
            <input
              id="edit-product-title"
              v-model="form.title"
              :aria-invalid="Boolean(fieldErrors.title)"
              :disabled="submitting"
              maxlength="180"
              required
            />
            <small v-if="fieldErrors.title" class="product-field-error">{{ fieldErrors.title }}</small>
          </div>

          <div class="field">
            <label for="edit-product-description">Mô tả *</label>
            <textarea
              id="edit-product-description"
              v-model="form.description"
              :aria-invalid="Boolean(fieldErrors.description)"
              :disabled="submitting"
              maxlength="5000"
              rows="7"
              required
            ></textarea>
            <small v-if="fieldErrors.description" class="product-field-error">{{ fieldErrors.description }}</small>
          </div>
          </section>

          <section class="seller-form-section" aria-labelledby="edit-product-media">
            <div class="seller-form-section__heading">
              <span aria-hidden="true">02</span>
              <div><p>Hình ảnh</p><h2 id="edit-product-media">Thư viện sản phẩm</h2></div>
            </div>
          <div class="field">
            <label for="edit-product-images">Thư viện ảnh *</label>
            <input
              id="edit-product-images"
              ref="imageInput"
              accept="image/jpeg,image/png,image/webp,image/avif"
              :disabled="submitting"
              multiple
              type="file"
              @change="handleImagesSelected"
            />
            <small>Có thể chọn nhiều ảnh cùng lúc. Đây là thư viện ảnh chung, tách biệt với ảnh từng variant.</small>
            <small v-if="fieldErrors.images" class="product-field-error">{{ fieldErrors.images }}</small>
          </div>

          <div v-if="media.length" class="product-image-previews product-edit-images">
            <article
              v-for="(image, index) in media"
              :key="image.key"
              class="product-image-preview"
              :class="{ 'is-primary': index === 0 }"
            >
              <span v-if="index === 0" class="product-image-preview__badge">Ảnh chính</span>
              <span v-else-if="image.source === 'new'" class="product-edit-image-new">Mới</span>
              <img :src="image.previewUrl" :alt="image.label" />
              <div class="product-edit-image-order" aria-label="Sắp xếp ảnh">
                <button
                  type="button"
                  :disabled="submitting || index === 0"
                  :aria-label="`Đưa ${image.label} sang trái`"
                  @click="moveImage(image.key, -1)"
                >←</button>
                <button
                  type="button"
                  :disabled="submitting || index === media.length - 1"
                  :aria-label="`Đưa ${image.label} sang phải`"
                  @click="moveImage(image.key, 1)"
                >→</button>
              </div>
              <div class="product-image-preview__actions">
                <button
                  v-if="index > 0"
                  class="product-image-preview__primary-action"
                  type="button"
                  :disabled="submitting"
                  @click="setPrimaryImage(image.key)"
                >Đặt làm ảnh chính</button>
                <button
                  class="product-image-preview__remove-action"
                  type="button"
                  :disabled="submitting"
                  @click="removeImage(image.key)"
                >Xóa ảnh</button>
              </div>
            </article>
          </div>
          </section>

          <section id="edit-product-variants" class="variant-builder seller-form-section" aria-labelledby="edit-variant-heading" tabindex="-1">
            <div class="variant-builder__heading">
              <div>
                <p class="eyebrow">Phiên bản</p>
                <h2 id="edit-variant-heading">Màu sắc, kích thước và tồn kho</h2>
              </div>
              <strong>{{ activeVariants.length }} đang bán · {{ totalStock }} sản phẩm</strong>
            </div>

            <p v-if="preservedOptions.length" class="product-preserved-options">
              Các tùy chọn nâng cao hiện có ({{ preservedOptions.map((option) => option.name).join(', ') }})
              được giữ nguyên khi lưu.
            </p>

            <div class="variant-option-inputs">
              <div class="field">
                <label for="edit-product-colors">Màu sắc</label>
                <input id="edit-product-colors" v-model="form.colors" :disabled="submitting" placeholder="Đen, Trắng, Xanh" />
                <small>Phân tách bằng dấu phẩy.</small>
              </div>
              <div class="field">
                <label for="edit-product-sizes">Kích thước</label>
                <input id="edit-product-sizes" v-model="form.sizes" :disabled="submitting" placeholder="S, M, L hoặc 39, 40, 41" />
                <small>Để trống cả hai ô để dùng phiên bản mặc định.</small>
              </div>
            </div>
            <small v-if="fieldErrors.options" class="product-field-error">{{ fieldErrors.options }}</small>

            <div class="variant-table-wrap">
              <table class="variant-table">
                <thead>
                  <tr>
                    <th>Bán</th><th>Tổ hợp</th><th>SKU</th><th>Giá riêng</th><th>Tồn kho *</th><th>Thư viện ảnh riêng</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="variant in variants" :key="variant.key" :class="{ 'is-disabled': !variant.enabled }">
                    <td><input v-model="variant.enabled" type="checkbox" :disabled="submitting" :aria-label="`Bán ${variantLabel(variant)}`" /></td>
                    <th scope="row">{{ variantLabel(variant) }}</th>
                    <td><input v-model="variant.sku" :disabled="submitting" maxlength="64" placeholder="Tự sinh nếu trống" /></td>
                    <td><input v-model="variant.price" :disabled="submitting" min="1" step="1000" type="number" placeholder="Kế thừa" /></td>
                    <td><input v-model="variant.stock_quantity" :disabled="submitting" min="0" step="1" type="number" required /></td>
                    <td>
                      <input
                        accept="image/jpeg,image/png,image/webp,image/avif"
                        :aria-label="`Chọn ảnh cho ${variantLabel(variant)}`"
                        :disabled="submitting"
                        multiple
                        type="file"
                        @change="handleVariantImagesSelected($event, variant)"
                      />
                      <div v-if="variant.images.length" class="variant-image-list">
                        <figure v-for="(image, imageIndex) in variant.images" :key="image.key">
                          <img :src="image.previewUrl" :alt="image.label" />
                          <span class="variant-image-order-actions">
                            <button type="button" :aria-label="`Đưa ảnh ${imageIndex + 1} sang trái`" :disabled="submitting || imageIndex === 0" @click="moveVariantImage(variant, image.key, -1)">←</button>
                            <button type="button" :aria-label="`Đưa ảnh ${imageIndex + 1} sang phải`" :disabled="submitting || imageIndex === variant.images.length - 1" @click="moveVariantImage(variant, image.key, 1)">→</button>
                          </span>
                          <button type="button" :aria-label="`Xóa ảnh ${imageIndex + 1} của ${variantLabel(variant)}`" :disabled="submitting" @click="removeVariantImage(variant, image.key)">×</button>
                        </figure>
                      </div>
                      <small>Tối đa 8 ảnh riêng.</small>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <small v-if="fieldErrors.variants" class="product-field-error">{{ fieldErrors.variants }}</small>
          </section>
        </div>

        <aside class="product-form-sidebar product-edit-sidebar seller-form-sidebar">
          <div class="seller-form-sidebar__heading">
            <span aria-hidden="true">03</span>
            <div><p>Thiết lập bán hàng</p><h2>Kiểm soát hiển thị</h2></div>
          </div>

          <div class="field seller-side-section">
            <label for="edit-product-category">Danh mục *</label>
            <select
              id="edit-product-category"
              v-model="form.category_id"
              :aria-invalid="Boolean(fieldErrors.category_id)"
              :disabled="submitting || categoriesLoading"
              required
            >
              <option value="" disabled>{{ categoriesLoading ? 'Đang tải danh mục...' : 'Chọn danh mục' }}</option>
              <option v-for="category in categories" :key="category.id" :value="String(category.id)">{{ category.name }}</option>
            </select>
            <small v-if="fieldErrors.category_id" class="product-field-error">{{ fieldErrors.category_id }}</small>
            <div v-if="categoriesError" class="product-category-error" role="alert">
              <span>{{ categoriesError }}</span>
              <button type="button" :disabled="categoriesLoading" @click="loadCategories">Thử lại</button>
            </div>
          </div>

          <div class="field seller-side-section">
            <label for="edit-product-brand">Thương hiệu</label>
            <input id="edit-product-brand" v-model="form.brand" :aria-invalid="Boolean(fieldErrors.brand)" :disabled="submitting" maxlength="100" />
            <small v-if="fieldErrors.brand" class="product-field-error">{{ fieldErrors.brand }}</small>
          </div>

          <div class="field seller-side-section">
            <label for="edit-product-price">Giá mặc định (VNĐ) *</label>
            <input id="edit-product-price" v-model="form.price" :aria-invalid="Boolean(fieldErrors.price)" :disabled="submitting" inputmode="decimal" min="1" step="1000" type="number" required />
            <small>Phiên bản để trống giá sẽ kế thừa giá này.</small>
            <small v-if="fieldErrors.price" class="product-field-error">{{ fieldErrors.price }}</small>
          </div>

          <div class="field seller-side-section">
            <label for="edit-product-weight">Cân nặng vận chuyển (gram)</label>
            <input id="edit-product-weight" v-model="form.weight_grams" :aria-invalid="Boolean(fieldErrors.weight_grams)" :disabled="submitting" inputmode="numeric" min="1" step="1" type="number" />
            <small v-if="fieldErrors.weight_grams" class="product-field-error">{{ fieldErrors.weight_grams }}</small>
          </div>

          <div v-if="conflictDetected" class="product-edit-conflict" role="alert">
            <strong>Phát hiện phiên bản mới hơn</strong>
            <p>{{ formError }}</p>
            <button type="button" :disabled="loading || submitting" @click="loadProduct">Tải lại dữ liệu</button>
          </div>
          <p v-else-if="formError" class="result error" role="alert">{{ formError }}</p>

          <div class="product-edit-actions">
            <button class="product-submit-button" type="submit" :disabled="submitting || !isDirty">
              <span v-if="submitting" class="seller-button-spinner" aria-hidden="true"></span>
              {{ submitting ? 'Đang lưu thay đổi...' : 'Lưu thay đổi' }}
            </button>
            <button class="product-edit-cancel" type="button" :disabled="submitting" @click="router.push({ name: 'my-products' })">
              Hủy
            </button>
          </div>

          <p class="product-edit-lock-note">
            Mọi thay đổi ảnh và phiên bản chỉ có hiệu lực sau khi máy chủ lưu thành công.
          </p>
        </aside>
      </form>
    </section>
  </main>
</template>
