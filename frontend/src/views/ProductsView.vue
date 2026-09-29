<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import PaginationNav from '../components/PaginationNav.vue'
import ProductGrid from '../components/ProductGrid.vue'
import PageHeader from '../components/ui/PageHeader.vue'
import ProductSkeleton from '../components/ui/ProductSkeleton.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import UiButton from '../components/ui/UiButton.vue'
import UiIcon from '../components/ui/UiIcon.vue'
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
const filtersOpen = ref(false)
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
const draftMinPrice = ref('')
const draftMaxPrice = ref('')
const filterError = computed(() => draftMinPrice.value !== '' && draftMaxPrice.value !== '' && Number(draftMinPrice.value) > Number(draftMaxPrice.value))
watch([minPrice, maxPrice], ([minimum, maximum]) => {
  draftMinPrice.value = minimum
  draftMaxPrice.value = maximum
}, { immediate: true })

function applyPriceFilter() {
  if (filterError.value) return
  router.replace({
    name: route.name,
    params: route.params,
    query: { ...route.query, minPrice: draftMinPrice.value === '' ? undefined : String(draftMinPrice.value), maxPrice: draftMaxPrice.value === '' ? undefined : String(draftMaxPrice.value), page: undefined }
  })
}
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
  selectedCategory.value?.name || 'All products'
)

