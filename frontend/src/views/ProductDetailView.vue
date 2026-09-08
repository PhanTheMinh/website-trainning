<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { formatCurrency } from '../data/catalog.js'
import {
  getCategoryBySlug,
  getCategoryName
} from '../data/categories.js'
import { API_BASE_URL } from '../services/apiClient.js'
import { getProduct } from '../services/productService.js'
import { buildProductGallery } from '../utils/productGallery.js'
import {
  getProductAvailability,
  PRODUCT_AVAILABILITY
} from '../utils/purchaseAvailability.js'
import {
  getProductLoadError,
  getPurchaseFailureMessage,
  STOREFRONT_ERROR
} from '../utils/storefrontErrors.js'
import { createVisibilityAwarePoller } from '../utils/visibilityPoller.js'

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
const availabilityError = ref('')
const addingToCart = ref(false)
const storefrontBlockCode = ref('')
let productRequestSequence = 0
let availabilityController = null

const sourceCategory = computed(() =>
  getCategoryBySlug(String(route.query.fromCategory || ''))
)

const sourceShop = computed(() => {
  const requestedShop = String(route.query.fromShop || '')
  return requestedShop && product.value?.shop?.identifier === requestedShop
    ? product.value.shop
    : null
})

const backRoute = computed(() =>
  sourceShop.value
    ? {
        name: 'shop',
        params: { identifier: sourceShop.value.identifier }
      }
    : sourceCategory.value
    ? {
        name: 'category',
        params: { slug: sourceCategory.value.slug }
      }
    : { name: 'products' }
)

const categoryName = computed(() =>
  product.value ? getCategoryName(product.value.category) : ''
)

const displayDescription = computed(() =>
  String(product.value?.description || '')
    .replace(/\s*Dữ liệu demo phục vụ bài tập;.*$/i, '')
    .trim()
)

const productAvailability = computed(() => getProductAvailability(product.value))

const shopIsClosed = computed(
  () => storefrontBlockCode.value === STOREFRONT_ERROR.SHOP_CLOSED
)

const stoppedStateTitle = computed(() =>
  shopIsClosed.value ? 'Shop tạm đóng' : 'Ngừng bán'
)

const stoppedStateMessage = computed(() =>
  shopIsClosed.value
    ? 'Shop hiện tạm đóng nên sản phẩm chưa thể mua.'
    : 'Sản phẩm này hiện không còn được bán.'
)

const stoppedButtonLabel = computed(() =>
  shopIsClosed.value ? 'Shop đang tạm đóng' : 'Sản phẩm đã ngừng bán'
)

