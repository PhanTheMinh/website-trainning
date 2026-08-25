<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch
} from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { getCategories } from '../services/categoryService.js'
import { API_BASE_URL } from '../services/apiClient.js'
import {
  bulkDeleteMyProducts,
  bulkUpdateMyProductStatus,
  deleteMyProduct,
  getMyProducts
} from '../services/productService.js'

const DEFAULT_SORT = 'name_asc'
const PAGE_SIZE = 10
const allowedSorts = new Set([
  'name_asc',
  'name_desc',
  'price_asc',
  'price_desc',
  'category_asc'
])

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
const categories = ref([])
const categoriesLoading = ref(false)
const categoriesError = ref('')
const items = ref([])
const loading = ref(false)
const error = ref('')
const draftSearch = ref('')
const selectedCategoryId = ref('')
const selectedStatus = ref('')
const minPrice = ref('')
const maxPrice = ref('')
const selectedSort = ref(DEFAULT_SORT)
const suggestionsOpen = ref(false)
const activeSuggestionIndex = ref(-1)
const failedImages = ref(new Set())
const pagination = ref(createEmptyPagination())
const selectedProductIds = ref(new Set())
const deleteDialog = ref(null)
const deleteError = ref('')
const deleting = ref(false)
const operationNotice = ref(null)
const confirmDeleteButton = ref(null)
const bulkActionOpen = ref(false)
const bulkActionButton = ref(null)
const bulkActionMenu = ref(null)
const statusDialog = ref(null)
const pendingStatus = ref('')
const statusUpdateError = ref('')
const updatingStatus = ref(false)
const statusDialogCloseButton = ref(null)

let categoriesLoaded = false
let requestSequence = 0
let lastSyncedAppliedSearch
let lastSelectionRoute
let deleteDialogTrigger
let statusDialogTrigger

const bulkStatusOptions = Object.freeze([
  {
    value: 'active',
    label: 'Đang bán',
    description: 'Khách hàng có thể tìm thấy sản phẩm và mua các phiên bản còn hàng.'
  },
  {
    value: 'unactive',
    label: 'Ngưng bán',
    description: 'Ẩn sản phẩm khỏi cửa hàng; giữ nguyên ảnh, phiên bản và tồn kho.'
  },
  {
    value: 'draft',
    label: 'Bản nháp',
    description: 'Chỉ hiển thị trong danh sách quản lý của bạn cho đến khi chuyển sang Đang bán.'
  }
])

const currencyFormatter = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0
})
const dateFormatter = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
})

function createEmptyPagination() {
  return {
    currentPage: 1,
    pageSize: PAGE_SIZE,
    totalItems: 0,
    totalPages: 0,
    hasPreviousPage: false,
    hasNextPage: false
  }
}

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value
}

function normalizeRouteState(query) {
  const search = String(firstQueryValue(query.search) || '').trim()
  const categoryValue = Number(firstQueryValue(query.categoryId))
  const statusValue = String(firstQueryValue(query.status) || '')
  const minPriceValue = String(firstQueryValue(query.minPrice) || '').trim()
  const maxPriceValue = String(firstQueryValue(query.maxPrice) || '').trim()
  const sortValue = String(firstQueryValue(query.sort) || DEFAULT_SORT)
  const pageValue = Number(firstQueryValue(query.page))

  return {
    search,
    categoryId: Number.isSafeInteger(categoryValue) && categoryValue > 0
      ? String(categoryValue)
      : '',
    status: ['active', 'unactive', 'draft'].includes(statusValue)
      ? statusValue
      : '',
    minPrice: minPriceValue,
    maxPrice: maxPriceValue,
    sort: allowedSorts.has(sortValue) ? sortValue : DEFAULT_SORT,
    page: Number.isSafeInteger(pageValue) && pageValue > 0 ? pageValue : 1
  }
}

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLocaleLowerCase('vi')
    .trim()
}

const routeState = computed(() => normalizeRouteState(route.query))
const appliedSearch = computed(() => routeState.value.search)
const hasActiveFilters = computed(() => Boolean(
  appliedSearch.value || routeState.value.categoryId || routeState.value.status ||
  routeState.value.minPrice || routeState.value.maxPrice
))
const isInitialLoading = computed(() => loading.value && !items.value.length)
const isRefreshing = computed(() => loading.value && items.value.length > 0)
const selectedCategory = computed(() => categories.value.find(
  (category) => String(category.id) === routeState.value.categoryId
))
const priceRangeError = computed(() => {
  const minimum = Number(minPrice.value)
  const maximum = Number(maxPrice.value)

  return minPrice.value && maxPrice.value && minimum > maximum
})
const productCountLabel = computed(() =>
  `${pagination.value.totalItems} sản phẩm`
)
const outOfStockOnPage = computed(() => items.value.filter(
  (product) => Number(product.stock) === 0
).length)
const categorySuggestions = computed(() => {
  const query = normalizeSearchText(draftSearch.value)

  if (!query) {
    return []
  }

  return categories.value
    .filter((category) => normalizeSearchText(category.name).includes(query))
    .slice(0, 6)
})
const visibleSuggestions = computed(() =>
  suggestionsOpen.value && categorySuggestions.value.length > 0
)
const groupedRows = computed(() => items.value.map((product, index) => {
  const categoryKey = product.category?.id || 'uncategorized'
  const previousProduct = items.value[index - 1]
  const previousCategoryKey = previousProduct?.category?.id || 'uncategorized'

  return {
    product,
    groupName: product.category?.name || 'Chưa phân loại',
    showGroupHeading: selectedSort.value === 'category_asc' &&
      (index === 0 || categoryKey !== previousCategoryKey)
  }
}))
const pageTokens = computed(() => buildPageTokens(
  pagination.value.currentPage,
  pagination.value.totalPages
))
const selectedCount = computed(() => selectedProductIds.value.size)
const allCurrentPageSelected = computed(() => Boolean(
  items.value.length && items.value.every(
    (product) => selectedProductIds.value.has(String(product.id))
  )
))
const someCurrentPageSelected = computed(() => (
  !allCurrentPageSelected.value && items.value.some(
    (product) => selectedProductIds.value.has(String(product.id))
  )
))
const selectedProducts = computed(() => items.value.filter(
  (product) => selectedProductIds.value.has(String(product.id))
))

