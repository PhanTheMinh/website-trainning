<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { formatCurrency } from '../data/catalog.js'
import { API_BASE_URL } from '../services/apiClient.js'
import { validatePurchase } from '../services/productService.js'
import { isDefinitivePurchaseFailure } from '../utils/purchaseAvailability.js'
import { getPurchaseFailureMessage } from '../utils/storefrontErrors.js'

const props = defineProps({
  cartItems: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits([
  'clear-cart',
  'add-to-cart',
  'remove-from-cart',
  'remove-unavailable'
])
const availabilityNotice = ref('')
const reconcilingAvailability = ref(false)
const checkingCheckout = ref(false)
const checkoutNotice = ref('')
const checkoutValidated = ref(false)
let availabilityTimer

function absoluteImageUrl(imageUrl) {
  if (!imageUrl) return ''

  try {
    return new URL(imageUrl, API_BASE_URL).toString()
  } catch {
    return ''
  }
}

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

const shopGroups = computed(() => {
  const groups = new Map()

  groupedItems.value.forEach((item) => {
    const shop = item.product.shop || null
    const key = shop?.id ? `shop-${shop.id}` : 'shop-unknown'
    const current = groups.get(key) || {
      key,
      shop,
      items: [],
      quantity: 0,
      subtotal: 0
    }

    current.items.push(item)
    current.quantity += item.quantity
    current.subtotal += item.product.price * item.quantity
    groups.set(key, current)
  })

  return Array.from(groups.values())
})

const cartTotal = computed(() =>
  props.cartItems.reduce((total, product) => total + product.price, 0)
)

async function reconcileCartAvailability() {
  if (reconcilingAvailability.value || !groupedItems.value.length) return

  reconcilingAvailability.value = true
  availabilityNotice.value = ''
  const unavailableKeys = []
  let uncheckedCount = 0

  try {
    const batches = []

    for (let index = 0; index < groupedItems.value.length; index += 50) {
      batches.push(groupedItems.value.slice(index, index + 50))
    }

    await Promise.all(batches.map(async (batch) => {
      try {
        await validatePurchase(batch.map((item) => ({
          product_id: item.product.product_id || item.product.id,
          variant_id: item.product.variant_id,
          quantity: item.quantity
        })))
      } catch (error) {
        if (!isDefinitivePurchaseFailure(error)) {
          uncheckedCount += batch.length
          return
        }

        await Promise.all(batch.map(async (item) => {
          try {
            await validatePurchase([{
              product_id: item.product.product_id || item.product.id,
              variant_id: item.product.variant_id,
              quantity: item.quantity
            }])
          } catch (itemError) {
            if (isDefinitivePurchaseFailure(itemError)) {
              unavailableKeys.push(item.key)
            } else {
              uncheckedCount += 1
            }
          }
        }))
      }
    }))

    const notices = []

    if (unavailableKeys.length) {
      notices.push(`Đã xóa ${unavailableKeys.length} sản phẩm không còn khả dụng.`)
      emit('remove-unavailable', unavailableKeys)
    }

    if (uncheckedCount) {
      notices.push(`${uncheckedCount} sản phẩm chưa kiểm tra được và vẫn được giữ lại.`)
    }

    availabilityNotice.value = notices.join(' ')
  } finally {
    reconcilingAvailability.value = false
  }
}

async function validateForCheckout() {
  if (checkingCheckout.value || !groupedItems.value.length) return

  checkingCheckout.value = true
  checkoutNotice.value = ''
  checkoutValidated.value = false

  try {
    await validatePurchase(groupedItems.value.map((item) => ({
      product_id: item.product.product_id || item.product.id,
      variant_id: item.product.variant_id,
      quantity: item.quantity
    })))
    checkoutNotice.value = 'Giỏ hàng hợp lệ.'
    checkoutValidated.value = true
  } catch (error) {
    if (isDefinitivePurchaseFailure(error)) {
      checkoutNotice.value = getPurchaseFailureMessage(
        error,
        'Một số sản phẩm không còn khả dụng.'
      )
      await reconcileCartAvailability()
    } else {
      checkoutNotice.value = 'Chưa thể kiểm tra giỏ hàng. Sản phẩm vẫn được giữ lại.'
    }
  } finally {
    checkingCheckout.value = false
  }
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') reconcileCartAvailability()
}

onMounted(() => {
  reconcileCartAvailability()
  window.addEventListener('focus', reconcileCartAvailability)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  availabilityTimer = window.setInterval(reconcileCartAvailability, 30000)
})

onBeforeUnmount(() => {
  window.removeEventListener('focus', reconcileCartAvailability)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  window.clearInterval(availabilityTimer)
})
</script>

<template>
  <main class="cart-page">
    <section class="section">
      <div class="section-heading">
        <h1>Giỏ hàng</h1>
      </div>

      <p
        v-if="availabilityNotice"
        class="account-notice account-notice--warning"
        role="status"
      >{{ availabilityNotice }}</p>

      <p
        v-if="checkoutNotice"
        class="account-notice"
        :class="checkoutValidated ? 'account-notice--success' : 'account-notice--warning'"
        role="status"
      >{{ checkoutNotice }}</p>

      <div v-if="groupedItems.length" class="cart-page-layout">
        <div class="cart-list">
          <section
            v-for="group in shopGroups"
            :key="group.key"
            class="cart-shop-group"
          >
            <header class="cart-shop-group__header">
              <RouterLink
                v-if="group.shop"
                :to="{ name: 'shop', params: { identifier: group.shop.identifier } }"
              >
                <strong>{{ group.shop.name }}</strong>
                <small>Xem shop →</small>
              </RouterLink>
              <strong v-else>Người bán</strong>
              <p>{{ group.quantity }} sản phẩm · {{ formatCurrency(group.subtotal) }}</p>
            </header>

            <article
              v-for="item in group.items"
              :key="item.key"
              class="cart-line"
            >
              <RouterLink
                class="cart-line-visual"
                :to="{
                  name: 'product-detail',
                  params: { id: item.product.product_id || item.product.id }
                }"
                :style="{ '--accent': item.product.color }"
              >
                <img
                  v-if="absoluteImageUrl(item.product.image_url)"
                  :src="absoluteImageUrl(item.product.image_url)"
                  :alt="item.product.name"
                />
                <span v-else>{{ item.product.tag || item.product.category }}</span>
              </RouterLink>
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
                <div class="cart-line-stepper" :aria-label="`Số lượng ${item.product.name}`">
                  <button
                    type="button"
                    :aria-label="`Giảm số lượng ${item.product.name}`"
                    @click="emit('remove-from-cart', item.key)"
                  >−</button>
                  <span>{{ item.quantity }}</span>
                  <button
                    type="button"
                    :disabled="item.quantity >= item.product.stock_quantity"
                    :aria-label="`Tăng số lượng ${item.product.name}`"
                    @click="emit('add-to-cart', item.product)"
                  >+</button>
                </div>
                <button
                  class="cart-line-remove"
                  type="button"
                  @click="emit('remove-from-cart', item.key)"
                >
                  Xóa
                </button>
              </div>
            </article>
          </section>
        </div>

        <aside class="cart-page-summary">
          <p class="eyebrow">Tạm tính</p>
          <h2>{{ cartItems.length }} sản phẩm</h2>
          <strong>{{ formatCurrency(cartTotal) }}</strong>
          <button
            class="cart-checkout-validation"
            type="button"
            :disabled="checkingCheckout || reconcilingAvailability"
            @click="validateForCheckout"
          >
            {{ checkingCheckout ? 'Đang kiểm tra...' : 'Kiểm tra đơn hàng' }}
          </button>
          <button type="button" @click="emit('clear-cart')">
            Xóa tất cả
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
