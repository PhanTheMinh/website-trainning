<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { API_BASE_URL } from '../services/apiClient.js'
import {
  getDeletedProducts,
  permanentlyDeleteProduct,
  restoreDeletedProduct
} from '../services/productService.js'

const PAGE_SIZE = 10

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
const items = ref([])
const pagination = ref(emptyPagination())
const draftSearch = ref('')
const loading = ref(false)
const error = ref('')
const actionProductId = ref(null)
const notice = ref(null)
const permanentDialog = ref(null)
const permanentPhrase = ref('')
const permanentError = ref('')
const permanentInput = ref(null)

let requestSequence = 0
let lastSearch
let dialogTrigger

const currencyFormatter = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0
})

const dateFormatter = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'medium',
  timeStyle: 'short'
})

function emptyPagination() {
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
  const pageValue = Number(firstQueryValue(query.page))

  return {
    search,
    page: Number.isSafeInteger(pageValue) && pageValue > 0 ? pageValue : 1
  }
}

const routeState = computed(() => normalizeRouteState(route.query))
const isInitialLoading = computed(() => loading.value && !items.value.length)
const pageNumbers = computed(() => {
  const total = pagination.value.totalPages
  const current = pagination.value.currentPage

  if (total <= 1) {
    return []
  }

  return Array.from({ length: total }, (_, index) => index + 1)
    .filter((page) => total <= 7 || page === 1 || page === total || Math.abs(page - current) <= 1)
})
const canConfirmPermanentDelete = computed(() => (
  permanentPhrase.value.trim().toLocaleUpperCase('vi') === 'XÓA'
))

function updateQuery(patch) {
  const nextQuery = { ...route.query }

  Object.entries(patch).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      delete nextQuery[key]
    } else {
      nextQuery[key] = String(value)
    }
  })

  if (Number(nextQuery.page) <= 1) {
    delete nextQuery.page
  }

  return router.push({
    name: 'product-trash',
    query: nextQuery
  })
}

async function loadTrash(state = routeState.value) {
  const currentRequest = ++requestSequence

  loading.value = true
  error.value = ''

  try {
    const response = await getDeletedProducts({
      search: state.search,
      page: state.page,
      limit: PAGE_SIZE
    })

    if (currentRequest !== requestSequence) {
      return
    }

    items.value = response.data.items
    pagination.value = response.data.pagination
  } catch (requestError) {
    if (currentRequest !== requestSequence) {
      return
    }

    error.value = requestError.status === 401
      ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
      : requestError.message || 'Không thể tải Thùng rác.'
  } finally {
    if (currentRequest === requestSequence) {
      loading.value = false
    }
  }
}

function submitSearch() {
  if (loading.value || actionProductId.value) {
    return
  }

  updateQuery({
    search: draftSearch.value.trim() || null,
    page: null
  })
}

function clearSearch() {
  draftSearch.value = ''
  updateQuery({ search: null, page: null })
}

