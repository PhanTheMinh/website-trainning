<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import ProductGrid from '../components/ProductGrid.vue'
import { sortOptions, sortProducts } from '../data/catalog.js'
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
let loadSequence = 0

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
        sort: value === 'name-asc' ? undefined : value
      }
    })
  }
})

const visibleProducts = computed(() => {
  const normalizedQuery = searchTerm.value.toLocaleLowerCase('vi')
  const matches = normalizedQuery
    ? products.value.filter((product) =>
        product.name.toLocaleLowerCase('vi').includes(normalizedQuery)
      )
    : products.value

  return sortProducts(matches, sortKey.value)
})

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

  loading.value = true

  try {
    const response = await getProducts(selectedCategory.value?.value)

    if (requestId !== loadSequence) {
      return
    }

    products.value = mapApiProducts(response.data, {
      fromCategory: selectedCategory.value?.slug
    })
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

watch(
  () => [route.name, String(route.params.slug || '')],
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
          {{ visibleProducts.length }} kết quả cho “{{ searchTerm }}”
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
            {{ loading ? 'Đang tải...' : `${visibleProducts.length} sản phẩm` }}
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