function buildPageTokens(currentPage, totalPages) {
  if (totalPages <= 1) {
    return []
  }

  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => ({
      type: 'page',
      value: index + 1,
      key: `page-${index + 1}`
    }))
  }

  const pageSet = new Set([
    1,
    totalPages,
    currentPage - 1,
    currentPage,
    currentPage + 1
  ])

  if (currentPage <= 4) {
    ;[2, 3, 4, 5].forEach((page) => pageSet.add(page))
  }

  if (currentPage >= totalPages - 3) {
    ;[totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1]
      .forEach((page) => pageSet.add(page))
  }

  const pages = Array.from(pageSet)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((left, right) => left - right)
  const tokens = []

  pages.forEach((page, index) => {
    if (index > 0 && page - pages[index - 1] > 1) {
      tokens.push({
        type: 'ellipsis',
        key: `ellipsis-${pages[index - 1]}-${page}`
      })
    }

    tokens.push({
      type: 'page',
      value: page,
      key: `page-${page}`
    })
  })

  return tokens
}

function updateQuery(patch) {
  clearSelection()
  const nextQuery = { ...route.query }

  Object.entries(patch).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      delete nextQuery[key]
    } else {
      nextQuery[key] = String(value)
    }
  })

  if (nextQuery.sort === DEFAULT_SORT) {
    delete nextQuery.sort
  }

  if (Number(nextQuery.page) <= 1) {
    delete nextQuery.page
  }

  delete nextQuery.created
  delete nextQuery.updated

  return router.push({
    name: 'my-products',
    query: nextQuery
  })
}

function clearSelection() {
  bulkActionOpen.value = false
  selectedProductIds.value = new Set()
}

function isSelected(productId) {
  return selectedProductIds.value.has(String(productId))
}

function toggleProductSelection(productId) {
  const nextSelection = new Set(selectedProductIds.value)
  const normalizedId = String(productId)

  if (nextSelection.has(normalizedId)) {
    nextSelection.delete(normalizedId)
  } else {
    nextSelection.add(normalizedId)
  }

  selectedProductIds.value = nextSelection
}

function toggleCurrentPageSelection() {
  if (allCurrentPageSelected.value) {
    clearSelection()
    return
  }

  selectedProductIds.value = new Set(
    items.value.map((product) => String(product.id))
  )
}

async function toggleBulkActionMenu() {
  if (!selectedCount.value || deleting.value || updatingStatus.value) {
    return
  }

  bulkActionOpen.value = !bulkActionOpen.value

  if (bulkActionOpen.value) {
    await nextTick()
    bulkActionMenu.value?.querySelector('[role="menuitem"]')?.focus()
  }
}

function closeBulkActionMenu({ restoreFocus = false } = {}) {
  if (!bulkActionOpen.value) {
    return
  }

  bulkActionOpen.value = false

  if (restoreFocus) {
    nextTick(() => bulkActionButton.value?.focus())
  }
}

function handleBulkActionMenuKeydown(event) {
  const menuItems = Array.from(
    event.currentTarget.querySelectorAll('[role="menuitem"]:not(:disabled)')
  )
  const currentIndex = menuItems.indexOf(document.activeElement)

  if (event.key === 'Escape') {
    event.preventDefault()
    closeBulkActionMenu({ restoreFocus: true })
    return
  }

  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    return
  }

  event.preventDefault()
  let nextIndex

  if (event.key === 'Home') {
    nextIndex = 0
  } else if (event.key === 'End') {
    nextIndex = menuItems.length - 1
  } else {
    const direction = event.key === 'ArrowDown' ? 1 : -1
    nextIndex = (currentIndex + direction + menuItems.length) % menuItems.length
  }

  menuItems[nextIndex]?.focus()
}

function handleDocumentPointerDown(event) {
  if (
    bulkActionOpen.value &&
    !bulkActionMenu.value?.contains(event.target) &&
    !bulkActionButton.value?.contains(event.target)
  ) {
    closeBulkActionMenu()
  }
}

async function openStatusDialog() {
  const products = selectedProducts.value

  if (!products.length || updatingStatus.value) {
    return
  }

  statusDialogTrigger = bulkActionButton.value
  bulkActionOpen.value = false
  pendingStatus.value = ''
  statusUpdateError.value = ''
  statusDialog.value = { products: [...products] }
  await nextTick()
  statusDialogCloseButton.value?.focus()
}

function closeStatusDialog() {
  if (updatingStatus.value) {
    return
  }

  statusDialog.value = null
  pendingStatus.value = ''
  statusUpdateError.value = ''
  nextTick(() => statusDialogTrigger?.focus?.())
}

