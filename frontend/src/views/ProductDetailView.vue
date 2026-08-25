<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { formatCurrency } from '../data/catalog.js'
import {
  getCategoryBySlug,
  getCategoryName
} from '../data/categories.js'
import { API_BASE_URL } from '../services/apiClient.js'
import { getProduct } from '../services/productService.js'
import { buildProductGallery } from '../utils/productGallery.js'

const emit = defineEmits(['add-to-cart'])
const props = defineProps({
  cartItems: {
    type: Array,
    default: () => []
  }
})
const route = useRoute()
const product = ref(null)
const loading = ref(true)
const loadError = ref('')
const selectedImageUrl = ref('')
const selectedOptionValues = ref({})
let productRequestSequence = 0

const sourceCategory = computed(() =>
  getCategoryBySlug(String(route.query.fromCategory || ''))
)

const backRoute = computed(() =>
  sourceCategory.value
    ? {
        name: 'category',
        params: { slug: sourceCategory.value.slug }
      }
    : { name: 'products' }
)

const categoryName = computed(() =>
  product.value ? getCategoryName(product.value.category) : ''
)

const galleryImages = computed(() =>
  buildProductGallery(product.value, selectedOptionValues.value).map((image) => ({
    ...image,
    absoluteUrl: new URL(image.image_url, API_BASE_URL).toString()
  }))
)

const galleryLabel = computed(() => {
  const color = selectedOptionValues.value.color
  return color && galleryImages.value.some((image) => image.source === 'variant')
    ? `Ảnh phiên bản màu ${color}`
    : 'Ảnh tổng quan sản phẩm'
})

const mainImageUrl = computed(
  () => selectedImageUrl.value || galleryImages.value[0]?.absoluteUrl || ''
)

const activeVariants = computed(() =>
  (product.value?.variants || []).filter(
    (variant) => variant.status === 'active'
  )
)

const purchasableVariants = computed(() =>
  activeVariants.value.filter((variant) => variant.stock_quantity > 0)
)

function getVariantOptionMap(variant) {
  return Object.fromEntries(
    (variant.option_values || []).map((optionValue) => [
      optionValue.option_code,
      optionValue.value
    ])
  )
}

function variantMatches(variant, selections) {
  const variantOptions = getVariantOptionMap(variant)

  return Object.entries(selections).every(
    ([code, value]) => variantOptions[code] === value
  )
}

const selectedVariant = computed(() => {
  if (!product.value) {
    return null
  }

  if (!product.value.options.length) {
    return activeVariants.value.find((variant) => variant.is_default) ||
      activeVariants.value[0] ||
      null
  }

  if (
    Object.keys(selectedOptionValues.value).length !==
    product.value.options.length
  ) {
    return null
  }

  return activeVariants.value.find(
    (variant) => variantMatches(variant, selectedOptionValues.value)
  ) || null
})

const displayPrice = computed(() =>
  selectedVariant.value?.effective_price ?? product.value?.price ?? 0
)

const displayStock = computed(() => {
  if (selectedVariant.value) {
    return selectedVariant.value.stock_quantity
  }

  return product.value?.stock || 0
})

const needsVariantSelection = computed(() =>
  Boolean(product.value?.options.length && !selectedVariant.value)
)

const canAddToCart = computed(() =>
  Boolean(
    selectedVariant.value &&
    selectedVariant.value.stock_quantity > 0 &&
    quantityInCart.value < selectedVariant.value.stock_quantity
  )
)

const quantityInCart = computed(() => {
  if (!selectedVariant.value) {
    return 0
  }

  const key = `database-variant-${selectedVariant.value.id}`
  return props.cartItems.filter((item) => item.catalogKey === key).length
})

function isOptionValuePurchasable(optionCode, value) {
  const selections = {
    ...selectedOptionValues.value,
    [optionCode]: value
  }

  return purchasableVariants.value.some(
    (variant) => variantMatches(variant, selections)
  )
}

function isOptionValueOutOfStock(optionCode, value) {
  const selections = {
    ...selectedOptionValues.value,
    [optionCode]: value
  }
  const matching = activeVariants.value.filter(
    (variant) => variantMatches(variant, selections)
  )

  return matching.length > 0 && matching.every(
    (variant) => variant.stock_quantity <= 0
  )
}

function selectOption(optionCode, value) {
  if (selectedOptionValues.value[optionCode] === value) {
    const nextSelection = {
      ...selectedOptionValues.value
    }
    delete nextSelection[optionCode]
    selectedOptionValues.value = nextSelection
    return
  }

  if (!isOptionValuePurchasable(optionCode, value)) {
    return
  }

  const nextSelection = {
    ...selectedOptionValues.value,
    [optionCode]: value
  }

  if (!purchasableVariants.value.some(
    (variant) => variantMatches(variant, nextSelection)
  )) {
    selectedOptionValues.value = {
      [optionCode]: value
    }
    return
  }

  selectedOptionValues.value = nextSelection
}

async function loadProduct(productId) {
  const currentRequest = ++productRequestSequence

  loading.value = true
  loadError.value = ''
  product.value = null
  selectedImageUrl.value = ''
  selectedOptionValues.value = {}

  try {
    const response = await getProduct(productId)

    if (currentRequest !== productRequestSequence) {
      return
    }

    product.value = response.data
  } catch (error) {
    if (currentRequest === productRequestSequence) {
      loadError.value = error.message
    }
  } finally {
    if (currentRequest === productRequestSequence) {
      loading.value = false
    }
  }
}