const emptyMessage = computed(() => {
  if (searchTerm.value) {
    return `No products match “${searchTerm.value}”.`
  }

  if (selectedCategory.value) {
    return `There are no products in ${selectedCategory.value.name} yet.`
  }

  return 'There are no active products in the store yet.'
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
  document.querySelector('.rs-catalog__toolbar')?.scrollIntoView({
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
  <main class="rs-catalog rs-container">
    <PageHeader :title="categoryNotFound ? 'Category not found' : pageTitle" :description="searchTerm ? 'Results for “' + searchTerm + '”' : ''" />
    <EmptyState v-if="categoryNotFound" title="Category not found" description="Explore our running gear to find what you need.">
      <RouterLink class="rs-button" to="/products">Shop all products</RouterLink>
    </EmptyState>
    <div v-else class="rs-catalog__layout">
      <button class="rs-button rs-button--secondary rs-catalog__filter-toggle" type="button" :aria-expanded="filtersOpen" aria-controls="catalog-filters" @click="filtersOpen = !filtersOpen"><UiIcon name="filter" />Filters<UiIcon :name="filtersOpen ? 'close' : 'plus'" :size="16" /></button>
      <aside id="catalog-filters" class="rs-catalog__filters" :class="{ 'is-open': filtersOpen }" aria-label="Product filters">
        <div class="rs-catalog__filter-heading"><h2>Filters</h2><UiIcon name="filter" :size="18" /></div>
        <nav class="rs-catalog__categories" aria-label="Product categories">
          <h3>Category</h3>
          <RouterLink to="/products" :class="{ 'is-selected': !selectedCategory }" :aria-current="!selectedCategory ? 'page' : undefined">All products<UiIcon name="arrow" :size="16" /></RouterLink>
          <RouterLink v-for="category in categories" :key="category.slug" :to="{ name: 'category', params: { slug: category.slug } }" :class="{ 'is-selected': selectedCategory?.value === category.value }" :aria-current="selectedCategory?.value === category.value ? 'page' : undefined">{{ category.name }}</RouterLink>
        </nav>
        <form class="rs-catalog__price" @submit.prevent="applyPriceFilter">
          <h3>Price range <span>VND</span></h3>
          <label class="rs-field" for="catalog-min-price">Minimum<input id="catalog-min-price" v-model="draftMinPrice" class="rs-input" min="0" inputmode="numeric" placeholder="0" type="number" :aria-invalid="filterError" :aria-describedby="filterError ? 'catalog-price-error' : undefined" /></label>
          <label class="rs-field" for="catalog-max-price">Maximum<input id="catalog-max-price" v-model="draftMaxPrice" class="rs-input" min="0" inputmode="numeric" placeholder="No maximum" type="number" :aria-invalid="filterError" :aria-describedby="filterError ? 'catalog-price-error' : undefined" /></label>
          <p v-if="filterError" id="catalog-price-error" class="rs-alert rs-alert--error" role="alert">Minimum price must not exceed maximum price.</p>
          <UiButton type="submit" variant="secondary" :disabled="loading || filterError">Apply price</UiButton>
          <button v-if="minPrice || maxPrice" class="rs-catalog__clear" type="button" @click="router.replace({ name: route.name, params: route.params, query: { ...route.query, minPrice: undefined, maxPrice: undefined, page: undefined } })">Clear price filter</button>
        </form>
      </aside>
      <section class="rs-catalog__results" aria-label="Products" :aria-busy="loading">
        <div class="rs-catalog__toolbar">
          <span role="status">{{ loading ? 'Finding your gear…' : pagination.totalItems + ' products' }}</span>
          <label for="product-sort" class="rs-catalog__sort"><span>Sort by</span><select id="product-sort" v-model="sortKey" class="rs-input" aria-label="Sort products" :disabled="loading"><option v-for="option in sortOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
        </div>
        <ProductSkeleton v-if="loading" />
        <EmptyState v-else-if="productLoadError" title="We couldn’t load the products" :description="productLoadError"><UiButton @click="loadProducts">Try again</UiButton></EmptyState>
        <ProductGrid v-else :products="visibleProducts" empty-title="No products found" :empty-message="emptyMessage" @add-to-cart="emit('add-to-cart', $event)" />
        <PaginationNav :pagination="pagination" :disabled="loading" @change="goToPage" />
      </section>
    </div>
  </main>
</template>
<style scoped>
.rs-catalog { min-height: 70vh; }
.rs-catalog__layout { display: grid; grid-template-columns: 208px minmax(0, 1fr); gap: 40px; }
.rs-catalog__filters { align-self: start; position: sticky; top: 104px; }
.rs-catalog__filter-heading { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; color: var(--rs-text); }
.rs-catalog__filter-heading h2 { font-size: 18px; margin: 0; }
.rs-catalog__categories { display: grid; gap: 4px; padding-bottom: 24px; border-bottom: 1px solid var(--rs-border); }
.rs-catalog__categories h3, .rs-catalog__price h3 { font-size: 14px; font-weight: 600; margin: 0 0 12px; color: var(--rs-text); }
.rs-catalog__categories a { display: flex; justify-content: space-between; align-items: center; gap: 8px; color: var(--rs-muted); font-size: 14px; font-weight: 400; padding: 10px 12px; border-radius: 6px; }
.rs-catalog__categories a.is-selected { color: var(--rs-text); font-weight: 600; background: var(--rs-subtle); }
.rs-catalog__categories a:hover { color: var(--rs-text); }
.rs-catalog__price { display: grid; gap: 16px; padding-top: 24px; }
.rs-catalog__price h3 { display: flex; justify-content: space-between; margin: 0; }
.rs-catalog__price h3 span { color: var(--rs-muted); font-size: 12px; font-weight: 400; }
.rs-catalog__clear { border: 0; background: none; color: var(--rs-link); font-size: 13px; text-decoration: underline; text-underline-offset: 3px; min-height: 44px; }
.rs-catalog__toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--rs-border); scroll-margin-top: 150px; }
.rs-catalog__toolbar > span { color: var(--rs-muted); font-size: 14px; }
.rs-catalog__sort { display: flex; align-items: center; gap: 12px; font-size: 13px; color: var(--rs-muted); }
.rs-catalog__sort > span { white-space: nowrap; }
.rs-catalog__sort select { max-width: 200px; }
.rs-catalog__filter-toggle { display: none; }
@media (max-width: 1000px) { .rs-catalog__layout { grid-template-columns: 180px minmax(0, 1fr); gap: 24px; } .rs-catalog__filters { top: 150px; } }
@media (max-width: 760px) {
  .rs-catalog__layout { grid-template-columns: 1fr; gap: 16px; }
  .rs-catalog__filter-toggle { display: flex; width: fit-content; }
  .rs-catalog__filters { display: none; position: static; padding: 16px; border: 1px solid var(--rs-border); border-radius: 8px; background: var(--rs-surface); }
  .rs-catalog__filters.is-open { display: block; }
  .rs-catalog__filter-heading { display: none; }
  .rs-catalog__price { grid-template-columns: 1fr 1fr; }
  .rs-catalog__price h3, .rs-catalog__price .rs-alert { grid-column: 1 / -1; }
  .rs-catalog__toolbar { margin-bottom: 16px; gap: 8px; }
  .rs-catalog__sort > span { display: none; }
  .rs-catalog__sort select { max-width: 190px; font-size: 13px; }
  .rs-catalog__toolbar > span { font-size: 13px; }
}
</style>
