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
  },
  itemLabel: {
    type: String,
    default: 'products'
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
    class="rs-pagination"
    :aria-label="`Pagination, ${pagination.totalItems} ${itemLabel}`"
  >
    <p>
      Page <strong>{{ pagination.currentPage }}</strong> of {{ pagination.totalPages }}
      <span>· {{ pagination.totalItems }} {{ itemLabel }}</span>
    </p>
    <div>
      <button
        type="button"
        aria-label="Previous page"
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
          :aria-label="`Page ${token}`"
          :disabled="disabled"
          @click="changePage(token)"
        >
          {{ token }}
        </button>
      </template>
      <button
        type="button"
        aria-label="Next page"
        :disabled="disabled || !pagination.hasNextPage"
        @click="changePage(pagination.currentPage + 1)"
      >
        →
      </button>
    </div>
  </nav>
</template>

<style scoped>
.rs-pagination { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 16px; border-top: 1px solid var(--rs-border); margin-top: 32px; padding-top: 24px; }
.rs-pagination p { font-size: 13px; color: var(--rs-muted); margin: 0; }
.rs-pagination p span { margin-left: 8px; }
.rs-pagination > div { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; }
.rs-pagination button { background: transparent; color: var(--rs-text); border: 1px solid transparent; border-radius: 6px; min-width: 44px; min-height: 44px; font-size: 14px; padding: 6px; }
.rs-pagination button:hover:not(:disabled) { border-color: var(--rs-border); }
.rs-pagination button.is-active { background: var(--rs-primary); color: var(--rs-on-primary); }
@media (max-width: 640px) { .rs-pagination { justify-content: center; } .rs-pagination p { width: 100%; text-align: center; } .rs-pagination p span { display: none; } .rs-pagination button { min-width: 36px; } }
</style>
