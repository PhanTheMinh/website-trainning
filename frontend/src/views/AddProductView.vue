<script setup>
import BackButton from '../components/BackButton.vue'
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

  return labels.length ? labels.join(' / ') : 'Default variant'
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
  const incomingFiles = Array.from(event.target.files || [])

  if (!incomingFiles.length) {
    return
  }

  if (selectedImages.value.length + incomingFiles.length > 12) {
    formError.value = 'You can select at most 12 images per product.'
    event.target.value = ''
    return
  }

  const invalidType = incomingFiles.find(
    (file) => !allowedImageTypes.has(file.type)
  )

  if (invalidType) {
    formError.value = 'Images must be JPEG, PNG, WebP or AVIF.'
    event.target.value = ''
    return
  }

  const oversizedFile = incomingFiles.find(
    (file) => file.size > 5 * 1024 * 1024
  )

  if (oversizedFile) {
    formError.value = 'Each image must be 5 MB or smaller.'
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
    formError.value = 'You can upload at most 48 variant images per save.'
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
    categoriesError.value = 'Could not load categories. Please try again.'
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
    return { message: 'Title must have at least 3 characters.', target: '#product-title' }
  }

  if (description.length < 10) {
    return { message: 'Description must have at least 10 characters.', target: '#product-description' }
  }

  if (!form.value.category_id) {
    return { message: 'Please select a category.', target: '#product-category' }
  }

  if (form.value.brand.trim().length > 100) {
    return { message: 'Brand must be at most 100 characters.', target: '#product-brand' }
  }

  if (!Number.isFinite(price) || price <= 0) {
    return { message: 'Reference price must be greater than zero.', target: '#product-price' }
  }

  if (
    weight !== null &&
    (!Number.isInteger(weight) || weight <= 0)
  ) {
    return { message: 'Weight must be a positive integer.', target: '#product-weight' }
  }

  if (
    !selectedImages.value.length &&
    !enabledVariants.value.some((variant) => variant.images.length)
  ) {
    return { message: 'Select at least one shared or variant image.', target: '#product-images' }
  }

  if (
    optionDefinitions.value.some((option) => option.values.length > 20)
  ) {
    return { message: 'Each option type can have at most 20 values.', target: '#product-colors' }
  }

  if (!enabledVariants.value.length) {
    return { message: 'At least one active variant is required.', target: '#product-colors' }
  }

  for (const variant of enabledVariants.value) {
    const stockValue = String(variant.stock_quantity).trim()
    const priceValue = String(variant.price).trim()
    const stock = stockValue === '' ? Number.NaN : Number(stockValue)
    const variantPrice = priceValue === '' ? Number.NaN : Number(priceValue)

    if (!Number.isInteger(stock) || stock < 0 || stock > 1000000000) {
      return {
        message: `Stock for “${variantLabel(variant)}” must be a non-negative integer.`,
        target: '.variant-stock-input'
      }
    }

    if (!Number.isFinite(variantPrice) || variantPrice <= 0) {
      return {
        message: `Price for “${variantLabel(variant)}” is required and must be greater than zero.`,
        target: '.variant-price-input'
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
      price: Number(variant.price),
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
        <h1>Add product</h1>
        <BackButton :fallback="{ name: 'my-products' }" />
      </header>

      <div v-if="sessionLoading" class="profile-empty">
        <h3>Checking session...</h3>
      </div>

      <div v-else-if="!currentUser" class="profile-empty">
        <h3>Sign in to add products</h3>
        <p>Sign in before listing a product for sale.</p>
        <button type="button" @click="emit('open-auth')">
          Sign in / Sign up
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
              <div><p>Basic information</p><h2 id="new-product-basic">Product details</h2></div>
            </div>
          <div class="field">
            <label for="product-title">Title *</label>
            <input
              id="product-title"
              v-model="form.title"
              :disabled="submitting"
              maxlength="180"
              placeholder="Example: Nike Pegasus 41 running shoes"
              required
            />
          </div>

          <div class="field">
            <label for="product-description">Description *</label>
            <textarea
              id="product-description"
              v-model="form.description"
              :disabled="submitting"
              maxlength="5000"
              placeholder="Describe condition, materials and highlights..."
              rows="7"
              required
            ></textarea>
          </div>
          </section>

          <section class="seller-form-section" aria-labelledby="new-product-media">
            <div class="seller-form-section__heading">
              <span aria-hidden="true">02</span>
              <div><p>Images</p><h2 id="new-product-media">Product gallery</h2></div>
            </div>
          <div class="field">
            <label for="product-images">Shared images *</label>
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
              You can select multiple JPEG, PNG, WebP or AVIF images; maximum
              12 shared images, 5 MB each. Variant images are managed separately below.
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
                Main image
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
                  Set as main image
                </button>
                <button
                  class="product-image-preview__remove-action"
                  type="button"
                  :disabled="submitting"
                  @click="removeImage(image.id)"
                >
                  Delete image
                </button>
              </div>
            </article>
          </div>
          </section>

          <section class="variant-builder seller-form-section" aria-labelledby="variant-heading">
            <div class="variant-builder__heading">
              <div>
                <p class="eyebrow">Variants</p>
                <h2 id="variant-heading">Colors, sizes and stock</h2>
              </div>
              <strong>{{ enabledVariants.length }} variants · {{ totalStock }} products</strong>
            </div>

            <div class="variant-option-inputs">
              <div class="field">
                <label for="product-colors">Color</label>
                <input
                  id="product-colors"
                  v-model="form.colors"
                  :disabled="submitting"
                  placeholder="Black, White, Blue"
                />
                <small>Separate values with commas.</small>
              </div>
              <div class="field">
                <label for="product-sizes">Size</label>
                <input
                  id="product-sizes"
                  v-model="form.sizes"
                  :disabled="submitting"
                  placeholder="S, M, L or 39, 40, 41"
                />
                <small>Leave both fields blank to use the default variant.</small>
              </div>
            </div>

            <div class="variant-table-wrap">
              <table class="variant-table">
                <thead>
                  <tr>
                    <th>Selling</th>
                    <th>Combination</th>
                    <th>SKU</th>
                    <th>Variant price *</th>
                    <th>Stock *</th>
                    <th>Variant gallery</th>
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
                        :aria-label="`Sell ${variantLabel(variant)}`"
                      />
                    </td>
                    <th scope="row">{{ variantLabel(variant) }}</th>
                    <td>
                      <input
                        v-model="variant.sku"
                        :disabled="submitting || !variant.enabled"
                        maxlength="64"
                        placeholder="Auto-generate if blank"
                      />
                    </td>
                    <td>
                      <input
                        v-model="variant.price"
                        class="variant-price-input"
                        :disabled="submitting || !variant.enabled"
                        :aria-label="`Enter variant price for ${variantLabel(variant)}`"
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
                        :disabled="submitting || !variant.enabled"
                        :aria-label="`Enter stock for ${variantLabel(variant)}`"
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
                        :disabled="submitting || !variant.enabled"
                        multiple
                        type="file"
                        @change="handleVariantImagesSelected($event, variant)"
                      />
                      <div v-if="variant.images.length" class="variant-image-list">
                        <figure v-for="(image, imageIndex) in variant.images" :key="image.id">
                          <img :src="image.previewUrl" :alt="image.file.name" />
                          <span class="variant-image-order-actions">
                            <button type="button" :aria-label="`Move image ${imageIndex + 1} left`" :disabled="submitting || imageIndex === 0" @click="moveVariantImage(variant, image.id, -1)">←</button>
                            <button type="button" :aria-label="`Move image ${imageIndex + 1} right`" :disabled="submitting || imageIndex === variant.images.length - 1" @click="moveVariantImage(variant, image.id, 1)">→</button>
                          </span>
                          <button type="button" :aria-label="`Delete image ${imageIndex + 1} of ${variantLabel(variant)}`" :disabled="submitting" @click="removeVariantImage(variant, image.id)">×</button>
                        </figure>
                      </div>
                      <small>Maximum 8 variant images.</small>
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
            <div><p>Selling settings</p><h2>Ready to sell</h2></div>
          </div>
          <div class="field seller-side-section">
            <label for="product-category">Category *</label>
            <select
              id="product-category"
              v-model="form.category_id"
              :disabled="submitting || categoriesLoading"
              required
            >
              <option value="" disabled>
                {{ categoriesLoading ? 'Loading categories...' : 'Select a category' }}
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
                Try again
              </button>
            </div>
          </div>

          <div class="field seller-side-section">
            <label for="product-brand">Brand</label>
            <input
              id="product-brand"
              v-model="form.brand"
              :disabled="submitting"
              maxlength="100"
              placeholder="Example: Nike"
            />
          </div>

          <div class="field seller-side-section">
            <label for="product-price">Reference price (VND) *</label>
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
            <small>This is the product reference price; every variant still needs its own price.</small>
          </div>

          <div class="field seller-side-section">
            <label for="product-weight">Shipping weight (grams)</label>
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
            The product will be published when it has at least one valid variant. A variant with
            zero stock can still be published but will appear sold out.
          </p>

          <p v-if="formError" class="result error" role="alert">
            {{ formError }}
          </p>

          <div class="product-edit-actions seller-form-actions">
            <button class="product-submit-button" type="submit" :disabled="submitting">
              <span v-if="submitting" class="seller-button-spinner" aria-hidden="true"></span>
              {{ submitting ? 'Publishing product...' : 'Publish product' }}
            </button>
            <RouterLink class="product-edit-cancel" :to="{ name: 'my-products' }">Cancel</RouterLink>
          </div>
        </aside>
      </form>
    </section>
  </main>
</template>
