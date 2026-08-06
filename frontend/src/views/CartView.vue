<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { formatCurrency } from '../data/catalog.js'

const props = defineProps({
  cartItems: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['clear-cart', 'remove-from-cart'])

const groupedItems = computed(() => {
  const grouped = new Map()

  props.cartItems.forEach((product) => {
    const productKey = product.catalogKey || product.id
    const current = grouped.get(productKey)

    if (current) {
      current.quantity += 1
      return
    }

    grouped.set(productKey, {
      key: productKey,
      product,
      quantity: 1
    })
  })

  return Array.from(grouped.values())
})

const cartTotal = computed(() =>
  props.cartItems.reduce((total, product) => total + product.price, 0)
)
</script>

<template>
  <main class="cart-page">
    <section class="section">
      <div class="section-heading">
        <p class="eyebrow">Giỏ hàng</p>
        <h1>Sản phẩm đã chọn</h1>
        <p>Kiểm tra các sản phẩm trong giỏ. Chức năng thanh toán chưa được bật.</p>
      </div>

      <div v-if="groupedItems.length" class="cart-page-layout">
        <div class="cart-list">
          <article
            v-for="item in groupedItems"
            :key="item.key"
            class="cart-line"
          >
            <div
              class="cart-line-visual"
              :style="{ '--accent': item.product.color }"
            >
              {{ item.product.tag }}
            </div>
            <div>
              <p>{{ item.product.category }}</p>
              <h2>{{ item.product.name }}</h2>
              <strong>{{ formatCurrency(item.product.price) }}</strong>
            </div>
            <div class="cart-line-actions">
              <span>Số lượng: {{ item.quantity }}</span>
              <button
                type="button"
                @click="emit('remove-from-cart', item.key)"
              >
                Bỏ một sản phẩm
              </button>
            </div>
          </article>
        </div>

        <aside class="cart-page-summary">
          <p class="eyebrow">Tạm tính</p>
          <h2>{{ cartItems.length }} sản phẩm</h2>
          <strong>{{ formatCurrency(cartTotal) }}</strong>
          <button type="button" @click="emit('clear-cart')">
            Xóa giỏ hàng
          </button>
          <RouterLink to="/products">Tiếp tục mua sắm</RouterLink>
        </aside>
      </div>

      <div v-else class="catalog-empty">
        <h3>Giỏ hàng đang trống</h3>
        <p>Hãy chọn sản phẩm trước khi quay lại đây.</p>
        <RouterLink to="/products">Xem sản phẩm</RouterLink>
      </div>
    </section>
  </main>
</template>
