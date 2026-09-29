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
      name: 'Color',
      values: colors
    })
  }

  if (sizes.length) {
    definitions.push({
      code: 'size',
      name: 'Size',
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

  return labels.length ? labels.join(' / ') : 'Default variant'
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
    return `${label} can have at most ${maximum} images.`
  }
  if (incomingFiles.some((file) => !allowedImageTypes.has(file.type))) {
    return 'Images must be JPEG, PNG, WebP or AVIF.'
  }
  if (incomingFiles.some((file) => file.size > 5 * 1024 * 1024)) {
    return 'Each image must be 5 MB or smaller.'
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
    fieldErrors.value.images = 'You can use at most 12 images per product.'
    event.target.value = ''
    return
  }

  if (incomingFiles.some((file) => !allowedImageTypes.has(file.type))) {
    fieldErrors.value.images = 'Images must be JPEG, PNG, WebP or AVIF.'
    event.target.value = ''
    return
  }

  if (incomingFiles.some((file) => file.size > 5 * 1024 * 1024)) {
    fieldErrors.value.images = 'Each image must be 5 MB or smaller.'
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
    fieldErrors.value.variants = 'You can upload at most 48 variant images per save.'
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
    categoriesError.value = 'Could not load categories. Please try again.'
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
    label: `Existing image ${image.id}`
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
        label: `Existing variant image ${image.id}`
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
      ? 'This product was not found or you do not have permission to edit it.'
      : error.message || 'Could not load product details.'
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
    errors.title = 'Title must have at least 3 characters.'
  }
  if (description.length < 10) {
    errors.description = 'Description must have at least 10 characters.'
  }
  if (!form.value.category_id) {
    errors.category_id = 'Please select a category.'
  }
  if (form.value.brand.trim().length > 100) {
    errors.brand = 'Brand must be at most 100 characters.'
  }
  if (!Number.isFinite(price) || price <= 0) {
    errors.price = 'Reference price must be greater than zero.'
  }
  if (weight !== null && (!Number.isInteger(weight) || weight <= 0)) {
    errors.weight_grams = 'Weight must be a positive integer.'
  }
  if (media.value.length > 12) {
    errors.images = 'A product can have at most 12 shared images.'
  }
  if (
    !media.value.length &&
    !variants.value.some((variant) => variant.images.length)
  ) {
    errors.images = 'A product needs at least one shared or variant image.'
  }
  if (optionDefinitions.value.some((option) => option.values.length > 20)) {
    errors.options = 'Each option type can have at most 20 values.'
  }
  if (!activeVariants.value.length) {
    errors.variants = 'At least one active variant is required.'
  }

  const normalizedSkus = new Set()

  for (const variant of variants.value) {
    const stockValue = String(variant.stock_quantity).trim()
    const priceValue = String(variant.price).trim()
    const stock = stockValue === '' ? Number.NaN : Number(stockValue)
    const variantPrice = priceValue === '' ? Number.NaN : Number(priceValue)
    const normalizedSku = variant.sku.trim().toUpperCase()

    if (!Number.isInteger(stock) || stock < 0 || stock > 1000000000) {
      errors.variants = `Stock for “${variantLabel(variant)}” must be a non-negative integer.`
      break
    }
    if (!Number.isFinite(variantPrice) || variantPrice <= 0) {
      errors.variants = `Price for “${variantLabel(variant)}” is required and must be greater than zero.`
      break
    }
    if (normalizedSku && normalizedSkus.has(normalizedSku)) {
      errors.variants = 'SKU must be unique within this product.'
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
      price: Number(variant.price),
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
      formError.value = 'This product was changed elsewhere. Reload it before saving again.'
    } else {
      formError.value = error.message || 'Could not save changes. Please try again.'
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
    !window.confirm('You have unsaved changes. Do you still want to leave?')
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
        <h1>Edit product</h1>
        <RouterLink class="seller-breadcrumb" :to="{ name: 'my-products' }">
          ← Manage products
        </RouterLink>
      </header>

      <div v-if="sessionLoading || loading" class="product-edit-loading" role="status">
        <span>Loading product data...</span>
        <i></i><i></i><i></i>
      </div>

      <div v-else-if="!currentUser" class="profile-empty">
        <h3>Sign in to edit products</h3>
        <p>Sign in with the account that owns this product.</p>
        <button type="button" @click="emit('open-auth')">Sign in / Sign up</button>
      </div>

      <div v-else-if="loadError" class="my-products-state my-products-state--error">
        <div class="my-products-state__mark" aria-hidden="true">!</div>
        <div>
          <h3>Could not open editor</h3>
          <p>{{ loadError }}</p>
        </div>
        <button class="account-button account-button--quiet" type="button" @click="loadProduct">
          Try again
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
              <span>Product #{{ product.id }}</span>
              <strong>{{ product.status === 'active' ? 'Active' : product.status === 'unactive' ? 'Inactive' : 'Draft' }}</strong>
            </div>
            <p v-if="isDirty">You have unsaved changes.</p>
            <p v-else>Data is in sync with the server.</p>
          </div>

          <section class="seller-form-section" aria-labelledby="edit-product-basic">
            <div class="seller-form-section__heading">
              <span aria-hidden="true">01</span>
              <div><p>Basic information</p><h2 id="edit-product-basic">Product details</h2></div>
            </div>
          <div class="field">
            <label for="edit-product-title">Title *</label>
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
            <label for="edit-product-description">Description *</label>
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
              <div><p>Images</p><h2 id="edit-product-media">Product gallery</h2></div>
            </div>
          <div class="field">
            <label for="edit-product-images">Image gallery *</label>
            <input
              id="edit-product-images"
              ref="imageInput"
              accept="image/jpeg,image/png,image/webp,image/avif"
              :disabled="submitting"
              multiple
              type="file"
              @change="handleImagesSelected"
            />
            <small>You can select multiple images. This shared gallery is separate from each variant's images.</small>
            <small v-if="fieldErrors.images" class="product-field-error">{{ fieldErrors.images }}</small>
          </div>

          <div v-if="media.length" class="product-image-previews product-edit-images">
            <article
              v-for="(image, index) in media"
              :key="image.key"
              class="product-image-preview"
              :class="{ 'is-primary': index === 0 }"
            >
              <span v-if="index === 0" class="product-image-preview__badge">Main image</span>
              <span v-else-if="image.source === 'new'" class="product-edit-image-new">New</span>
              <img :src="image.previewUrl" :alt="image.label" />
              <div class="product-edit-image-order" aria-label="Reorder images">
                <button
                  type="button"
                  :disabled="submitting || index === 0"
                  :aria-label="`Move ${image.label} left`"
                  @click="moveImage(image.key, -1)"
                >←</button>
                <button
                  type="button"
                  :disabled="submitting || index === media.length - 1"
                  :aria-label="`Move ${image.label} right`"
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
                >Set as main image</button>
                <button
                  class="product-image-preview__remove-action"
                  type="button"
                  :disabled="submitting"
                  @click="removeImage(image.key)"
                >Delete image</button>
              </div>
            </article>
          </div>
          </section>

          <section id="edit-product-variants" class="variant-builder seller-form-section" aria-labelledby="edit-variant-heading" tabindex="-1">
            <div class="variant-builder__heading">
              <div>
                <p class="eyebrow">Variants</p>
                <h2 id="edit-variant-heading">Colors, sizes and stock</h2>
              </div>
              <strong>{{ activeVariants.length }} active · {{ totalStock }} products</strong>
            </div>

            <p v-if="preservedOptions.length" class="product-preserved-options">
              Existing advanced options ({{ preservedOptions.map((option) => option.name).join(', ') }})
              are preserved when saving.
            </p>

            <div class="variant-option-inputs">
              <div class="field">
                <label for="edit-product-colors">Color</label>
                <input id="edit-product-colors" v-model="form.colors" :disabled="submitting" placeholder="Black, White, Blue" />
                <small>Separate values with commas.</small>
              </div>
              <div class="field">
                <label for="edit-product-sizes">Size</label>
                <input id="edit-product-sizes" v-model="form.sizes" :disabled="submitting" placeholder="S, M, L or 39, 40, 41" />
                <small>Leave both fields blank to use the default variant.</small>
              </div>
            </div>
            <small v-if="fieldErrors.options" class="product-field-error">{{ fieldErrors.options }}</small>

            <div class="variant-table-wrap">
              <table class="variant-table">
                <thead>
                  <tr>
                    <th>Selling</th><th>Combination</th><th>SKU</th><th>Variant price *</th><th>Stock *</th><th>Variant gallery</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="variant in variants" :key="variant.key" :class="{ 'is-disabled': !variant.enabled }">
                    <td><input v-model="variant.enabled" type="checkbox" :disabled="submitting" :aria-label="`Sell ${variantLabel(variant)}`" /></td>
                    <th scope="row">{{ variantLabel(variant) }}</th>
                    <td><input v-model="variant.sku" :disabled="submitting" maxlength="64" placeholder="Auto-generate if blank" /></td>
                    <td>
                      <input
                        v-model="variant.price"
                        class="variant-price-input"
                        :aria-label="`Enter variant price for ${variantLabel(variant)}`"
                        :disabled="submitting"
                        inputmode="numeric"
                        pattern="[0-9]*"
                        placeholder="Enter price"
                        type="text"
                        required
                      />
                    </td>
                    <td>
                      <input
                        v-model="variant.stock_quantity"
                        class="variant-stock-input"
                        :aria-label="`Enter stock for ${variantLabel(variant)}`"
                        :disabled="submitting"
                        inputmode="numeric"
                        pattern="[0-9]*"
                        type="text"
                        required
                      />
                    </td>
                    <td>
                      <input
                        accept="image/jpeg,image/png,image/webp,image/avif"
                        :aria-label="`Choose images for ${variantLabel(variant)}`"
                        :disabled="submitting"
                        multiple
                        type="file"
                        @change="handleVariantImagesSelected($event, variant)"
                      />
                      <div v-if="variant.images.length" class="variant-image-list">
                        <figure v-for="(image, imageIndex) in variant.images" :key="image.key">
                          <img :src="image.previewUrl" :alt="image.label" />
                          <span class="variant-image-order-actions">
                            <button type="button" :aria-label="`Move image ${imageIndex + 1} left`" :disabled="submitting || imageIndex === 0" @click="moveVariantImage(variant, image.key, -1)">←</button>
                            <button type="button" :aria-label="`Move image ${imageIndex + 1} right`" :disabled="submitting || imageIndex === variant.images.length - 1" @click="moveVariantImage(variant, image.key, 1)">→</button>
                          </span>
                          <button type="button" :aria-label="`Delete image ${imageIndex + 1} of ${variantLabel(variant)}`" :disabled="submitting" @click="removeVariantImage(variant, image.key)">×</button>
                        </figure>
                      </div>
                      <small>Maximum 8 variant images.</small>
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
            <div><p>Selling settings</p><h2>Visibility settings</h2></div>
          </div>

          <div class="field seller-side-section">
            <label for="edit-product-category">Category *</label>
            <select
              id="edit-product-category"
              v-model="form.category_id"
              :aria-invalid="Boolean(fieldErrors.category_id)"
              :disabled="submitting || categoriesLoading"
              required
            >
              <option value="" disabled>{{ categoriesLoading ? 'Loading categories...' : 'Select a category' }}</option>
              <option v-for="category in categories" :key="category.id" :value="String(category.id)">{{ category.name }}</option>
            </select>
            <small v-if="fieldErrors.category_id" class="product-field-error">{{ fieldErrors.category_id }}</small>
            <div v-if="categoriesError" class="product-category-error" role="alert">
              <span>{{ categoriesError }}</span>
              <button type="button" :disabled="categoriesLoading" @click="loadCategories">Try again</button>
            </div>
          </div>

          <div class="field seller-side-section">
            <label for="edit-product-brand">Brand</label>
            <input id="edit-product-brand" v-model="form.brand" :aria-invalid="Boolean(fieldErrors.brand)" :disabled="submitting" maxlength="100" />
            <small v-if="fieldErrors.brand" class="product-field-error">{{ fieldErrors.brand }}</small>
          </div>

          <div class="field seller-side-section">
            <label for="edit-product-price">Reference price (VND) *</label>
            <input id="edit-product-price" v-model="form.price" :aria-invalid="Boolean(fieldErrors.price)" :disabled="submitting" inputmode="decimal" min="1" step="1000" type="number" required />
            <small>This is the product reference price; every variant still needs its own price.</small>
            <small v-if="fieldErrors.price" class="product-field-error">{{ fieldErrors.price }}</small>
          </div>

          <div class="field seller-side-section">
            <label for="edit-product-weight">Shipping weight (grams)</label>
            <input id="edit-product-weight" v-model="form.weight_grams" :aria-invalid="Boolean(fieldErrors.weight_grams)" :disabled="submitting" inputmode="numeric" min="1" step="1" type="number" />
            <small v-if="fieldErrors.weight_grams" class="product-field-error">{{ fieldErrors.weight_grams }}</small>
          </div>

          <div v-if="conflictDetected" class="product-edit-conflict" role="alert">
            <strong>Newer version detected</strong>
            <p>{{ formError }}</p>
            <button type="button" :disabled="loading || submitting" @click="loadProduct">Reload data</button>
          </div>
          <p v-else-if="formError" class="result error" role="alert">{{ formError }}</p>

          <div class="product-edit-actions">
            <button class="product-submit-button" type="submit" :disabled="submitting || !isDirty">
              <span v-if="submitting" class="seller-button-spinner" aria-hidden="true"></span>
              {{ submitting ? 'Saving changes...' : 'Save changes' }}
            </button>
            <button class="product-edit-cancel" type="button" :disabled="submitting" @click="router.push({ name: 'my-products' })">
              Cancel
            </button>
          </div>

          <p class="product-edit-lock-note">
            Image and variant changes take effect only after they are saved successfully.
          </p>
        </aside>
      </form>
    </section>
  </main>
</template>
