<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { formatCurrency } from '../data/catalog.js'
import { getProduct } from '../services/productService.js'

const props = defineProps({
  cartItems: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits([
  'clear-cart',
  'remove-from-cart',
  'remove-unavailable'
])
const availabilityNotice = ref('')

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

async function reconcileCartAvailability() {
  const unavailableKeys = []

  await Promise.all(groupedItems.value.map(async (item) => {
    try {
      const response = await getProduct(
        item.product.product_id || item.product.id
      )
      const variant = response.data.variants.find(
        (candidate) => Number(candidate.id) === Number(item.product.variant_id)
      )

      if (!variant || variant.stock_quantity < item.quantity) {
        unavailableKeys.push(item.key)
      }
    } catch {
      unavailableKeys.push(item.key)
    }
  }))

  if (unavailableKeys.length) {
    availabilityNotice.value = `${unavailableKeys.length} sản phẩm đã được bỏ khỏi giỏ vì đã ngưng bán hoặc không còn đủ hàng.`
    emit('remove-unavailable', unavailableKeys)
  }
}

onMounted(reconcileCartAvailability)
</script>

<template>
  <main class="cart-page">
    <section class="section">
      <div class="section-heading">
        <p class="eyebrow">Giỏ hàng</p>
        <h1>Sản phẩm đã chọn</h1>
        <p>Kiểm tra các sản phẩm trong giỏ. Chức năng thanh toán chưa được bật.</p>
      </div>

      <p
        v-if="availabilityNotice"
        class="account-notice account-notice--warning"
        role="status"
      >{{ availabilityNotice }}</p>

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
              <p v-if="item.product.option_values?.length" class="cart-line-options">
                {{ item.product.option_values.map((option) => `${option.option_name}: ${option.value}`).join(' · ') }}
              </p>
              <small>SKU: {{ item.product.sku }}</small>
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
