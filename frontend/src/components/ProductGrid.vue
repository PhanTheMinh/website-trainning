<script setup>
import { RouterLink } from 'vue-router'
import { formatCurrency } from '../data/catalog.js'

defineProps({
  products: {
    type: Array,
    default: () => []
  },
  emptyTitle: {
    type: String,
    default: 'Không tìm thấy sản phẩm'
  },
  emptyMessage: {
    type: String,
    default: 'Thử thay đổi từ khóa tìm kiếm hoặc chọn danh mục khác.'
  }
})

const emit = defineEmits(['add-to-cart'])
</script>

<template>
  <div v-if="products.length" class="product-grid">
    <article
      v-for="product in products"
      :key="product.catalogKey || product.id"
      class="product-card"
    >
      <component
        :is="product.detailRoute ? RouterLink : 'div'"
        class="product-visual"
        :class="{ 'has-image': product.imageUrl }"
        :style="{ '--accent': product.color }"
        :to="product.detailRoute || undefined"
        :aria-label="product.detailRoute ? `Xem ${product.name}` : undefined"
      >
        <img
          v-if="product.imageUrl"
          :src="product.imageUrl"
          :alt="product.name"
        />
        <span>{{ product.tag }}</span>
        <small v-if="product.detailRoute" class="product-hover-cue">Xem sản phẩm <b>→</b></small>
      </component>
      <div class="product-info">
        <p>
          {{ product.brand ? `${product.brand} · ${product.category}` : product.category }}
        </p>
        <h3>
          <RouterLink
            v-if="product.detailRoute"
            :to="product.detailRoute"
          >
            {{ product.name }}
          </RouterLink>
          <template v-else>{{ product.name }}</template>
        </h3>
        <strong>
          {{ formatCurrency(product.price) }}
          <template v-if="product.maxPrice > product.price">
            – {{ formatCurrency(product.maxPrice) }}
          </template>
        </strong>
      </div>
      <RouterLink
        v-if="product.requiresSelection"
        class="product-card-option-link"
        :to="product.detailRoute"
      >
        Chọn tùy chọn
      </RouterLink>
      <button
        v-else
        type="button"
        :disabled="product.stock === 0"
        @click="emit('add-to-cart', product.cartItem)"
      >
        {{ product.stock === 0 ? 'Đã hết hàng' : 'Thêm vào giỏ' }}
      </button>
    </article>
  </div>

  <div v-else class="catalog-empty">
    <h3>{{ emptyTitle }}</h3>
    <p>{{ emptyMessage }}</p>
  </div>
</template>