function goToPage(page) {
  if (
    loading.value ||
    actionProductId.value ||
    page < 1 ||
    page > pagination.value.totalPages ||
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

function formatPrice(product) {
  const minimum = currencyFormatter.format(product.min_price)
  return product.min_price === product.max_price
    ? minimum
    : `${minimum} – ${currencyFormatter.format(product.max_price)}`
}

function formatDeletedAt(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Không rõ' : dateFormatter.format(date)
}

function restoreScroll(top) {
  window.requestAnimationFrame(() => {
    window.scrollTo({ top, behavior: 'instant' })
  })
}

async function refreshAfterRemoval(scrollTop) {
  const remainingCount = Math.max(0, pagination.value.totalItems - 1)
  const lastPage = Math.max(1, Math.ceil(remainingCount / pagination.value.pageSize))

  if (pagination.value.currentPage > lastPage) {
    await updateQuery({ page: lastPage })
  } else {
    await loadTrash(routeState.value)
  }

  restoreScroll(scrollTop)
}

async function restoreProduct(product) {
  if (actionProductId.value) {
    return
  }

  const scrollTop = window.scrollY
  actionProductId.value = product.id
  notice.value = null

  try {
    const response = await restoreDeletedProduct(product.id)
    notice.value = {
      type: response.warning ? 'warning' : 'success',
      message: response.warning || `Đã khôi phục “${product.title}” về danh sách sản phẩm.`
    }
    await refreshAfterRemoval(scrollTop)
  } catch (requestError) {
    notice.value = {
      type: 'error',
      message: requestError.message || 'Không thể khôi phục sản phẩm.'
    }
  } finally {
    actionProductId.value = null
  }
}

async function openPermanentDialog(product, event) {
  dialogTrigger = event?.currentTarget || document.activeElement
  permanentDialog.value = product
  permanentPhrase.value = ''
  permanentError.value = ''
  await nextTick()
  permanentInput.value?.focus()
}

function closePermanentDialog() {
  if (actionProductId.value) {
    return
  }

  permanentDialog.value = null
  permanentPhrase.value = ''
  permanentError.value = ''
  nextTick(() => dialogTrigger?.focus?.())
}

function trapPermanentDialogFocus(event) {
  const panel = event.currentTarget
  const focusable = Array.from(panel.querySelectorAll(
    'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'
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

async function confirmPermanentDelete() {
  if (
    !permanentDialog.value ||
    !canConfirmPermanentDelete.value ||
    actionProductId.value
  ) {
    return
  }

  const product = permanentDialog.value
  const scrollTop = window.scrollY
  actionProductId.value = product.id
  permanentError.value = ''
  notice.value = null

  try {
    await permanentlyDeleteProduct(product.id)
    permanentDialog.value = null
    permanentPhrase.value = ''
    notice.value = {
      type: 'success',
      message: `Đã xóa vĩnh viễn “${product.title}”.`
    }
    await refreshAfterRemoval(scrollTop)
  } catch (requestError) {
    permanentError.value = requestError.message ||
      'Không thể xóa vĩnh viễn sản phẩm.'
  } finally {
    actionProductId.value = null
  }
}

watch(
  [
    () => route.fullPath,
    () => props.sessionLoading,
    () => props.currentUser
  ],
  () => {
    const state = normalizeRouteState(route.query)

    if (state.search !== lastSearch) {
      draftSearch.value = state.search
      lastSearch = state.search
    }

    if (!props.sessionLoading && props.currentUser) {
      loadTrash(state)
      return
    }

    requestSequence += 1
    items.value = []
    pagination.value = emptyPagination()
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  requestSequence += 1
})
</script>

<template>
  <main class="profile-page product-trash-page">
    <section class="section profile-section product-trash-section">
      <div v-if="sessionLoading" class="profile-empty">
        <h3>Đang kiểm tra phiên đăng nhập...</h3>
      </div>

      <div v-else-if="currentUser" class="product-trash-shell">
        <header class="product-trash-hero">
          <div>
            <RouterLink class="seller-breadcrumb" :to="{ name: 'my-products' }">
              Quản lý sản phẩm <span aria-hidden="true">/</span> Thùng rác
            </RouterLink>
            <p class="account-card__eyebrow">Kho lưu tạm</p>
            <h1>Thùng rác sản phẩm</h1>
            <p>
              Khôi phục sản phẩm để bán lại, hoặc xóa vĩnh viễn khi bạn chắc chắn
              không còn cần dữ liệu và hình ảnh liên quan.
            </p>
          </div>
          <div class="product-trash-hero__signal">
            <strong>{{ pagination.totalItems }}</strong>
            <span>SẢN PHẨM ĐÃ XÓA</span>
          </div>
        </header>

        <p
          v-if="notice"
          class="account-notice product-trash-notice"
          :class="`account-notice--${notice.type}`"
          role="status"
        >
          {{ notice.message }}
        </p>

        <section class="product-trash-content" :aria-busy="loading">
          <div class="product-trash-tools">
            <div>
              <p class="account-card__eyebrow">Đã xóa</p>
              <h2>{{ pagination.totalItems }} sản phẩm trong Thùng rác</h2>
            </div>
            <form class="product-trash-search" @submit.prevent="submitSearch">
              <label class="sr-only" for="trash-search">Tìm sản phẩm đã xóa</label>
              <input
                id="trash-search"
                v-model="draftSearch"
                type="search"
                placeholder="Tìm theo tên sản phẩm"
                :disabled="loading || Boolean(actionProductId)"
              />
              <button type="submit" :disabled="loading || Boolean(actionProductId)">Tìm</button>
              <button
                v-if="routeState.search"
                class="product-trash-search__clear"
                type="button"
                :disabled="loading || Boolean(actionProductId)"
                @click="clearSearch"
              >Xóa lọc</button>
            </form>
          </div>

          <div v-if="isInitialLoading" class="product-trash-loading" role="status">
            <span>Đang tải sản phẩm đã xóa...</span>
            <i v-for="index in 4" :key="index"></i>
          </div>

          <div v-else-if="error && items.length" class="my-products-refresh-error" role="alert">
            <span>{{ error }}</span>
            <button type="button" :disabled="loading" @click="loadTrash()">Thử lại</button>
          </div>

          <div v-else-if="error && !items.length" class="my-products-state my-products-state--error">
            <div class="my-products-state__mark" aria-hidden="true">!</div>
            <div><h3>Không thể tải Thùng rác</h3><p>{{ error }}</p></div>
            <button class="account-button account-button--quiet" type="button" :disabled="loading" @click="loadTrash()">Thử lại</button>
          </div>

          <div v-else-if="!items.length" class="product-trash-empty">
            <div aria-hidden="true">✓</div>
            <h3>{{ routeState.search ? 'Không tìm thấy sản phẩm đã xóa' : 'Thùng rác đang trống' }}</h3>
            <p>
              {{ routeState.search
                ? 'Hãy thử từ khóa khác hoặc xóa bộ lọc.'
                : 'Các sản phẩm bạn xóa mềm sẽ xuất hiện tại đây.' }}
            </p>
            <button v-if="routeState.search" type="button" @click="clearSearch">Hiển thị tất cả</button>
            <RouterLink v-else :to="{ name: 'my-products' }">Về danh sách sản phẩm</RouterLink>
          </div>

          <div v-else class="product-trash-list" :class="{ 'is-updating': loading }" role="list">
            <article v-for="product in items" :key="product.id" class="product-trash-card" role="listitem">
              <div class="product-trash-card__media">
                <img v-if="productImageUrl(product)" :src="productImageUrl(product)" :alt="`Ảnh ${product.title}`" />
                <span v-else aria-hidden="true">SB</span>
              </div>
              <div class="product-trash-card__identity">
                <span>{{ product.category?.name || 'Chưa phân loại' }}</span>
                <h3>{{ product.title }}</h3>
                <small>Đã xóa lúc {{ formatDeletedAt(product.deleted_at) }}</small>
              </div>
              <div class="product-trash-card__metric">
                <small>Giá trước khi xóa</small>
                <strong>{{ formatPrice(product) }}</strong>
              </div>
              <div class="product-trash-card__actions">
                <button
                  class="product-trash-restore"
                  type="button"
                  :disabled="Boolean(actionProductId)"
                  @click="restoreProduct(product)"
                >
                  {{ actionProductId === product.id ? 'Đang xử lý...' : 'Khôi phục' }}
                </button>
                <button
                  class="product-trash-permanent"
                  type="button"
                  :disabled="Boolean(actionProductId)"
                  @click="openPermanentDialog(product, $event)"
                >Xóa vĩnh viễn</button>
              </div>
            </article>
          </div>

          <nav v-if="items.length && pagination.totalPages > 1" class="my-products-pagination" aria-label="Phân trang Thùng rác">
            <button type="button" aria-label="Trang trước" :disabled="loading || !pagination.hasPreviousPage" @click="goToPage(pagination.currentPage - 1)">←</button>
            <button
              v-for="page in pageNumbers"
              :key="page"
              type="button"
              :class="{ active: page === pagination.currentPage }"
              :aria-current="page === pagination.currentPage ? 'page' : undefined"
              :disabled="loading"
              @click="goToPage(page)"
            >{{ page }}</button>
            <button type="button" aria-label="Trang sau" :disabled="loading || !pagination.hasNextPage" @click="goToPage(pagination.currentPage + 1)">→</button>
          </nav>

          <div v-if="loading && items.length" class="my-products-loading-line" aria-hidden="true"></div>
        </section>
      </div>

      <div v-else class="profile-empty">
        <h3>Đăng nhập để mở Thùng rác</h3>
        <button type="button" @click="emit('open-auth')">Đăng nhập / Đăng ký</button>
      </div>
    </section>

    <Transition name="modal-fade">
      <div v-if="permanentDialog" class="product-delete-modal" role="presentation" @mousedown.self="closePermanentDialog">
      <form
        class="product-delete-modal__panel product-permanent-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="permanent-delete-title"
        @submit.prevent="confirmPermanentDelete"
        @keydown.esc="closePermanentDialog"
        @keydown.tab="trapPermanentDialogFocus"
      >
        <div class="product-delete-modal__icon" aria-hidden="true">!</div>
        <p class="account-card__eyebrow">Không thể hoàn tác</p>
        <h2 id="permanent-delete-title">Xóa vĩnh viễn sản phẩm?</h2>
        <p>
          “{{ permanentDialog.title }}” cùng ảnh và dữ liệu phiên bản liên quan
          sẽ bị xóa khỏi hệ thống. Thao tác này không thể khôi phục.
        </p>
        <label for="permanent-delete-phrase">
          Nhập <strong>XÓA</strong> để xác nhận
        </label>
        <input
          id="permanent-delete-phrase"
          ref="permanentInput"
          v-model="permanentPhrase"
          autocomplete="off"
          :disabled="Boolean(actionProductId)"
        />
        <p v-if="permanentError" class="product-delete-modal__error" role="alert">{{ permanentError }}</p>
        <div class="product-delete-modal__actions">
          <button type="button" :disabled="Boolean(actionProductId)" @click="closePermanentDialog">Hủy</button>
          <button class="product-delete-modal__confirm" type="submit" :disabled="!canConfirmPermanentDelete || Boolean(actionProductId)">
            {{ actionProductId ? 'Đang xóa...' : 'Xóa vĩnh viễn' }}
          </button>
        </div>
        </form>
      </div>
    </Transition>
  </main>
</template>
