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

const emit = defineEmits(['open-auth', 'products-unavailable'])
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
const filterMenuOpen = ref(false)
const activeFilterSection = ref('')
const filterMenuButton = ref(null)
const filterMenu = ref(null)
const priceDialogOpen = ref(false)
const priceDialogCloseButton = ref(null)
const priceDialogPanel = ref(null)

let categoriesLoaded = false
let requestSequence = 0
let lastSyncedAppliedSearch
let lastSelectionRoute
let deleteDialogTrigger
let statusDialogTrigger

const bulkStatusOptions = Object.freeze([
  {
    value: 'active',
    label: 'Active',
    description: 'Customers can find this product and buy in-stock variants.'
  },
  {
    value: 'unactive',
    label: 'Inactive',
    description: 'Hide the product from the store while keeping images, variants and stock.'
  },
  {
    value: 'draft',
    label: 'Draft',
    description: 'Only shown in your management list until you set it to Active.'
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
  routeState.value.minPrice || routeState.value.maxPrice ||
  routeState.value.sort !== DEFAULT_SORT
))
const appliedMenuFilterCount = computed(() => [
  routeState.value.categoryId,
  routeState.value.status,
  routeState.value.minPrice || routeState.value.maxPrice,
  routeState.value.sort !== DEFAULT_SORT
].filter(Boolean).length)
const isInitialLoading = computed(() => loading.value && !items.value.length)
const isRefreshing = computed(() => loading.value && items.value.length > 0)
const selectedCategory = computed(() => categories.value.find(
  (category) => String(category.id) === routeState.value.categoryId
))
const selectedStatusLabel = computed(() => statusLabel(routeState.value.status))
const selectedSortLabel = computed(() => ({
  name_asc: 'Name A → Z',
  name_desc: 'Name Z → A',
  price_asc: 'Price low → high',
  price_desc: 'Price high → low',
  category_asc: 'Group by category'
})[routeState.value.sort] || '')
const priceRangeError = computed(() => {
  const minimum = Number(minPrice.value)
  const maximum = Number(maxPrice.value)

  return minPrice.value && maxPrice.value && minimum > maximum
})
const productCountLabel = computed(() =>
  `${pagination.value.totalItems} products`
)
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
    groupName: product.category?.name || 'Uncategorized',
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

  if (
    filterMenuOpen.value &&
    !filterMenu.value?.contains(event.target) &&
    !filterMenuButton.value?.contains(event.target)
  ) {
    closeFilterMenu()
  }
}

async function toggleFilterMenu() {
  filterMenuOpen.value = !filterMenuOpen.value
  activeFilterSection.value = ''

  if (filterMenuOpen.value) {
    suggestionsOpen.value = false
    await nextTick()
    filterMenu.value?.querySelector('button')?.focus()
  }
}

function closeFilterMenu({ restoreFocus = false } = {}) {
  filterMenuOpen.value = false
  activeFilterSection.value = ''
  if (restoreFocus) nextTick(() => filterMenuButton.value?.focus())
}

function toggleFilterSection(section) {
  activeFilterSection.value = activeFilterSection.value === section ? '' : section
}

function handleFilterMenuKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    closeFilterMenu({ restoreFocus: true })
  }
}

function applyCategoryFilter(categoryId) {
  if (loading.value || categoriesLoading.value) return
  selectedCategoryId.value = String(categoryId || '')
  closeFilterMenu()
  updateQuery({ categoryId: categoryId || null, page: null })
}

function applyStatusFilter(status) {
  if (loading.value) return
  selectedStatus.value = status
  closeFilterMenu()
  updateQuery({ status: status || null, page: null })
}

function applySortOption(sort) {
  if (loading.value || !allowedSorts.has(sort)) return
  selectedSort.value = sort
  closeFilterMenu()
  updateQuery({ sort, page: null })
}

async function openPriceDialog() {
  closeFilterMenu()
  minPrice.value = routeState.value.minPrice
  maxPrice.value = routeState.value.maxPrice
  priceDialogOpen.value = true
  await nextTick()
  priceDialogCloseButton.value?.focus()
}

