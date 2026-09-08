<script setup>
import { computed } from 'vue'

const props = defineProps({
  pagination: {
    type: Object,
    required: true
  },
  disabled: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['change'])

const pageTokens = computed(() => {
  const current = Number(props.pagination.currentPage || 1)
  const total = Number(props.pagination.totalPages || 0)
  if (total <= 1) return []
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1)

  const pages = new Set([1, total, current - 1, current, current + 1])
  if (current <= 4) [2, 3, 4, 5].forEach((page) => pages.add(page))
  if (current >= total - 3) {
    ;[total - 4, total - 3, total - 2, total - 1].forEach((page) => pages.add(page))
  }

  const sorted = [...pages].filter((page) => page > 0 && page <= total).sort((a, b) => a - b)
  const tokens = []
  sorted.forEach((page, index) => {
    if (index && page - sorted[index - 1] > 1) tokens.push(`gap-${page}`)
    tokens.push(page)
  })
  return tokens
})

function changePage(page) {
  if (
    props.disabled ||
    page < 1 ||
    page > props.pagination.totalPages ||
    page === props.pagination.currentPage
  ) return
  emit('change', page)
}
</script>

<template>
  <nav
    v-if="pagination.totalPages > 1"
    class="catalog-pagination"
    :aria-label="`Phân trang, ${pagination.totalItems} sản phẩm`"
  >
    <p>
      Trang <strong>{{ pagination.currentPage }}</strong>/{{ pagination.totalPages }}
      <span>· {{ pagination.totalItems }} sản phẩm</span>
    </p>
    <div>
      <button
        type="button"
        aria-label="Trang trước"
        :disabled="disabled || !pagination.hasPreviousPage"
        @click="changePage(pagination.currentPage - 1)"
      >
        ←
      </button>
      <template v-for="token in pageTokens" :key="token">
        <span v-if="typeof token === 'string'" aria-hidden="true">…</span>
        <button
          v-else
          type="button"
          :class="{ 'is-active': token === pagination.currentPage }"
          :aria-current="token === pagination.currentPage ? 'page' : undefined"
          :aria-label="`Trang ${token}`"
          :disabled="disabled"
          @click="changePage(token)"
        >
          {{ token }}
        </button>
      </template>
      <button
        type="button"
        aria-label="Trang sau"
        :disabled="disabled || !pagination.hasNextPage"
        @click="changePage(pagination.currentPage + 1)"
      >
        →
      </button>
    </div>
  </nav>
</template>