function trapStatusDialogFocus(event) {
  const panel = event.currentTarget
  const focusable = Array.from(panel.querySelectorAll(
    'button:not(:disabled), input:not(:disabled), [href], select:not(:disabled), [tabindex]:not([tabindex="-1"])'
  ))

  if (!focusable.length) {
    event.preventDefault()
    return
  }

  const first = focusable[0]
  const last = focusable.at(-1)

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

async function confirmStatusUpdate() {
  if (!statusDialog.value || !pendingStatus.value || updatingStatus.value) {
    return
  }

  const products = statusDialog.value.products
  const scrollTop = window.scrollY
  updatingStatus.value = true
  statusUpdateError.value = ''
  operationNotice.value = null

  try {
    const response = await bulkUpdateMyProductStatus(
      products.map((product) => product.id),
      pendingStatus.value
    )
    const { matchedCount, updatedCount } = response.data

    operationNotice.value = {
      type: 'success',
      message: updatedCount
        ? `Đã cập nhật trạng thái cho ${updatedCount} sản phẩm.${matchedCount > updatedCount
          ? ` ${matchedCount - updatedCount} sản phẩm đã ở trạng thái này.`
          : ''}`
        : 'Không có sản phẩm nào cần thay đổi trạng thái.'
    }
    statusDialog.value = null
    pendingStatus.value = ''
    clearSelection()
    await loadProducts(routeState.value)
    restoreScroll(scrollTop)
  } catch (requestError) {
    statusUpdateError.value = requestError.status === 401
      ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
      : requestError.message || 'Không thể cập nhật trạng thái sản phẩm.'
  } finally {
    updatingStatus.value = false
  }
}

function openSelectedDeleteDialog(event) {
  const trigger = bulkActionButton.value || event.currentTarget
  bulkActionOpen.value = false
  openDeleteDialog(selectedProducts.value, { currentTarget: trigger })
}

async function openDeleteDialog(products, trigger) {
  if (!products.length || deleting.value) {
    return
  }

  deleteDialogTrigger = trigger?.currentTarget || document.activeElement
  deleteError.value = ''
  deleteDialog.value = {
    products,
    mode: products.length === 1 ? 'single' : 'bulk'
  }
  await nextTick()
  confirmDeleteButton.value?.focus()
}

function closeDeleteDialog() {
  if (deleting.value) {
    return
  }

  deleteDialog.value = null
  deleteError.value = ''
  nextTick(() => deleteDialogTrigger?.focus?.())
}

function trapDeleteDialogFocus(event) {
  const panel = event.currentTarget
  const focusable = Array.from(panel.querySelectorAll(
    'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
  ))

  if (!focusable.length) {
    event.preventDefault()
    return
  }

  const first = focusable[0]
  const last = focusable.at(-1)

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function restoreScroll(top) {
  window.requestAnimationFrame(() => {
    window.scrollTo({ top, behavior: 'instant' })
  })
}

async function confirmDelete() {
  if (!deleteDialog.value || deleting.value) {
    return
  }

  const products = deleteDialog.value.products
  const scrollTop = window.scrollY

  deleting.value = true
  deleteError.value = ''
  operationNotice.value = null

  try {
    const response = products.length === 1
      ? await deleteMyProduct(products[0].id)
      : await bulkDeleteMyProducts(products.map((product) => product.id))
    const deletedCount = products.length === 1
      ? 1
      : response.data.deleted_count
    const remainingCount = Math.max(
      0,
      pagination.value.totalItems - deletedCount
    )
    const lastAvailablePage = Math.max(
      1,
      Math.ceil(remainingCount / pagination.value.pageSize)
    )

    operationNotice.value = {
      type: 'success',
      message: deletedCount === 1
        ? `Đã chuyển “${products[0].title}” vào Thùng rác.`
        : `Đã chuyển ${deletedCount} sản phẩm vào Thùng rác.`
    }
    deleteDialog.value = null
    clearSelection()

    if (pagination.value.currentPage > lastAvailablePage) {
      await updateQuery({ page: lastAvailablePage })
    } else {
      await loadProducts(routeState.value)
    }

    restoreScroll(scrollTop)
  } catch (requestError) {
    deleteError.value = requestError.message ||
      'Không thể xóa sản phẩm. Vui lòng thử lại.'
  } finally {
    deleting.value = false
  }
}

async function loadCategories(force = false) {
  if ((categoriesLoaded && !force) || categoriesLoading.value) {
    return
  }

  categoriesLoading.value = true
  categoriesError.value = ''

  try {
    const response = await getCategories()
    categories.value = response.data
    categoriesLoaded = true
  } catch {
    categoriesError.value = 'Không thể tải danh mục. Vui lòng thử lại.'
  } finally {
    categoriesLoading.value = false
  }
}

async function loadProducts(state = routeState.value) {
  const currentRequest = ++requestSequence

  loading.value = true
  error.value = ''

  try {
    const response = await getMyProducts({
      search: state.search,
      categoryId: state.categoryId,
      status: state.status,
      minPrice: state.minPrice,
      maxPrice: state.maxPrice,
      sort: state.sort,
      page: state.page,
      limit: PAGE_SIZE
    })

    if (currentRequest !== requestSequence) {
      return
    }

    items.value = response.data.items
    pagination.value = response.data.pagination
    failedImages.value = new Set()
  } catch (requestError) {
    if (currentRequest !== requestSequence) {
      return
    }

    error.value = requestError.status === 401
      ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
      : requestError.message || 'Không thể tải sản phẩm. Vui lòng thử lại.'
  } finally {
    if (currentRequest === requestSequence) {
      loading.value = false
    }
  }
}

function updateSearchSuggestions() {
  suggestionsOpen.value = Boolean(draftSearch.value.trim())
  activeSuggestionIndex.value = -1
}

function submitSearch() {
  if (loading.value) {
    return
  }

  suggestionsOpen.value = false
  activeSuggestionIndex.value = -1
  updateQuery({
    search: draftSearch.value.trim() || null,
    page: null
  })
}

function applyCategorySuggestion(category) {
  if (loading.value) {
    return
  }

  draftSearch.value = ''
  selectedCategoryId.value = String(category.id)
  suggestionsOpen.value = false
  activeSuggestionIndex.value = -1
  updateQuery({
    search: null,
    categoryId: category.id,
    page: null
  })
}

function handleSearchKeydown(event) {
  if (event.key === 'Escape') {
    suggestionsOpen.value = false
    activeSuggestionIndex.value = -1
    return
  }

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    if (!categorySuggestions.value.length) {
      return
    }

    event.preventDefault()
    suggestionsOpen.value = true
    const direction = event.key === 'ArrowDown' ? 1 : -1
    const suggestionCount = categorySuggestions.value.length
    activeSuggestionIndex.value = (
      activeSuggestionIndex.value + direction + suggestionCount
    ) % suggestionCount
    return
  }

  if (event.key === 'Enter') {
    event.preventDefault()

    if (visibleSuggestions.value && activeSuggestionIndex.value >= 0) {
      applyCategorySuggestion(
        categorySuggestions.value[activeSuggestionIndex.value]
      )
      return
    }

    submitSearch()
  }
}

function handleSearchFocusOut(event) {
  if (!event.currentTarget.contains(event.relatedTarget)) {
    suggestionsOpen.value = false
    activeSuggestionIndex.value = -1
  }
}

function changeCategory() {
  if (loading.value) {
    return
  }

  updateQuery({
    categoryId: selectedCategoryId.value || null,
    page: null
  })
}

function changeStatus() {
  if (!loading.value) {
    updateQuery({ status: selectedStatus.value || null, page: null })
  }
}

function applyPriceRange() {
  if (!loading.value && !priceRangeError.value) {
    updateQuery({
      minPrice: minPrice.value || null,
      maxPrice: maxPrice.value || null,
      page: null
    })
  }
}

function changeSort() {
  if (loading.value) {
    return
  }

  updateQuery({
    sort: selectedSort.value,
    page: null
  })
}

function clearFilters() {
  if (loading.value) {
    return
  }

  draftSearch.value = ''
  selectedCategoryId.value = ''
  selectedStatus.value = ''
  minPrice.value = ''
  maxPrice.value = ''
  suggestionsOpen.value = false
  updateQuery({
    search: null,
    categoryId: null,
    status: null,
    minPrice: null,
    maxPrice: null,
    page: null
  })
}

function clearAppliedSearch() {
  if (loading.value) {
    return
  }

  draftSearch.value = ''
  suggestionsOpen.value = false
  activeSuggestionIndex.value = -1
  updateQuery({
    search: null,
    page: null
  })
}

function clearCategoryFilter() {
  if (loading.value) {
    return
  }

  selectedCategoryId.value = ''
  updateQuery({
    categoryId: null,
    page: null
  })
}

function goToPage(page) {
  const totalPages = pagination.value.totalPages

  if (
    loading.value ||
    !Number.isInteger(page) ||
    page < 1 ||
    page > totalPages ||
    page === pagination.value.currentPage
  ) {
    return
  }

  updateQuery({ page })
}

function productImageUrl(product) {
  return product.image_url
    ? new URL(product.image_url, API_BASE_URL).toString()
    : ''
}

function markImageFailed(productId) {
  failedImages.value = new Set([
    ...failedImages.value,
    String(productId)
  ])
}

function hasFailedImage(productId) {
  return failedImages.value.has(String(productId))
}

function formatPrice(product) {
  const minimum = currencyFormatter.format(product.min_price)

  if (product.min_price === product.max_price) {
    return minimum
  }

  return `${minimum} – ${currencyFormatter.format(product.max_price)}`
}

function stockTone(stock) {
  const value = Number(stock)

  if (value === 0) {
    return 'out'
  }

  return value <= 5 ? 'low' : 'ready'
}

function formatUpdatedAt(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : dateFormatter.format(date)
}

function statusLabel(status) {
  const labels = {
    active: 'Đang bán',
    unactive: 'Ngưng bán',
    draft: 'Bản nháp'
  }

  return labels[status] || status
}

watch(
  [
    () => route.fullPath,
    () => props.sessionLoading,
    () => props.currentUser
  ],
  () => {
    const state = normalizeRouteState(route.query)

    if (route.fullPath !== lastSelectionRoute) {
      clearSelection()
      lastSelectionRoute = route.fullPath
    }

    if (state.search !== lastSyncedAppliedSearch) {
      draftSearch.value = state.search
      lastSyncedAppliedSearch = state.search
    }

    selectedCategoryId.value = state.categoryId
    selectedStatus.value = state.status
    minPrice.value = state.minPrice
    maxPrice.value = state.maxPrice
    selectedSort.value = state.sort

    if (!props.sessionLoading && props.currentUser) {
      loadCategories()
      loadProducts(state)
      return
    }

    requestSequence += 1
    items.value = []
    pagination.value = createEmptyPagination()
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  requestSequence += 1
  document.removeEventListener('mousedown', handleDocumentPointerDown)
})

onMounted(() => {
  document.addEventListener('mousedown', handleDocumentPointerDown)
})
</script>

<template>
  <main class="profile-page my-products-page">
    <section class="section profile-section my-products-section">
      <div v-if="sessionLoading" class="profile-empty">
        <h3>Đang kiểm tra phiên đăng nhập...</h3>
      </div>

      <div v-else-if="currentUser" class="my-products-shell">
        <header class="my-products-hero">
          <div class="my-products-hero__copy">
            <RouterLink class="seller-breadcrumb" :to="{ name: 'profile' }">
              Tài khoản <span aria-hidden="true">/</span> Quản lý sản phẩm
            </RouterLink>
            <p class="account-card__eyebrow">Trung tâm bán hàng</p>
            <h1>Quản lý sản phẩm</h1>
            <p>
              Tìm, sắp xếp và theo dõi toàn bộ sản phẩm do tài khoản của bạn
              đăng bán trên RunStore.
            </p>
          </div>

          <div class="my-products-hero__panel">
            <div class="my-products-hero__actions">
              <RouterLink
                class="account-button account-button--primary my-products-add"
                :to="{ name: 'product-create' }"
              >
                <span class="seller-card__plus" aria-hidden="true"></span>
                Thêm sản phẩm
              </RouterLink>
              <RouterLink
                class="account-button account-button--quiet my-products-trash-link"
                :to="{ name: 'product-trash' }"
              >
                Thùng rác
              </RouterLink>
            </div>
            <dl class="my-products-hero__stats" aria-label="Tổng quan sản phẩm">
              <div><dt>Tổng sản phẩm</dt><dd>{{ pagination.totalItems }}</dd></div>
              <div><dt>Đang hiển thị</dt><dd>{{ items.length }}</dd></div>
              <div><dt>Hết hàng / trang</dt><dd>{{ outOfStockOnPage }}</dd></div>
            </dl>
          </div>
        </header>

        <p
          v-if="route.query.created === '1'"
          class="account-notice account-notice--success my-products-created-notice"
          role="status"
        >
          Sản phẩm đã được đăng và đã xuất hiện trong danh sách của bạn.
        </p>

        <p
          v-else-if="route.query.updated === '1'"
          class="account-notice account-notice--success my-products-created-notice"
          role="status"
        >
          Thay đổi sản phẩm đã được lưu an toàn.
        </p>

        <p
          v-if="operationNotice"
          class="account-notice my-products-operation-notice"
          :class="`account-notice--${operationNotice.type}`"
          role="status"
        >
          {{ operationNotice.message }}
        </p>

        <section class="my-products-toolbar" aria-labelledby="product-tools-title">
          <div class="my-products-toolbar__heading">
            <div>
              <p class="account-card__eyebrow">Công cụ</p>
              <h2 id="product-tools-title">Tìm và sắp xếp</h2>
              <p id="product-search-hint" class="my-products-toolbar__hint">
                Nhập từ khóa rồi nhấn Enter hoặc nút Tìm kiếm để áp dụng.
              </p>
            </div>
            <button
              v-if="hasActiveFilters"
              class="my-products-clear"
              type="button"
              :disabled="loading"
              @click="clearFilters"
            >
              Xóa bộ lọc
            </button>
          </div>

          <form class="my-products-controls" @submit.prevent="submitSearch">
            <div
              class="my-products-control my-products-search"
              @focusout="handleSearchFocusOut"
            >
              <label for="my-products-search">Tìm theo tên sản phẩm</label>
              <div class="my-products-search__field">
                <input
                  id="my-products-search"
                  v-model="draftSearch"
                  autocomplete="off"
                  placeholder="Ví dụ: giày chạy bộ"
                  type="search"
                  aria-describedby="product-search-hint"
                  :aria-expanded="visibleSuggestions"
                  :aria-activedescendant="activeSuggestionIndex >= 0
                    ? `category-suggestion-${categorySuggestions[activeSuggestionIndex]?.id}`
                    : undefined"
                  aria-controls="category-suggestions"
                  @focus="suggestionsOpen = Boolean(draftSearch.trim())"
                  @input="updateSearchSuggestions"
                  @keydown="handleSearchKeydown"
                />
                <button type="submit" :disabled="loading">
                  <span aria-hidden="true">⌕</span>
                  {{ loading ? 'Đang tải' : 'Tìm kiếm' }}
                </button>
              </div>

              <ul
                v-if="visibleSuggestions"
                id="category-suggestions"
                class="category-suggestions"
                role="listbox"
                aria-label="Gợi ý bộ lọc danh mục"
              >
                <li class="category-suggestions__label">
                  Danh mục phù hợp · chọn để lọc
                </li>
                <li
                  v-for="(category, index) in categorySuggestions"
                  :key="category.id"
                >
                  <button
                    :id="`category-suggestion-${category.id}`"
                    type="button"
                    role="option"
                    :disabled="loading"
                    :aria-selected="index === activeSuggestionIndex"
                    :class="{ active: index === activeSuggestionIndex }"
                    @click="applyCategorySuggestion(category)"
                  >
                    <span>{{ category.name }}</span>
                    <small>Áp dụng bộ lọc</small>
                  </button>
                </li>
              </ul>
            </div>

            <div class="my-products-control">
              <label for="my-products-category">Danh mục</label>
              <select
                id="my-products-category"
                v-model="selectedCategoryId"
                :disabled="categoriesLoading || loading"
                @change="changeCategory"
              >
                <option value="">Tất cả danh mục</option>
                <option
                  v-for="category in categories"
                  :key="category.id"
                  :value="String(category.id)"
                >
                  {{ category.name }}
                </option>
              </select>
            </div>

            <div class="my-products-control">
              <label for="my-products-sort">Sắp xếp</label>
              <label for="my-products-status">Trạng thái</label>
              <select
                id="my-products-status"
                v-model="selectedStatus"
                :disabled="loading"
                @change="changeStatus"
              >
                <option value="">Tất cả trạng thái</option>
                <option value="active">Đang bán</option>
                <option value="unactive">Ngưng bán</option>
                <option value="draft">Bản nháp</option>
              </select>
            </div>

            <div class="my-products-control my-products-price-range">
              <label for="my-products-min-price">Khoảng giá</label>
              <div>
                <input id="my-products-min-price" v-model="minPrice" min="0" placeholder="Từ" type="number" />
                <input v-model="maxPrice" min="0" placeholder="Đến" type="number" />
                <button type="button" :disabled="loading || priceRangeError" @click="applyPriceRange">Lọc giá</button>
              </div>
              <small v-if="priceRangeError" role="alert">Giá từ không được lớn hơn giá đến.</small>
            </div>

            <div class="my-products-control">
              <label for="my-products-sort">Sắp xếp</label>
              <select
                id="my-products-sort"
                v-model="selectedSort"
                :disabled="loading"
                @change="changeSort"
              >
                <option value="name_asc">Tên: A → Z</option>
                <option value="name_desc">Tên: Z → A</option>
                <option value="price_asc">Giá: thấp → cao</option>
                <option value="price_desc">Giá: cao → thấp</option>
                <option value="category_asc">Nhóm theo danh mục</option>
              </select>
            </div>
          </form>

          <div
            v-if="hasActiveFilters"
            class="my-products-filter-chips"
            aria-label="Bộ lọc đang áp dụng"
          >
            <span class="my-products-filter-chips__label">Đang áp dụng</span>
            <button
              v-if="appliedSearch"
              type="button"
              :disabled="loading"
              @click="clearAppliedSearch"
            >
              Từ khóa: “{{ appliedSearch }}”
              <span aria-hidden="true">×</span>
              <span class="sr-only">Xóa từ khóa tìm kiếm</span>
            </button>
            <button
              v-if="selectedCategory"
              type="button"
              :disabled="loading"
              @click="clearCategoryFilter"
            >
              {{ selectedCategory.name }}
              <span aria-hidden="true">×</span>
              <span class="sr-only">Xóa bộ lọc danh mục</span>
            </button>
          </div>

          <div
            v-if="categoriesError"
            class="my-products-category-error"
            role="alert"
          >
            <span>{{ categoriesError }}</span>
            <button type="button" @click="loadCategories(true)">Thử lại</button>
          </div>
        </section>

        <section
          class="my-products-results"
          :class="{ 'is-refreshing': isRefreshing }"
          aria-labelledby="product-results-title"
          :aria-busy="loading"
        >
          <div class="my-products-results__heading">
            <div>
              <p class="account-card__eyebrow">Danh sách của bạn</p>
              <h2 id="product-results-title" aria-live="polite">
                {{ productCountLabel }}
              </h2>
            </div>
            <div class="my-products-results__meta">
              <p v-if="appliedSearch">
                Kết quả cho “{{ appliedSearch }}”
              </p>
              <span v-if="isRefreshing" class="my-products-refresh-badge" role="status">
                <i aria-hidden="true"></i>
                Đang cập nhật
              </span>
            </div>
          </div>

          <div
            v-if="items.length"
            class="my-products-selection-bar"
            :class="{ 'has-selection': selectedCount > 0 }"
          >
            <label class="my-products-select-all">
              <input
                type="checkbox"
                :checked="allCurrentPageSelected"
                :indeterminate="someCurrentPageSelected"
                :disabled="loading || deleting || updatingStatus"
                @change="toggleCurrentPageSelection"
              />
              <span>
                {{ allCurrentPageSelected
                  ? 'Bỏ chọn trang này'
                  : 'Chọn tất cả trên trang này' }}
              </span>
            </label>

            <Transition name="selection-pop">
              <div v-if="selectedCount" class="my-products-selection-actions">
                <strong aria-live="polite">Đã chọn {{ selectedCount }} sản phẩm</strong>
                <button
                  type="button"
                  :disabled="deleting || updatingStatus"
                  @click="clearSelection"
                >
                  Bỏ chọn
                </button>
                <div class="my-products-bulk-actions">
                  <button
                    id="bulk-product-actions-button"
                    ref="bulkActionButton"
                    class="my-products-action-button"
                    type="button"
                    aria-haspopup="menu"
                    aria-controls="bulk-product-actions-menu"
                    :aria-expanded="bulkActionOpen"
                    :disabled="deleting || updatingStatus"
                    @click="toggleBulkActionMenu"
                    @keydown.down.prevent="toggleBulkActionMenu"
                  >
                    Hành động <span aria-hidden="true">▾</span>
                  </button>
                  <Transition name="action-menu">
                    <div
                      v-if="bulkActionOpen"
                      id="bulk-product-actions-menu"
                      ref="bulkActionMenu"
                      class="my-products-action-menu"
                      role="menu"
                      aria-labelledby="bulk-product-actions-button"
                      @keydown="handleBulkActionMenuKeydown"
                    >
                      <button type="button" role="menuitem" @click="openStatusDialog">
                        <span class="my-products-action-menu__icon" aria-hidden="true">↻</span>
                        <span>
                          <strong>Cập nhật trạng thái</strong>
                          <small>Áp dụng chung cho sản phẩm đã chọn</small>
                        </span>
                      </button>
                      <button
                        class="is-danger"
                        type="button"
                        role="menuitem"
                        @click="openSelectedDeleteDialog"
                      >
                        <span class="my-products-action-menu__icon" aria-hidden="true">×</span>
                        <span>
                          <strong>Đưa vào Thùng rác</strong>
                          <small>Có thể khôi phục sau</small>
                        </span>
                      </button>
                    </div>
                  </Transition>
                </div>
              </div>
            </Transition>
          </div>

          <div
            v-if="error && items.length"
            class="my-products-refresh-error"
            role="alert"
          >
            <span>{{ error }}</span>
            <button type="button" :disabled="loading" @click="loadProducts()">
              Thử lại
            </button>
          </div>

          <div v-if="isInitialLoading" class="my-products-loading" role="status">
            <span>Đang tải sản phẩm...</span>
            <div
              v-for="index in 6"
              :key="index"
              class="my-product-skeleton"
              aria-hidden="true"
            >
              <i></i><i></i><i></i><i></i>
            </div>
          </div>

          <div
            v-else-if="error && !items.length"
            class="my-products-state my-products-state--error"
          >
            <div class="my-products-state__mark" aria-hidden="true">!</div>
            <div>
              <h3>Không thể tải danh sách sản phẩm</h3>
              <p>{{ error }}</p>
            </div>
            <button
              v-if="error.includes('hết hạn')"
              class="account-button account-button--primary"
              type="button"
              @click="emit('open-auth')"
            >
              Đăng nhập lại
            </button>
            <button
              v-else
              class="account-button account-button--quiet"
              type="button"
              :disabled="loading"
              @click="loadProducts()"
            >
              Thử lại
            </button>
          </div>

          <div
            v-else-if="!items.length && !hasActiveFilters"
            class="my-products-state"
          >
            <div class="seller-card__icon" aria-hidden="true"></div>
            <div>
              <h3>Bạn chưa đăng sản phẩm nào</h3>
              <p>Tạo sản phẩm đầu tiên để bắt đầu khu vực bán hàng của bạn.</p>
            </div>
            <RouterLink
              class="account-button account-button--primary"
              :to="{ name: 'product-create' }"
            >
              Thêm sản phẩm
            </RouterLink>
          </div>

          <div v-else-if="!items.length" class="my-products-state">
            <div class="my-products-state__mark" aria-hidden="true">0</div>
            <div>
              <h3>Không tìm thấy sản phẩm phù hợp</h3>
              <p>Hãy xóa từ khóa hoặc bộ lọc danh mục để xem lại tất cả sản phẩm.</p>
            </div>
            <button
              class="account-button account-button--quiet"
              type="button"
              :disabled="loading"
              @click="clearFilters"
            >
              Hiển thị tất cả
            </button>
          </div>

          <div
            v-else
            class="my-products-list"
            :class="{ 'is-updating': isRefreshing }"
            role="list"
          >
            <template v-for="row in groupedRows" :key="row.product.id">
              <h3 v-if="row.showGroupHeading" class="my-products-group-heading">
                {{ row.groupName }}
              </h3>

              <article
                class="my-product-card"
                :class="{ 'is-selected': isSelected(row.product.id) }"
                role="listitem"
              >
                <label class="my-product-card__select">
                  <input
                    type="checkbox"
                    :checked="isSelected(row.product.id)"
                    :disabled="loading || deleting || updatingStatus"
                    @change="toggleProductSelection(row.product.id)"
                  />
                  <span class="sr-only">Chọn {{ row.product.title }}</span>
                </label>

                <div class="my-product-card__media">
                  <img
                    v-if="productImageUrl(row.product) && !hasFailedImage(row.product.id)"
                    :src="productImageUrl(row.product)"
                    :alt="`Ảnh ${row.product.title}`"
                    @error="markImageFailed(row.product.id)"
                  />
                  <div v-else class="my-product-card__fallback" aria-hidden="true">
                    SB
                  </div>
                </div>

                <div class="my-product-card__identity">
                  <span>{{ row.groupName }}</span>
                  <h3>{{ row.product.title }}</h3>
                  <small>Mã sản phẩm #{{ row.product.id }}</small>
                </div>

                <div class="my-product-card__metric my-product-card__price">
                  <small>Giá hiển thị</small>
                  <strong>{{ formatPrice(row.product) }}</strong>
                </div>

                <div class="my-product-card__metric my-product-card__stock">
                  <small>Tồn kho</small>
                  <strong :class="`stock-${stockTone(row.product.stock)}`">
                    {{ row.product.stock }}
                  </strong>
                  <small v-if="row.product.updated_at" class="my-product-card__updated">
                    Cập nhật {{ formatUpdatedAt(row.product.updated_at) }}
                  </small>
                </div>

                <div class="my-product-card__status">
                  <span :class="`status-${row.product.status}`">
                    {{ statusLabel(row.product.status) }}
                  </span>
                </div>

                <div class="my-product-card__actions">
                  <RouterLink
                    v-if="row.product.status === 'active'"
                    class="my-product-card__view"
                    :to="{ name: 'product-detail', params: { id: row.product.id } }"
                    :aria-label="`Xem ${row.product.title}`"
                  >
                    Xem
                  </RouterLink>
                  <RouterLink
                    :to="{ name: 'product-edit', params: { id: row.product.id } }"
                    :aria-label="`Chỉnh sửa ${row.product.title}`"
                  >
                    Chỉnh sửa
                  </RouterLink>
                  <button
                    type="button"
                    :disabled="deleting"
                    :aria-label="`Xóa ${row.product.title}`"
                    @click="openDeleteDialog([row.product], $event)"
                  >
                    Xóa
                  </button>
                </div>
              </article>
            </template>
          </div>

          <nav
            v-if="items.length && pageTokens.length"
            class="my-products-pagination"
            aria-label="Phân trang sản phẩm"
          >
            <button
              type="button"
              aria-label="Trang trước"
              :disabled="loading || !pagination.hasPreviousPage"
              @click="goToPage(pagination.currentPage - 1)"
            >
              ←
            </button>

            <template v-for="token in pageTokens" :key="token.key">
              <span v-if="token.type === 'ellipsis'" aria-hidden="true">…</span>
              <button
                v-else
                type="button"
                :class="{ active: token.value === pagination.currentPage }"
                :aria-current="token.value === pagination.currentPage ? 'page' : undefined"
                :aria-label="`Trang ${token.value}`"
                :disabled="loading"
                @click="goToPage(token.value)"
              >
                {{ token.value }}
              </button>
            </template>

            <button
              type="button"
              aria-label="Trang sau"
              :disabled="loading || !pagination.hasNextPage"
              @click="goToPage(pagination.currentPage + 1)"
            >
              →
            </button>
          </nav>

          <div v-if="isRefreshing" class="my-products-loading-line" aria-hidden="true"></div>
        </section>
      </div>

      <div v-else class="profile-empty">
        <h3>Đăng nhập để quản lý sản phẩm</h3>
        <p>
          Bạn cần đăng nhập trước khi xem khu vực sản phẩm của tài khoản.
        </p>
        <button type="button" @click="emit('open-auth')">
          Đăng nhập / Đăng ký
        </button>
      </div>
    </section>

    <Transition name="modal-fade">
      <div
        v-if="deleteDialog"
        class="product-delete-modal"
        role="presentation"
        @mousedown.self="closeDeleteDialog"
      >
      <section
        class="product-delete-modal__panel"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-product-title"
        aria-describedby="delete-product-description"
        tabindex="-1"
        @keydown.esc="closeDeleteDialog"
        @keydown.tab="trapDeleteDialogFocus"
      >
        <div class="product-delete-modal__icon" aria-hidden="true">!</div>
        <p class="account-card__eyebrow">Xác nhận thao tác</p>
        <h2 id="delete-product-title">
          {{ deleteDialog.mode === 'single'
            ? 'Đưa sản phẩm vào Thùng rác?'
            : `Xóa ${deleteDialog.products.length} sản phẩm đã chọn?` }}
        </h2>
        <p id="delete-product-description">
          {{ deleteDialog.mode === 'single'
            ? `“${deleteDialog.products[0].title}” sẽ không còn xuất hiện trong danh sách bán và marketplace.`
            : 'Các sản phẩm này sẽ không còn xuất hiện trong danh sách bán và marketplace.' }}
          Bạn vẫn có thể khôi phục chúng từ Thùng rác.
        </p>

        <ul v-if="deleteDialog.mode === 'bulk'" class="product-delete-modal__list">
          <li
            v-for="product in deleteDialog.products.slice(0, 5)"
            :key="product.id"
          >
            {{ product.title }}
          </li>
          <li v-if="deleteDialog.products.length > 5">
            Và {{ deleteDialog.products.length - 5 }} sản phẩm khác
          </li>
        </ul>

        <p v-if="deleteError" class="product-delete-modal__error" role="alert">
          {{ deleteError }}
        </p>

        <div class="product-delete-modal__actions">
          <button
            type="button"
            :disabled="deleting"
            @click="closeDeleteDialog"
          >
            Hủy
          </button>
          <button
            ref="confirmDeleteButton"
            class="product-delete-modal__confirm"
            type="button"
            :disabled="deleting"
            @click="confirmDelete"
          >
            {{ deleting
              ? 'Đang xử lý...'
              : deleteDialog.mode === 'single'
                ? 'Đưa vào Thùng rác'
                : `Xóa ${deleteDialog.products.length} sản phẩm` }}
          </button>
        </div>
        </section>
      </div>
    </Transition>

    <Transition name="modal-fade">
      <div
        v-if="statusDialog"
        class="product-delete-modal product-status-modal"
        role="presentation"
        @mousedown.self="closeStatusDialog"
      >
        <section
          class="product-delete-modal__panel product-status-modal__panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="status-modal-title"
          aria-describedby="status-modal-description"
          @keydown.esc.stop.prevent="closeStatusDialog"
          @keydown.tab="trapStatusDialogFocus"
        >
          <header class="product-status-modal__header">
            <div>
              <p class="account-card__eyebrow">Bulk update</p>
              <h2 id="status-modal-title">Cập nhật trạng thái sản phẩm</h2>
            </div>
            <button
              ref="statusDialogCloseButton"
              class="product-status-modal__close"
              type="button"
              aria-label="Đóng hộp thoại cập nhật trạng thái"
              :disabled="updatingStatus"
              @click="closeStatusDialog"
            >×</button>
          </header>

          <p id="status-modal-description" class="product-status-modal__description">
            Trạng thái mới sẽ được áp dụng cho
            <strong>{{ statusDialog.products.length }} sản phẩm đã chọn</strong>.
          </p>

          <fieldset
            class="product-status-options"
            :aria-describedby="statusUpdateError ? 'status-update-error' : undefined"
          >
            <legend>Trạng thái mới</legend>
            <label
              v-for="option in bulkStatusOptions"
              :key="option.value"
              class="product-status-option"
              :class="{ 'is-selected': pendingStatus === option.value }"
            >
              <input
                v-model="pendingStatus"
                type="radio"
                name="bulk-product-status"
                :value="option.value"
                :disabled="updatingStatus"
              />
              <span class="product-status-option__marker" aria-hidden="true">✓</span>
              <span>
                <strong>{{ option.label }}</strong>
                <small>{{ option.description }}</small>
              </span>
            </label>
          </fieldset>

          <div class="product-status-modal__products">
            <span>Áp dụng cho</span>
            <ul>
              <li
                v-for="product in statusDialog.products.slice(0, 5)"
                :key="product.id"
              >{{ product.title }}</li>
              <li v-if="statusDialog.products.length > 5">
                Và {{ statusDialog.products.length - 5 }} sản phẩm khác
              </li>
            </ul>
          </div>

          <p
            v-if="statusUpdateError"
            id="status-update-error"
            class="product-delete-modal__error"
            role="alert"
          >{{ statusUpdateError }}</p>

          <footer class="product-delete-modal__actions product-status-modal__actions">
            <button type="button" :disabled="updatingStatus" @click="closeStatusDialog">
              Hủy
            </button>
            <button
              class="product-status-modal__save"
              type="button"
              :disabled="!pendingStatus || updatingStatus"
              @click="confirmStatusUpdate"
            >
              <span v-if="updatingStatus" class="seller-button-spinner" aria-hidden="true"></span>
              {{ updatingStatus ? 'Đang lưu...' : 'Lưu thay đổi' }}
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </main>
</template>
