<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import PaginationNav from '../components/PaginationNav.vue'
import ProductGrid from '../components/ProductGrid.vue'
import { sortOptions } from '../data/catalog.js'
import { categories } from '../data/categories.js'
import { API_BASE_URL } from '../services/apiClient.js'
import { getShop, getShopProducts } from '../services/shopService.js'
import { mapApiProducts } from '../utils/productCatalog.js'
import {
  getShopLoadError,
  STOREFRONT_ERROR
} from '../utils/storefrontErrors.js'
import { createVisibilityAwarePoller } from '../utils/visibilityPoller.js'

const emit = defineEmits(['add-to-cart'])
const route = useRoute()
const router = useRouter()
const shop = ref(null)
const products = ref([])
const loading = ref(true)
const loadError = ref('')
const searchDraft = ref('')
const EMPTY_PAGINATION = Object.freeze({
  currentPage: 1,
  pageSize: 12,
  totalItems: 0,
  totalPages: 0,
  hasPreviousPage: false,
  hasNextPage: false
})
const pagination = ref({ ...EMPTY_PAGINATION })
const supportedSorts = new Set(sortOptions.map((option) => option.value))
const PAGE_SIZE = 12
let loadSequence = 0
let shopStatusController = null

const identifier = computed(() => String(route.params.identifier || ''))
const searchTerm = computed(() => String(route.query.q || '').trim())
const categoryValue = computed(() => String(route.query.category || ''))
const minPrice = computed(() => String(route.query.minPrice || '').trim())
const maxPrice = computed(() => String(route.query.maxPrice || '').trim())
const currentPage = computed(() => {
  const page = Number(route.query.page || 1)
  return Number.isSafeInteger(page) && page > 0 ? page : 1
})
const priceError = computed(() => Boolean(
  minPrice.value &&
  maxPrice.value &&
  Number(minPrice.value) > Number(maxPrice.value)
))
const sortKey = computed({
  get() {
    const requested = String(route.query.sort || '')
    return supportedSorts.has(requested) ? requested : 'name-asc'
  },
  set(value) {
    updateQuery({
      sort: value === 'name-asc' ? undefined : value,
      page: undefined
    })
  }
})
const logoUrl = computed(() => shop.value?.logo_url
  ? new URL(shop.value.logo_url, API_BASE_URL).toString()
  : '')
const coverUrl = computed(() => shop.value?.cover_url
  ? new URL(shop.value.cover_url, API_BASE_URL).toString()
  : '')
const joinedLabel = computed(() => {
  if (!shop.value?.joined_at) return ''
  return new Intl.DateTimeFormat('vi-VN', {
    month: '2-digit',
    year: 'numeric'
  }).format(new Date(shop.value.joined_at))
})

function updateQuery(changes) {
  return router.replace({
    name: 'shop',
    params: { identifier: identifier.value },
    query: {
      ...route.query,
      ...changes
    }
  })
}

function submitSearch() {
  updateQuery({
    q: searchDraft.value.trim() || undefined,
    page: undefined
  })
}

async function loadShop() {
  const requestId = ++loadSequence
  shopStatusController?.abort()
  loading.value = true
  loadError.value = ''

  try {
    const shopResponse = await getShop(identifier.value)

    if (requestId !== loadSequence) return

    shop.value = shopResponse.data

    if (identifier.value !== shop.value.identifier) {
      await router.replace({
        name: 'shop',
        params: { identifier: shop.value.identifier },
        query: route.query
      })
      return
    }

    if (shop.value.status === 'closed') {
      products.value = []
      pagination.value = { ...EMPTY_PAGINATION }
      return
    }

    if (priceError.value) {
      products.value = []
      pagination.value = { ...EMPTY_PAGINATION }
      return
    }

    const productResponse = await getShopProducts(identifier.value, {
      search: searchTerm.value,
      category: categoryValue.value,
      minPrice: minPrice.value,
      maxPrice: maxPrice.value,
      sort: sortKey.value,
      page: currentPage.value,
      limit: PAGE_SIZE
    })

    if (requestId !== loadSequence) return

    products.value = mapApiProducts(productResponse.data, {
      fromShop: shop.value.identifier
    })
    pagination.value = productResponse.pagination

    if (
      pagination.value.totalPages > 0 &&
      currentPage.value > pagination.value.totalPages
    ) {
      await updateQuery({
        page: pagination.value.totalPages === 1
          ? undefined
          : pagination.value.totalPages
      })
    }
  } catch (error) {
    if (requestId === loadSequence) {
      products.value = []
      pagination.value = { ...EMPTY_PAGINATION }

      if (error.code === STOREFRONT_ERROR.SHOP_CLOSED && shop.value) {
        shop.value = {
          ...shop.value,
          status: 'closed',
          product_count: 0
        }
        loadError.value = ''
      } else {
        if (error.status === 404) shop.value = null
        loadError.value = getShopLoadError(error)
      }
    }
  } finally {
    if (requestId === loadSequence) loading.value = false
  }
}

async function revalidateShopStatus() {
  if (!shop.value || loading.value || document.visibilityState === 'hidden') return

  shopStatusController?.abort()
  const controller = new AbortController()
  const currentShopId = shop.value.id
  const wasClosed = shop.value.status === 'closed'
  shopStatusController = controller

  try {
    const response = await getShop(identifier.value, {
      signal: controller.signal
    })

    if (
      controller.signal.aborted ||
      Number(shop.value?.id) !== Number(currentShopId)
    ) return

    shop.value = response.data

    if (shop.value.status === 'closed') {
      products.value = []
      pagination.value = { ...EMPTY_PAGINATION }
      loadError.value = ''
    } else if (wasClosed) {
      await loadShop()
    }
  } catch (error) {
    if (error.name === 'AbortError') return

    if (error.status === 404) {
      shop.value = null
      products.value = []
      pagination.value = { ...EMPTY_PAGINATION }
      loadError.value = getShopLoadError(error)
    }
  } finally {
    if (shopStatusController === controller) {
      shopStatusController = null
    }
  }
}

