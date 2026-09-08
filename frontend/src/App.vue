<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterView } from 'vue-router'
import AuthPanel from './components/AuthPanel.vue'
import SiteHeader from './components/SiteHeader.vue'
import SiteFooter from './components/SiteFooter.vue'
import { categories } from './data/catalog.js'
import { getProfile } from './services/authService.js'
import { validatePurchase } from './services/productService.js'
import { isDefinitivePurchaseFailure } from './utils/purchaseAvailability.js'
import { getPurchaseFailureMessage } from './utils/storefrontErrors.js'

const currentUser = ref(null)
const sessionLoading = ref(true)
const showAuthPanel = ref(false)
const cartItems = ref([])
const cartNotice = ref('')
const pendingCartAdds = new Set()
let cartNoticeTimer
const CART_STORAGE_KEY = 'runstore-cart-v1'

function restoreCart() {
  try {
    const savedItems = JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY) || '[]')

    if (Array.isArray(savedItems)) {
      cartItems.value = savedItems
        .filter((item) => item && item.variant_id && Number(item.stock_quantity) >= 0)
        .slice(0, 100)
    }
  } catch {
    window.localStorage.removeItem(CART_STORAGE_KEY)
  }
}

function showCartNotice(message) {
  cartNotice.value = message
  window.clearTimeout(cartNoticeTimer)
  cartNoticeTimer = window.setTimeout(() => {
    cartNotice.value = ''
  }, 6000)
}

function openAuthPanel() {
  showAuthPanel.value = true
}

function setCurrentUser(user) {
  currentUser.value = user
}

function handleAuthenticated(user) {
  setCurrentUser(user)
  showAuthPanel.value = false
}

function handleLoggedOut() {
  currentUser.value = null
}

async function addToCart(product) {
  if (!product?.variant_id || product.stock_quantity <= 0) {
    showCartNotice('Sản phẩm hoặc phiên bản này hiện không thể mua.')
    return
  }

  const productKey = getCartKey(product)

  if (pendingCartAdds.has(productKey)) {
    return
  }

  pendingCartAdds.add(productKey)
  const quantityInCart = cartItems.value.filter(
    (item) => getCartKey(item) === productKey
  ).length
  let validatedItem

  try {
    const response = await validatePurchase([{
      product_id: product.product_id || product.id,
      variant_id: product.variant_id,
      quantity: quantityInCart + 1
    }])
    validatedItem = response.data.items[0]
  } catch (error) {
    showCartNotice(
      isDefinitivePurchaseFailure(error)
        ? getPurchaseFailureMessage(
            error,
            'Sản phẩm vừa ngừng bán, hết hàng hoặc không còn đủ số lượng.'
          )
        : 'Chưa thể kiểm tra sản phẩm do kết nối không ổn định. Giỏ hàng chưa bị thay đổi.'
    )
    return
  } finally {
    pendingCartAdds.delete(productKey)
  }

  if (!validatedItem) {
    showCartNotice('Không nhận được thông tin tồn kho mới nhất. Vui lòng thử lại.')
    return
  }

  cartNotice.value = ''
  cartItems.value.push({
    ...product,
    stock_quantity: validatedItem.stock_quantity,
    price: validatedItem.unit_price,
    shop_id: validatedItem.shop_id,
    shop: validatedItem.shop
  })
}

function getCartKey(product) {
  return product.catalogKey || product.id
}

function removeFromCart(productKey) {
  const itemIndex = cartItems.value.findIndex(
    (product) => getCartKey(product) === productKey
  )

  if (itemIndex >= 0) {
    cartItems.value.splice(itemIndex, 1)
  }
}

function clearCart() {
  cartItems.value = []
}

function removeUnavailableCartItems(productKeys) {
  const unavailable = new Set(productKeys)
  cartItems.value = cartItems.value.filter(
    (product) => !unavailable.has(getCartKey(product))
  )
}

function removeProductsFromCart(productIds) {
  const unavailableProducts = new Set(productIds.map((id) => Number(id)))
  cartItems.value = cartItems.value.filter((item) => !unavailableProducts.has(
    Number(item.product_id || item.id)
  ))
}

async function restoreCurrentUser() {
  try {
    const response = await getProfile()
    setCurrentUser(response.data)
  } catch {
    currentUser.value = null
  } finally {
    sessionLoading.value = false
  }
}

watch(
  cartItems,
  (items) => window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items)),
  { deep: true }
)

onMounted(() => {
  restoreCart()
  restoreCurrentUser()
})

onBeforeUnmount(() => {
  window.clearTimeout(cartNoticeTimer)
})
</script>

<template>
  <div class="storefront">
    <SiteHeader
      :cart-count="cartItems.length"
      :categories="categories"
      :current-user="currentUser"
      :session-loading="sessionLoading"
      @logged-out="handleLoggedOut"
      @open-auth="openAuthPanel"
    />

    <p
      v-if="cartNotice"
      class="account-notice account-notice--warning storefront-cart-notice"
      role="status"
      aria-live="polite"
    >{{ cartNotice }}</p>

    <div
      v-if="showAuthPanel && !currentUser"
      class="auth-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Đăng nhập và đăng ký"
      @click.self="showAuthPanel = false"
    >
      <AuthPanel
        @authenticated="handleAuthenticated"
        @close="showAuthPanel = false"
      />
    </div>

    <RouterView v-slot="{ Component, route }">
      <component
        v-if="route.name === 'profile'"
        :is="Component"
        :current-user="currentUser"
        :session-loading="sessionLoading"
        @logged-out="handleLoggedOut"
        @open-auth="openAuthPanel"
        @user-updated="setCurrentUser"
      />
      <component
        v-else-if="['my-products', 'product-edit', 'product-trash', 'my-shop'].includes(route.name)"
        :is="Component"
        :current-user="currentUser"
        :session-loading="sessionLoading"
        @open-auth="openAuthPanel"
        @products-unavailable="removeProductsFromCart"
      />
      <component
        v-else-if="route.name === 'cart'"
        :is="Component"
        :cart-items="cartItems"
        @add-to-cart="addToCart"
        @clear-cart="clearCart"
        @remove-from-cart="removeFromCart"
        @remove-unavailable="removeUnavailableCartItems"
      />
      <component
        v-else-if="route.name === 'product-create'"
        :is="Component"
        :current-user="currentUser"
        :session-loading="sessionLoading"
        @open-auth="openAuthPanel"
      />
      <component
        v-else-if="['product-detail', 'shop'].includes(route.name)"
        :is="Component"
        :cart-items="cartItems"
        @add-to-cart="addToCart"
      />
      <component
        v-else-if="route.name === 'home'"
        :is="Component"
        :cart-items="cartItems"
        @add-to-cart="addToCart"
      />
      <component
        v-else
        :is="Component"
        @add-to-cart="addToCart"
      />
    </RouterView>

    <SiteFooter />
  </div>
</template>
