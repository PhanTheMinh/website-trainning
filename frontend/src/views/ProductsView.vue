<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import PaginationNav from '../components/PaginationNav.vue'
import ProductGrid from '../components/ProductGrid.vue'
import { sortOptions } from '../data/catalog.js'
import {
  categories,
  getCategoryBySlug
} from '../data/categories.js'
import { getProducts } from '../services/productService.js'
import { mapApiProducts } from '../utils/productCatalog.js'

const emit = defineEmits(['add-to-cart'])
const route = useRoute()
const router = useRouter()
const supportedSorts = new Set(sortOptions.map((option) => option.value))
const products = ref([])
const loading = ref(false)
const productLoadError = ref('')
const pagination = ref({
  currentPage: 1,
  pageSize: 12,
  totalItems: 0,
  totalPages: 0,
  hasPreviousPage: false,
  hasNextPage: false
})
let loadSequence = 0
const PAGE_SIZE = 12

const isCategoryPage = computed(() => route.name === 'category')
const selectedCategory = computed(() =>
  isCategoryPage.value
    ? getCategoryBySlug(String(route.params.slug || ''))
    : null
)
const categoryNotFound = computed(
  () => isCategoryPage.value && !selectedCategory.value
)
const searchTerm = computed(() => String(route.query.q || '').trim())
const minPrice = computed(() => String(route.query.minPrice || '').trim())
const maxPrice = computed(() => String(route.query.maxPrice || '').trim())
const currentPage = computed(() => {
  const page = Number(route.query.page || 1)
  return Number.isSafeInteger(page) && page > 0 ? page : 1
})
const priceError = computed(() => {
  const minimum = Number(minPrice.value)
  const maximum = Number(maxPrice.value)

  return minPrice.value && maxPrice.value && minimum > maximum
})

const sortKey = computed({
  get() {
    const requestedSort = String(route.query.sort || '')
    return supportedSorts.has(requestedSort)
      ? requestedSort
      : 'name-asc'
  },
  set(value) {
    router.replace({
      name: route.name,
      params: route.params,
      query: {
        ...route.query,
        sort: value === 'name-asc' ? undefined : value,
        page: undefined
      }
    })
  }
})

const visibleProducts = computed(() => products.value)

const pageTitle = computed(() =>
  selectedCategory.value?.name || 'Tất cả sản phẩm'
)

const emptyMessage = computed(() => {
  if (searchTerm.value) {
    return `Không có sản phẩm khớp với “${searchTerm.value}”.`
  }

  if (selectedCategory.value) {
    return `Danh mục ${selectedCategory.value.name} hiện chưa có sản phẩm.`
  }

  return 'Cửa hàng hiện chưa có sản phẩm đang hoạt động.'
})

async function loadProducts() {
  const requestId = ++loadSequence
  productLoadError.value = ''

  if (categoryNotFound.value) {
    products.value = []
    loading.value = false
    return
  }

  if (priceError.value) {
    loading.value = false
    return
  }

  loading.value = true

  try {
    const response = await getProducts({
      category: selectedCategory.value?.value,
      search: searchTerm.value,
      minPrice: minPrice.value,
      maxPrice: maxPrice.value,
      sort: sortKey.value,
      page: currentPage.value,
      limit: PAGE_SIZE
    })

    if (requestId !== loadSequence) {
      return
    }

    products.value = mapApiProducts(response.data, {
      fromCategory: selectedCategory.value?.slug
    })
    pagination.value = response.pagination

    if (
      pagination.value.totalPages > 0 &&
      currentPage.value > pagination.value.totalPages
    ) {
      await router.replace({
        name: route.name,
        params: route.params,
        query: {
          ...route.query,
          page: pagination.value.totalPages === 1
            ? undefined
            : pagination.value.totalPages
        }
      })
    }
  } catch (error) {
    if (requestId === loadSequence) {
      productLoadError.value = error.message
      products.value = []
    }
  } finally {
    if (requestId === loadSequence) {
      loading.value = false
    }
  }
}

async function goToPage(page) {
  await router.push({
    name: route.name,
    params: route.params,
    query: {
      ...route.query,
      page: page === 1 ? undefined : page
    }
  })
  document.querySelector('.catalog-toolbar')?.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth',
    block: 'start'
  })
}