const isProductForSale = computed(
  () => productAvailability.value !== PRODUCT_AVAILABILITY.STOPPED
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

const productIsOutOfStock = computed(
  () => productAvailability.value === PRODUCT_AVAILABILITY.OUT_OF_STOCK
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
    isProductForSale.value &&
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
  if (!isProductForSale.value) return false

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
  if (!isProductForSale.value || addingToCart.value) return

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

function applyProductSnapshot(nextProduct) {
  product.value = nextProduct
  storefrontBlockCode.value = nextProduct.shop?.status === 'closed'
    ? STOREFRONT_ERROR.SHOP_CLOSED
    : nextProduct.status !== 'active'
      ? STOREFRONT_ERROR.PRODUCT_STOPPED
      : ''

  if (getProductAvailability(nextProduct) !== PRODUCT_AVAILABILITY.AVAILABLE) {
    selectedOptionValues.value = {}
    return
  }

  const selections = selectedOptionValues.value

  if (
    Object.keys(selections).length &&
    !(nextProduct.variants || []).some(
      (variant) =>
        variant.status === 'active' &&
        variant.stock_quantity > 0 &&
        variantMatches(variant, selections)
    )
  ) {
    selectedOptionValues.value = {}
  }
}

async function loadProduct(productId) {
  const currentRequest = ++productRequestSequence

  loading.value = true
  loadError.value = ''
  availabilityError.value = ''
  storefrontBlockCode.value = ''
  product.value = null
  selectedImageUrl.value = ''
  selectedOptionValues.value = {}

  try {
    const response = await getProduct(productId)

    if (currentRequest !== productRequestSequence) {
      return
    }

    applyProductSnapshot(response.data)
  } catch (error) {
    if (currentRequest === productRequestSequence) {
      loadError.value = getProductLoadError(error)
    }
  } finally {
    if (currentRequest === productRequestSequence) {
      loading.value = false
    }
  }
}

async function addProductToCart() {
  if (
    !product.value ||
    !isProductForSale.value ||
    !canAddToCart.value ||
    addingToCart.value
  ) {
    return
  }

  const requestedVariantId = selectedVariant.value?.id

  addingToCart.value = true
  availabilityError.value = ''
  let freshProduct

  try {
    const response = await getProduct(product.value.id)
    freshProduct = response.data
    const freshAvailability = getProductAvailability(freshProduct)

    applyProductSnapshot(freshProduct)

    if (freshAvailability === PRODUCT_AVAILABILITY.STOPPED) {
      availabilityError.value = getPurchaseFailureMessage({
        code: storefrontBlockCode.value
      })
      return
    }

    if (freshAvailability === PRODUCT_AVAILABILITY.OUT_OF_STOCK) {
      availabilityError.value = 'Sản phẩm hiện đã hết hàng.'
      return
    }

    const variant = freshProduct.variants.find(
      (candidate) => Number(candidate.id) === Number(requestedVariantId)
    )

    if (!variant || variant.status !== 'active' || variant.stock_quantity <= 0) {
      availabilityError.value = 'Phiên bản này đã ngừng bán hoặc không còn hàng.'
      return
    }

    emit('add-to-cart', {
      id: freshProduct.id,
      product_id: freshProduct.id,
      variant_id: variant.id,
      catalogKey: `database-variant-${variant.id}`,
      sku: variant.sku,
      option_values: variant.option_values,
      stock_quantity: variant.stock_quantity,
      name: freshProduct.title,
      category: categoryName.value,
      categoryValue: freshProduct.category,
      price: variant.effective_price,
      tag: categoryName.value,
      color: '#0f766e',
      image_url: variant.images?.[0]?.image_url ||
        variant.image_url ||
        freshProduct.gallery_images?.[0]?.image_url ||
        freshProduct.images[0]?.image_url ||
        null,
      shop_id: freshProduct.shop?.id || null,
      shop: freshProduct.shop || null
    })
  } catch (error) {
    if (error.code === STOREFRONT_ERROR.SHOP_CLOSED) {
      storefrontBlockCode.value = STOREFRONT_ERROR.SHOP_CLOSED
      selectedOptionValues.value = {}
      availabilityError.value = getPurchaseFailureMessage(error)
    } else if (error.status === 404) {
      product.value = null
      selectedOptionValues.value = {}
      loadError.value = getProductLoadError(error)
    } else {
      availabilityError.value = getPurchaseFailureMessage(
        error,
        'Chưa thể kiểm tra trạng thái sản phẩm. Vui lòng thử lại.'
      )
    }
  } finally {
    addingToCart.value = false
  }
}

async function revalidateProductAvailability() {
  if (
    !product.value ||
    loading.value ||
    addingToCart.value ||
    document.visibilityState === 'hidden'
  ) return

  availabilityController?.abort()
  const controller = new AbortController()
  const productId = product.value.id
  availabilityController = controller

  try {
    const response = await getProduct(productId, {
      signal: controller.signal
    })

    if (
      controller.signal.aborted ||
      Number(product.value?.id) !== Number(productId)
    ) return

    availabilityError.value = ''
    applyProductSnapshot(response.data)
  } catch (error) {
    if (error.name === 'AbortError') return

    if (error.code === STOREFRONT_ERROR.SHOP_CLOSED) {
      storefrontBlockCode.value = STOREFRONT_ERROR.SHOP_CLOSED
      selectedOptionValues.value = {}
      availabilityError.value = getPurchaseFailureMessage(error)
    } else if (error.status === 404) {
      product.value = null
      selectedOptionValues.value = {}
      loadError.value = getProductLoadError(error)
    } else {
      availabilityError.value = 'Chưa thể cập nhật trạng thái sản phẩm. Vui lòng thử lại.'
    }
  } finally {
    if (availabilityController === controller) {
      availabilityController = null
    }
  }
}

const availabilityPoller = createVisibilityAwarePoller({
  poll: revalidateProductAvailability,
  intervalMs: 30000
})

watch(
  () => galleryImages.value.map((image) => image.absoluteUrl).join('|'),
  () => {
    selectedImageUrl.value = galleryImages.value[0]?.absoluteUrl || ''
  }
)

watch(
  () => route.params.id,
  (productId) => {
    availabilityController?.abort()
    loadProduct(productId)
  },
  { immediate: true }
)

onMounted(() => {
  availabilityPoller.mount()
})

onBeforeUnmount(() => {
  productRequestSequence += 1
  availabilityController?.abort()
  availabilityPoller.unmount()
})
</script>

<template>
  <main class="product-detail-page">
    <section class="section">
      <RouterLink class="profile-back" :to="backRoute">
        ← {{ sourceShop ? `Quay lại ${sourceShop.name}` : sourceCategory ? `Quay lại ${sourceCategory.name}` : 'Quay lại sản phẩm' }}
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
          <div
            v-if="!isProductForSale"
            class="product-sale-state product-sale-state--stopped"
            role="status"
          >
            <span>{{ stoppedStateTitle }}</span>
            <p>{{ stoppedStateMessage }}</p>
          </div>
          <div
            v-else-if="productIsOutOfStock"
            class="product-sale-state product-sale-state--out-of-stock"
            role="status"
          >
            <span>Hết hàng</span>
            <p>Sản phẩm hiện đã hết hàng.</p>
          </div>
          <strong class="product-detail-price">
            {{ formatCurrency(displayPrice) }}
          </strong>
          <RouterLink
            v-if="product.shop"
            class="product-detail-shop"
            :to="{ name: 'shop', params: { identifier: product.shop.identifier } }"
          >
            <span class="product-detail-shop__logo" aria-hidden="true">
              {{ product.shop.name.charAt(0).toUpperCase() }}
            </span>
            <span>
              <small>Bán bởi</small>
              <strong>{{ product.shop.name }}</strong>
            </span>
            <b>Xem shop →</b>
          </RouterLink>
          <p class="product-detail-description">
            {{ displayDescription }}
          </p>
          <section
            v-if="product.options.length"
            class="product-option-selector"
            :class="{ 'is-disabled': !isProductForSale }"
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
                  :disabled="addingToCart || !isOptionValuePurchasable(option.code, optionValue.value)"
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
            <div v-if="isProductForSale">
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
            :disabled="!canAddToCart || addingToCart"
            :aria-busy="addingToCart"
            @click="addProductToCart"
          >
            <template v-if="addingToCart">Đang kiểm tra...</template>
            <template v-else-if="!isProductForSale">{{ stoppedButtonLabel }}</template>
            <template v-else-if="productIsOutOfStock">Hết hàng</template>
            <template v-else-if="needsVariantSelection">Chọn đầy đủ tùy chọn</template>
            <template v-else-if="canAddToCart">Thêm phiên bản này vào giỏ</template>
            <template v-else-if="selectedVariant?.stock_quantity <= 0">Đã hết hàng</template>
            <template v-else>Đã đạt số lượng tồn kho</template>
          </button>
          <p v-if="availabilityError" class="account-notice account-notice--error" role="alert">
            {{ availabilityError }}
          </p>
        </div>
      </article>
    </section>
  </main>
</template>