function closePriceDialog() {
  priceDialogOpen.value = false
  minPrice.value = routeState.value.minPrice
  maxPrice.value = routeState.value.maxPrice
  nextTick(() => filterMenuButton.value?.focus())
}

function trapPriceDialogFocus(event) {
  const focusable = Array.from(event.currentTarget.querySelectorAll(
    'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'
  ))
  const first = focusable[0]
  const last = focusable.at(-1)

  if (!first || !last) return
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
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
        ? `Updated status for ${updatedCount} products.${matchedCount > updatedCount
          ? ` ${matchedCount - updatedCount} products already have this status.`
          : ''}`
        : 'No products need a status change.'
    }
    if (pendingStatus.value !== 'active') {
      emit('products-unavailable', products.map((product) => product.id))
    }
    statusDialog.value = null
    pendingStatus.value = ''
    clearSelection()
    await loadProducts(routeState.value)
    restoreScroll(scrollTop)
  } catch (requestError) {
    statusUpdateError.value = requestError.status === 401
      ? 'Your session has expired. Please sign in again.'
      : requestError.message || 'Could not update product status.'
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
        ? `Moved “${products[0].title}” to trash.`
        : `Moved ${deletedCount} products to trash.`
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
      'Could not delete product. Please try again.'
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
    categoriesError.value = 'Could not load categories. Please try again.'
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
      ? 'Your session has expired. Please sign in again.'
      : requestError.message || 'Could not load products. Please try again.'
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

async function applyPriceRange() {
  if (!loading.value && !priceRangeError.value) {
    await updateQuery({
      minPrice: minPrice.value || null,
      maxPrice: maxPrice.value || null,
      page: null
    })
    priceDialogOpen.value = false
    nextTick(() => filterMenuButton.value?.focus())
  }
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
  selectedSort.value = DEFAULT_SORT
  suggestionsOpen.value = false
  closeFilterMenu()
  updateQuery({
    search: null,
    categoryId: null,
    status: null,
    minPrice: null,
    maxPrice: null,
    sort: null,
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

function clearStatusFilter() {
  if (loading.value) return
  selectedStatus.value = ''
  updateQuery({ status: null, page: null })
}

function clearPriceFilter() {
  if (loading.value) return
  minPrice.value = ''
  maxPrice.value = ''
  updateQuery({ minPrice: null, maxPrice: null, page: null })
}

function clearSort() {
  if (loading.value) return
  selectedSort.value = DEFAULT_SORT
  updateQuery({ sort: null, page: null })
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
    active: 'Active',
    unactive: 'Inactive',
    draft: 'Draft'
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
        <h3>Checking session...</h3>
      </div>

      <div v-else-if="currentUser" class="my-products-shell">
        <header class="my-products-page-heading">
          <h1>Manage products</h1>
          <RouterLink :to="{ name: 'my-shop' }">My shop</RouterLink>
        </header>

        <p
          v-if="route.query.created === '1'"
          class="account-notice account-notice--success my-products-created-notice"
          role="status"
        >
          Product published and added to your list.
        </p>

        <p
          v-else-if="route.query.updated === '1'"
          class="account-notice account-notice--success my-products-created-notice"
          role="status"
        >
          Product changes saved.
        </p>

        <p
          v-if="operationNotice"
          class="account-notice my-products-operation-notice"
          :class="`account-notice--${operationNotice.type}`"
          role="status"
        >
          {{ operationNotice.message }}
        </p>

        <section class="my-products-toolbar" aria-label="Product filters">
          <form class="my-products-filterbar" @submit.prevent="submitSearch">
            <div
              class="my-products-control my-products-search"
              @focusout="handleSearchFocusOut"
            >
              <label for="my-products-search">Search by product name</label>
              <div class="my-products-search__field">
                <input
                  id="my-products-search"
                  v-model="draftSearch"
                  autocomplete="off"
                  placeholder="Example: running shoes"
                  type="search"
                  :aria-expanded="visibleSuggestions"
                  :aria-activedescendant="activeSuggestionIndex >= 0
                    ? `category-suggestion-${categorySuggestions[activeSuggestionIndex]?.id}`
                    : undefined"
                  aria-controls="category-suggestions"
                  @focus="suggestionsOpen = Boolean(draftSearch.trim())"
                  @input="updateSearchSuggestions"
                  @keydown="handleSearchKeydown"
                />
                <button
                  class="my-products-search__submit"
                  type="submit"
                  :disabled="loading"
                  :aria-label="loading ? 'Searching' : 'Search products'"
                >
                  <span class="my-products-search__icon" aria-hidden="true"></span>
                </button>
              </div>

              <ul
                v-if="visibleSuggestions"
                id="category-suggestions"
                class="category-suggestions"
                role="listbox"
                aria-label="Category filter suggestions"
              >
                <li class="category-suggestions__label">
                  Matching categories · select to filter
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
                    <small>Apply filter</small>
                  </button>
                </li>
              </ul>
            </div>

            <div class="my-products-filter-menu-wrap">
              <button
                ref="filterMenuButton"
                class="my-products-filter-trigger"
                type="button"
                :disabled="loading"
                :aria-expanded="filterMenuOpen"
                aria-controls="my-products-filter-menu"
                @click="toggleFilterMenu"
              >
                <span>Sort &amp; filter</span>
                <strong v-if="appliedMenuFilterCount">{{ appliedMenuFilterCount }}</strong>
                <i aria-hidden="true"></i>
              </button>

              <div
                v-if="filterMenuOpen"
                id="my-products-filter-menu"
                ref="filterMenu"
                class="my-products-filter-menu"
                @keydown="handleFilterMenuKeydown"
              >
                <section class="my-products-filter-section">
                  <button
                    type="button"
                    :aria-expanded="activeFilterSection === 'category'"
                    @click="toggleFilterSection('category')"
                  >
                    <span><b>Category</b><small>{{ selectedCategory?.name || 'All categories' }}</small></span>
                    <i aria-hidden="true"></i>
                  </button>
                  <div v-if="activeFilterSection === 'category'" class="my-products-filter-options">
                    <button
                      type="button"
                      :class="{ active: !selectedCategoryId }"
                      @click="applyCategoryFilter('')"
                    >All categories</button>
                    <button
                      v-for="category in categories"
                      :key="category.id"
                      type="button"
                      :class="{ active: selectedCategoryId === String(category.id) }"
                      @click="applyCategoryFilter(category.id)"
                    >{{ category.name }}</button>
                  </div>
                </section>

                <section class="my-products-filter-section">
                  <button
                    type="button"
                    :aria-expanded="activeFilterSection === 'status'"
                    @click="toggleFilterSection('status')"
                  >
                    <span><b>Status</b><small>{{ selectedStatusLabel || 'All statuses' }}</small></span>
                    <i aria-hidden="true"></i>
                  </button>
                  <div v-if="activeFilterSection === 'status'" class="my-products-filter-options">
                    <button type="button" :class="{ active: !selectedStatus }" @click="applyStatusFilter('')">All statuses</button>
                    <button type="button" :class="{ active: selectedStatus === 'active' }" @click="applyStatusFilter('active')">Active</button>
                    <button type="button" :class="{ active: selectedStatus === 'unactive' }" @click="applyStatusFilter('unactive')">Inactive</button>
                    <button type="button" :class="{ active: selectedStatus === 'draft' }" @click="applyStatusFilter('draft')">Draft</button>
                  </div>
                </section>

                <button class="my-products-filter-price" type="button" @click="openPriceDialog">
                  <span>
                    <b>Price range</b>
                    <small v-if="routeState.minPrice || routeState.maxPrice">
                      {{ routeState.minPrice || '0' }} – {{ routeState.maxPrice || 'No limit' }} ₫
                    </small>
                    <small v-else>Choose price range</small>
                  </span>
                  <i aria-hidden="true"></i>
                </button>

                <section class="my-products-filter-section">
                  <button
                    type="button"
                    :aria-expanded="activeFilterSection === 'sort'"
                    @click="toggleFilterSection('sort')"
                  >
                    <span><b>Display order</b><small>{{ selectedSortLabel }}</small></span>
                    <i aria-hidden="true"></i>
                  </button>
                  <div v-if="activeFilterSection === 'sort'" class="my-products-filter-options">
                    <button type="button" :class="{ active: selectedSort === 'name_asc' }" @click="applySortOption('name_asc')">Name: A → Z</button>
                    <button type="button" :class="{ active: selectedSort === 'name_desc' }" @click="applySortOption('name_desc')">Name: Z → A</button>
                    <button type="button" :class="{ active: selectedSort === 'price_asc' }" @click="applySortOption('price_asc')">Price: low → high</button>
                    <button type="button" :class="{ active: selectedSort === 'price_desc' }" @click="applySortOption('price_desc')">Price: high → low</button>
                    <button type="button" :class="{ active: selectedSort === 'category_asc' }" @click="applySortOption('category_asc')">Group by category</button>
                  </div>
                </section>

                <button
                  v-if="appliedMenuFilterCount"
                  class="my-products-filter-reset"
                  type="button"
                  @click="clearFilters"
                >Reset filters</button>
              </div>
            </div>
          </form>

          <div
            v-if="hasActiveFilters"
            class="my-products-filter-chips"
            aria-label="Active filters"
          >
            <span class="my-products-filter-chips__label">Active filters</span>
            <button
              v-if="appliedSearch"
              type="button"
              :disabled="loading"
              @click="clearAppliedSearch"
            >
              Search term: “{{ appliedSearch }}”
              <span aria-hidden="true">×</span>
              <span class="sr-only">Remove search term</span>
            </button>
            <button
              v-if="selectedCategory"
              type="button"
              :disabled="loading"
              @click="clearCategoryFilter"
            >
              {{ selectedCategory.name }}
              <span aria-hidden="true">×</span>
              <span class="sr-only">Remove category filter</span>
            </button>
            <button
              v-if="routeState.status"
              type="button"
              :disabled="loading"
              @click="clearStatusFilter"
            >
              {{ selectedStatusLabel }}
              <span aria-hidden="true">×</span>
              <span class="sr-only">Remove status filter</span>
            </button>
            <button
              v-if="routeState.minPrice || routeState.maxPrice"
              type="button"
              :disabled="loading"
              @click="clearPriceFilter"
            >
              Price: {{ routeState.minPrice || '0' }} – {{ routeState.maxPrice || '∞' }} ₫
              <span aria-hidden="true">×</span>
              <span class="sr-only">Remove price filter</span>
            </button>
            <button
              v-if="routeState.sort !== DEFAULT_SORT"
              type="button"
              :disabled="loading"
              @click="clearSort"
            >
              {{ selectedSortLabel }}
              <span aria-hidden="true">×</span>
              <span class="sr-only">Reset product sort order</span>
            </button>
            <button
              class="my-products-filter-chips__clear"
              type="button"
              :disabled="loading"
              @click="clearFilters"
            >Clear all</button>
          </div>

          <div
            v-if="categoriesError"
            class="my-products-category-error"
            role="alert"
          >
            <span>{{ categoriesError }}</span>
            <button type="button" @click="loadCategories(true)">Try again</button>
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
              <h2 id="product-results-title" aria-live="polite">
                {{ productCountLabel }}
              </h2>
            </div>
            <div class="my-products-results__header-actions">
              <div class="my-products-results__meta">
                <p v-if="appliedSearch">
                  Results for “{{ appliedSearch }}”
                </p>
                <span v-if="isRefreshing" class="my-products-refresh-badge" role="status">
                  <i aria-hidden="true"></i>
                  Updating
                </span>
              </div>
              <div class="my-products-quick-actions" aria-label="Product actions">
                <RouterLink
                  class="account-button account-button--primary my-products-add"
                  :to="{ name: 'product-create' }"
                >
                  <span class="seller-card__plus" aria-hidden="true"></span>
                  Add product
                </RouterLink>
                <RouterLink
                  class="account-button account-button--quiet my-products-trash-link"
                  :to="{ name: 'product-trash' }"
                >
                  Trash
                </RouterLink>
              </div>
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
                  ? 'Deselect this page'
                  : 'Select all on this page' }}
              </span>
            </label>

            <Transition name="selection-pop">
              <div v-if="selectedCount" class="my-products-selection-actions">
                <strong aria-live="polite">Selected {{ selectedCount }} products</strong>
                <button
                  type="button"
                  :disabled="deleting || updatingStatus"
                  @click="clearSelection"
                >
                  Deselect
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
                    Actions <span aria-hidden="true">▾</span>
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
                          <strong>Update status</strong>
                          <small>Apply to all selected products</small>
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
                          <strong>Move to trash</strong>
                          <small>Can be restored later</small>
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
              Try again
            </button>
          </div>

          <div v-if="isInitialLoading" class="my-products-loading" role="status">
            <span>Loading products...</span>
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
              <h3>Could not load product list</h3>
              <p>{{ error }}</p>
            </div>
            <button
              v-if="error.includes('hết hạn')"
              class="account-button account-button--primary"
              type="button"
              @click="emit('open-auth')"
            >
              Sign in again
            </button>
            <button
              v-else
              class="account-button account-button--quiet"
              type="button"
              :disabled="loading"
              @click="loadProducts()"
            >
              Try again
            </button>
          </div>

          <div
            v-else-if="!items.length && !hasActiveFilters"
            class="my-products-state"
          >
            <div class="seller-card__icon" aria-hidden="true"></div>
            <div>
              <h3>You have not published any products</h3>
              <p>Create your first product to start selling.</p>
            </div>
            <RouterLink
              class="account-button account-button--primary"
              :to="{ name: 'product-create' }"
            >
              Add product
            </RouterLink>
          </div>

          <div v-else-if="!items.length" class="my-products-state">
            <div class="my-products-state__mark" aria-hidden="true">0</div>
            <div>
              <h3>No matching products found</h3>
              <p>Clear the search term or filters to see all products.</p>
            </div>
            <button
              class="account-button account-button--quiet"
              type="button"
              :disabled="loading"
              @click="clearFilters"
            >
              Show all
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
                  <span class="sr-only">Select {{ row.product.title }}</span>
                </label>

                <div class="my-product-card__media">
                  <img
                    v-if="productImageUrl(row.product) && !hasFailedImage(row.product.id)"
                    :src="productImageUrl(row.product)"
                    :alt="`Image of ${row.product.title}`"
                    @error="markImageFailed(row.product.id)"
                  />
                  <div v-else class="my-product-card__fallback" aria-hidden="true">
                    SB
                  </div>
                </div>

                <div class="my-product-card__identity">
                  <span>{{ row.groupName }}</span>
                  <h3>{{ row.product.title }}</h3>
                  <small>Product ID #{{ row.product.id }}</small>
                </div>

                <div class="my-product-card__metric my-product-card__price">
                  <small>Displayed price</small>
                  <strong>{{ formatPrice(row.product) }}</strong>
                </div>

                <div class="my-product-card__metric my-product-card__stock">
                  <small>Stock</small>
                  <strong :class="`stock-${stockTone(row.product.stock)}`">
                    {{ row.product.stock }}
                  </strong>
                  <small v-if="row.product.updated_at" class="my-product-card__updated">
                    Updated {{ formatUpdatedAt(row.product.updated_at) }}
                  </small>
                </div>

                <div class="my-product-card__status">
                  <span :class="`status-${row.product.status}`">
                    {{ statusLabel(row.product.status) }}
                  </span>
                </div>

                <div class="my-product-card__actions">
                  <RouterLink
                    :to="{ name: 'product-edit', params: { id: row.product.id } }"
                    :aria-label="`Edit ${row.product.title}`"
                  >
                    Edit
                  </RouterLink>
                  <button
                    type="button"
                    :disabled="deleting"
                    :aria-label="`Delete ${row.product.title}`"
                    @click="openDeleteDialog([row.product], $event)"
                  >
                    Delete
                  </button>
                </div>
              </article>
            </template>
          </div>

          <nav
            v-if="items.length && pageTokens.length"
            class="my-products-pagination"
            aria-label="Products pagination"
          >
            <button
              type="button"
              aria-label="Previous page"
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
        <h3>Sign in to manage products</h3>
        <p>
          Sign in to view products for this account.
        </p>
        <button type="button" @click="emit('open-auth')">
          Sign in / Sign up
        </button>
      </div>
    </section>

    <Transition name="modal-fade">
      <div
        v-if="priceDialogOpen"
        class="my-products-price-modal"
        role="presentation"
        @mousedown.self="closePriceDialog"
      >
        <form
          ref="priceDialogPanel"
          class="my-products-price-modal__panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="price-filter-title"
          @submit.prevent="applyPriceRange"
          @keydown.esc.stop.prevent="closePriceDialog"
          @keydown.tab="trapPriceDialogFocus"
        >
          <header>
            <div>
              <h2 id="price-filter-title">Choose price range</h2>
            </div>
            <button
              ref="priceDialogCloseButton"
              type="button"
              aria-label="Close price filter dialog"
              @click="closePriceDialog"
            >×</button>
          </header>

          <div class="my-products-price-modal__fields">
            <label>
              <span>Price from</span>
              <input v-model="minPrice" min="0" inputmode="numeric" placeholder="0" type="number" />
            </label>
            <label>
              <span>Price to</span>
              <input v-model="maxPrice" min="0" inputmode="numeric" placeholder="No limit" type="number" />
            </label>
          </div>

          <p v-if="priceRangeError" class="my-products-price-modal__error" role="alert">
            Minimum price cannot exceed maximum price.
          </p>

          <footer>
            <button type="button" @click="closePriceDialog">Cancel</button>
            <button type="submit" :disabled="loading || priceRangeError">
              {{ loading ? 'Filtering...' : 'Apply price' }}
            </button>
          </footer>
        </form>
      </div>
    </Transition>

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
        <p class="account-card__eyebrow">Confirm action</p>
        <h2 id="delete-product-title">
          {{ deleteDialog.mode === 'single'
            ? 'Move product to trash?'
            : `Delete ${deleteDialog.products.length} selected products?` }}
        </h2>
        <p id="delete-product-description">
          {{ deleteDialog.mode === 'single'
            ? `“${deleteDialog.products[0].title}” will no longer appear in your selling list or marketplace.`
            : 'These products will no longer appear in your selling list or marketplace.' }}
          You can restore them from the trash.
        </p>

        <ul v-if="deleteDialog.mode === 'bulk'" class="product-delete-modal__list">
          <li
            v-for="product in deleteDialog.products.slice(0, 5)"
            :key="product.id"
          >
            {{ product.title }}
          </li>
          <li v-if="deleteDialog.products.length > 5">
            And {{ deleteDialog.products.length - 5 }} other products
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
            Cancel
          </button>
          <button
            ref="confirmDeleteButton"
            class="product-delete-modal__confirm"
            type="button"
            :disabled="deleting"
            @click="confirmDelete"
          >
            {{ deleting
              ? 'Processing...'
              : deleteDialog.mode === 'single'
                ? 'Move to trash'
                : `Delete ${deleteDialog.products.length} products` }}
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
              <h2 id="status-modal-title">Update product status</h2>
            </div>
            <button
              ref="statusDialogCloseButton"
              class="product-status-modal__close"
              type="button"
              aria-label="Close status dialog"
              :disabled="updatingStatus"
              @click="closeStatusDialog"
            >×</button>
          </header>

          <p id="status-modal-description" class="product-status-modal__description">
            The new status will be applied to
            <strong>{{ statusDialog.products.length }} selected products</strong>.
          </p>

          <fieldset
            class="product-status-options"
            :aria-describedby="statusUpdateError ? 'status-update-error' : undefined"
          >
            <legend>New status</legend>
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
            <span>Apply to</span>
            <ul>
              <li
                v-for="product in statusDialog.products.slice(0, 5)"
                :key="product.id"
              >{{ product.title }}</li>
              <li v-if="statusDialog.products.length > 5">
                And {{ statusDialog.products.length - 5 }} other products
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
              Cancel
            </button>
            <button
              class="product-status-modal__save"
              type="button"
              :disabled="!pendingStatus || updatingStatus"
              @click="confirmStatusUpdate"
            >
              <span v-if="updatingStatus" class="seller-button-spinner" aria-hidden="true"></span>
              {{ updatingStatus ? 'Saving...' : 'Save changes' }}
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </main>
</template>