watch(
  () => [
    route.name,
    String(route.params.slug || ''),
    minPrice.value,
    maxPrice.value,
    searchTerm.value,
    sortKey.value,
    currentPage.value
  ],
  loadProducts,
  {
    immediate: true
  }
)
</script>

<template>
  <main class="catalog-page">
    <section class="section catalog-hero">
      <div class="section-heading">
        <p class="eyebrow">{{ isCategoryPage ? 'Danh mục' : 'Sản phẩm' }}</p>
        <h1>{{ categoryNotFound ? 'Danh mục không tồn tại' : pageTitle }}</h1>
        <p v-if="categoryNotFound">
          Đường dẫn danh mục không hợp lệ hoặc danh mục không còn được hỗ trợ.
        </p>
        <p v-else-if="searchTerm">
          {{ pagination.totalItems }} kết quả cho “{{ searchTerm }}”
        </p>
        <p v-else-if="selectedCategory">
          {{ selectedCategory.description }}
        </p>
        <p v-else>
          Khám phá toàn bộ sản phẩm đang hoạt động trong cửa hàng.
        </p>
      </div>

      <div class="category-pills" aria-label="Chọn danh mục sản phẩm">
        <RouterLink to="/products">Tất cả sản phẩm</RouterLink>
        <RouterLink
          v-for="category in categories"
          :key="category.slug"
          :to="{
            name: 'category',
            params: { slug: category.slug }
          }"
        >
          {{ category.name }}
        </RouterLink>
      </div>

      <div v-if="categoryNotFound" class="catalog-empty">
        <h3>Không thể mở danh mục này</h3>
        <p>Hãy chọn một danh mục hợp lệ hoặc quay lại danh sách đầy đủ.</p>
        <RouterLink to="/products">Xem tất cả sản phẩm</RouterLink>
      </div>

      <template v-else>
        <div class="catalog-toolbar">
          <span>
            {{ loading ? 'Đang tải...' : `${pagination.totalItems} sản phẩm` }}
          </span>
          <label for="product-sort">Sắp xếp</label>
          <select id="product-sort" v-model="sortKey" :disabled="loading">
            <option
              v-for="option in sortOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </div>

        <form
          class="catalog-price-filter"
          @submit.prevent="!priceError && loadProducts()"
        >
          <label for="catalog-min-price">Giá từ</label>
          <input
            id="catalog-min-price"
            :value="minPrice"
            min="0"
            inputmode="numeric"
            placeholder="0"
            type="number"
            @change="router.replace({ name: route.name, params: route.params, query: { ...route.query, minPrice: $event.target.value || undefined, page: undefined } })"
          />
          <label for="catalog-max-price">đến</label>
          <input
            id="catalog-max-price"
            :value="maxPrice"
            min="0"
            inputmode="numeric"
            placeholder="Không giới hạn"
            type="number"
            @change="router.replace({ name: route.name, params: route.params, query: { ...route.query, maxPrice: $event.target.value || undefined, page: undefined } })"
          />
          <button type="submit" :disabled="loading || priceError">Lọc giá</button>
          <p v-if="priceError" class="catalog-price-filter__error" role="alert">
            Giá từ không được lớn hơn giá đến.
          </p>
        </form>

        <div v-if="loading" class="catalog-empty" role="status">
          <h3>Đang tải sản phẩm...</h3>
        </div>

        <div v-else-if="productLoadError" class="catalog-empty">
          <h3>Không thể tải sản phẩm</h3>
          <p>{{ productLoadError }}</p>
          <button type="button" @click="loadProducts">Thử lại</button>
        </div>

        <ProductGrid
          v-else
          :products="visibleProducts"
          empty-title="Chưa có sản phẩm"
          :empty-message="emptyMessage"
          @add-to-cart="emit('add-to-cart', $event)"
        />

        <PaginationNav
          :pagination="pagination"
          :disabled="loading"
          @change="goToPage"
        />

        <RouterLink
          v-if="selectedCategory"
          class="catalog-all-products-link"
          to="/products"
        >
          Xem tất cả sản phẩm
        </RouterLink>
      </template>
    </section>
  </main>
</template>