const shopStatusPoller = createVisibilityAwarePoller({
  poll: revalidateShopStatus,
  intervalMs: 30000
})

function goToPage(page) {
  updateQuery({ page: page === 1 ? undefined : page })
}

watch(searchTerm, (value) => {
  searchDraft.value = value
}, { immediate: true })

watch(
  () => [
    identifier.value,
    searchTerm.value,
    categoryValue.value,
    minPrice.value,
    maxPrice.value,
    sortKey.value,
    currentPage.value
  ],
  loadShop,
  { immediate: true }
)

onMounted(() => {
  shopStatusPoller.mount()
})

onBeforeUnmount(() => {
  loadSequence += 1
  shopStatusController?.abort()
  shopStatusPoller.unmount()
})
</script>

<template>
  <main class="shop-page">
    <section class="section">
      <RouterLink class="profile-back" to="/products">
        ← Quay lại tất cả sản phẩm
      </RouterLink>

      <div v-if="loading && !shop" class="profile-empty" role="status">
        <h3>Đang tải shop...</h3>
      </div>

      <div v-else-if="loadError && !shop" class="profile-empty">
        <h3>Không thể mở shop</h3>
        <p>{{ loadError }}</p>
        <RouterLink to="/products">Khám phá shop khác</RouterLink>
      </div>

      <template v-else-if="shop">
        <header
          class="shop-hero"
          :class="{ 'shop-hero--has-cover': coverUrl }"
          :style="coverUrl ? { '--shop-cover': `url(${coverUrl})` } : undefined"
        >
          <div class="shop-hero__logo">
            <img v-if="logoUrl" :src="logoUrl" :alt="`Logo ${shop.name}`" />
            <span v-else aria-hidden="true">{{ shop.name.charAt(0).toUpperCase() }}</span>
          </div>
          <div class="shop-hero__content">
            <h1>{{ shop.name }}</h1>
            <p v-if="shop.description">{{ shop.description }}</p>
            <div class="shop-hero__facts">
              <span><strong>{{ shop.product_count }}</strong> sản phẩm</span>
              <span v-if="joinedLabel">Tham gia {{ joinedLabel }}</span>
            </div>
          </div>
        </header>

        <section
          v-if="shop.status === 'closed'"
          class="catalog-empty shop-closed-state"
          role="status"
        >
          <h3>Shop đang tạm đóng</h3>
          <p>Các sản phẩm của shop hiện chưa thể mua.</p>
          <RouterLink to="/products">Xem sản phẩm khác</RouterLink>
        </section>

        <section v-else class="shop-catalog" aria-labelledby="shop-products-title">
          <div class="shop-catalog__heading">
            <h2 id="shop-products-title">Sản phẩm</h2>
          </div>

          <form class="shop-filters" @submit.prevent="submitSearch">
            <label class="shop-filters__search">
              <span>Tìm trong shop</span>
              <input v-model="searchDraft" placeholder="Tên sản phẩm hoặc thương hiệu" />
            </label>
            <label>
              <span>Danh mục</span>
              <select
                :value="categoryValue"
                @change="updateQuery({ category: $event.target.value || undefined, page: undefined })"
              >
                <option value="">Tất cả danh mục</option>
                <option
                  v-for="category in categories"
                  :key="category.value"
                  :value="category.value"
                >{{ category.name }}</option>
              </select>
            </label>
            <label>
              <span>Sắp xếp</span>
              <select v-model="sortKey">
                <option
                  v-for="option in sortOptions"
                  :key="option.value"
                  :value="option.value"
                >{{ option.label }}</option>
              </select>
            </label>
            <label>
              <span>Giá từ</span>
              <input
                :value="minPrice"
                min="0"
                inputmode="numeric"
                type="number"
                placeholder="0"
                @change="updateQuery({ minPrice: $event.target.value || undefined, page: undefined })"
              />
            </label>
            <label>
              <span>Giá đến</span>
              <input
                :value="maxPrice"
                min="0"
                inputmode="numeric"
                type="number"
                placeholder="Không giới hạn"
                @change="updateQuery({ maxPrice: $event.target.value || undefined, page: undefined })"
              />
            </label>
            <button type="submit" :disabled="loading || priceError">Tìm kiếm</button>
            <p v-if="priceError" class="catalog-price-filter__error" role="alert">
              Giá từ không được lớn hơn giá đến.
            </p>
          </form>

          <div v-if="loading" class="catalog-empty" role="status">
            <h3>Đang tải sản phẩm...</h3>
          </div>
          <div v-else-if="loadError" class="catalog-empty">
            <h3>Không thể tải sản phẩm</h3>
            <p>{{ loadError }}</p>
            <button type="button" @click="loadShop">Thử lại</button>
          </div>
          <ProductGrid
            v-else
            :products="products"
            empty-title="Không tìm thấy sản phẩm"
            empty-message="Hãy thử bộ lọc khác."
            @add-to-cart="emit('add-to-cart', $event)"
          />

          <PaginationNav
            :pagination="pagination"
            :disabled="loading"
            @change="goToPage"
          />
        </section>
      </template>
    </section>
  </main>
</template>