function addProductToCart() {
  if (!product.value || !canAddToCart.value) {
    return
  }

  const variant = selectedVariant.value

  emit('add-to-cart', {
    id: product.value.id,
    product_id: product.value.id,
    variant_id: variant.id,
    catalogKey: `database-variant-${variant.id}`,
    sku: variant.sku,
    option_values: variant.option_values,
    stock_quantity: variant.stock_quantity,
    name: product.value.title,
    category: categoryName.value,
    categoryValue: product.value.category,
    price: variant.effective_price,
    tag: 'Mới đăng',
    color: '#0f766e',
    image_url: variant.images?.[0]?.image_url ||
      variant.image_url ||
      product.value.gallery_images?.[0]?.image_url ||
      product.value.images[0]?.image_url ||
      null
  })
}

watch(
  () => galleryImages.value.map((image) => image.absoluteUrl).join('|'),
  () => {
    selectedImageUrl.value = galleryImages.value[0]?.absoluteUrl || ''
  }
)

watch(
  () => route.params.id,
  (productId) => loadProduct(productId),
  { immediate: true }
)

onBeforeUnmount(() => {
  productRequestSequence += 1
})
</script>

<template>
  <main class="product-detail-page">
    <section class="section">
      <RouterLink class="profile-back" :to="backRoute">
        ← {{ sourceCategory ? `Quay lại ${sourceCategory.name}` : 'Quay lại sản phẩm' }}
      </RouterLink>

      <p
        v-if="route.query.created === '1'"
        class="account-notice account-notice--success product-created-notice"
        role="status"
      >
        Sản phẩm và các phiên bản đã được tạo thành công.
      </p>

      <div v-if="loading" class="profile-empty">
        <h3>Đang tải sản phẩm...</h3>
      </div>

      <div v-else-if="loadError" class="profile-empty">
        <h3>Không thể tải sản phẩm</h3>
        <p>{{ loadError }}</p>
        <RouterLink to="/products">Xem danh sách sản phẩm</RouterLink>
      </div>

      <article v-else-if="product" class="product-detail-layout">
        <div class="product-detail-gallery">
          <p class="product-detail-gallery-label" aria-live="polite">
            {{ galleryLabel }}
          </p>
          <div class="product-detail-main-image">
            <img
              v-if="mainImageUrl"
              :src="mainImageUrl"
              :alt="`${product.title} — ${galleryLabel}`"
            />
            <div v-else class="product-detail-image-empty">
              Sản phẩm đang được cập nhật hình ảnh
            </div>
          </div>
          <div
            v-if="galleryImages.length > 1"
            class="product-detail-thumbnails"
          >
            <button
              v-for="(image, index) in galleryImages"
              :key="`${image.source}-${image.id || image.image_url}`"
              type="button"
              :class="{ active: mainImageUrl === image.absoluteUrl }"
              :aria-label="`Xem ảnh ${index + 1} của ${galleryLabel.toLowerCase()}`"
              :aria-pressed="mainImageUrl === image.absoluteUrl"
              @click="selectedImageUrl = image.absoluteUrl"
            >
              <img :src="image.absoluteUrl" :alt="`${product.title}, ảnh ${index + 1}`" />
            </button>
          </div>
        </div>

        <div class="product-detail-content">
          <p class="eyebrow">{{ categoryName }}</p>
          <h1>{{ product.title }}</h1>
          <p v-if="product.brand" class="product-detail-brand">
            {{ product.brand }}
          </p>
          <strong class="product-detail-price">
            {{ formatCurrency(displayPrice) }}
          </strong>
          <p class="product-detail-owner">
            Đăng bởi <b>{{ product.owner.full_name }}</b>
          </p>
          <p class="product-detail-description">
            {{ product.description }}
          </p>

          <section
            v-if="product.options.length"
            class="product-option-selector"
            aria-label="Chọn phiên bản sản phẩm"
          >
            <fieldset
              v-for="option in product.options"
              :key="option.id"
              class="product-option-group"
            >
              <legend>{{ option.name }}</legend>
              <div class="product-option-values">
                <button
                  v-for="optionValue in option.values"
                  :key="optionValue.id"
                  type="button"
                  :disabled="!isOptionValuePurchasable(option.code, optionValue.value)"
                  :class="{
                    selected: selectedOptionValues[option.code] === optionValue.value,
                    'is-out-of-stock': isOptionValueOutOfStock(option.code, optionValue.value)
                  }"
                  @click="selectOption(option.code, optionValue.value)"
                >
                  {{ optionValue.value }}
                  <small
                    v-if="isOptionValueOutOfStock(option.code, optionValue.value)"
                  >
                    Hết hàng
                  </small>
                </button>
              </div>
            </fieldset>
          </section>

          <dl class="product-detail-facts">
            <div>
              <dt>Tồn kho</dt>
              <dd v-if="needsVariantSelection">
                Chọn đủ tùy chọn để xem tồn kho
              </dd>
              <dd v-else>{{ displayStock }} sản phẩm</dd>
            </div>
            <div v-if="selectedVariant">
              <dt>SKU</dt>
              <dd>{{ selectedVariant.sku }}</dd>
            </div>
            <div v-if="product.weight_grams">
              <dt>Cân nặng</dt>
              <dd>{{ product.weight_grams }} gram</dd>
            </div>
          </dl>

          <button
            class="product-detail-cart"
            type="button"
            :disabled="!canAddToCart"
            @click="addProductToCart"
          >
            <template v-if="needsVariantSelection">Chọn đầy đủ tùy chọn</template>
            <template v-else-if="canAddToCart">Thêm phiên bản này vào giỏ</template>
            <template v-else-if="selectedVariant?.stock_quantity <= 0">Đã hết hàng</template>
            <template v-else>Đã đạt số lượng tồn kho</template>
          </button>
        </div>
      </article>
    </section>
  </main>
</template>
