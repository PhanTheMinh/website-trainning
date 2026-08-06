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
      <div
        class="product-visual"
        :class="{ 'has-image': product.imageUrl }"
        :style="{ '--accent': product.color }"
      >
        <img
          v-if="product.imageUrl"
          :src="product.imageUrl"
          :alt="product.name"
        />
        <span>{{ product.tag }}</span>
      </div>
      <div class="product-info">
        <p>{{ product.category }}</p>
        <h3>
          <RouterLink
            v-if="product.detailRoute"
            :to="product.detailRoute"
          >
            {{ product.name }}
          </RouterLink>
          <template v-else>{{ product.name }}</template>
        </h3>
        <strong>{{ formatCurrency(product.price) }}</strong>
      </div>
      <button
        type="button"
        :disabled="product.stock === 0"
        @click="emit('add-to-cart', product)"
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
