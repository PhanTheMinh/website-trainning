<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterView, useRouter } from 'vue-router'
import AuthPanel from './components/AuthPanel.vue'
import SiteHeader from './components/SiteHeader.vue'
import SiteFooter from './components/SiteFooter.vue'
import { categories } from './data/catalog.js'
import { getProfile } from './services/authService.js'
import { validatePurchase } from './services/productService.js'
import { isDefinitivePurchaseFailure } from './utils/purchaseAvailability.js'
import { getPurchaseFailureMessage } from './utils/storefrontErrors.js'
import { createCheckout } from './services/checkoutService.js'

const currentUser = ref(null)
const sessionLoading = ref(true)
const showAuthPanel = ref(false)
const cartItems = ref([])
const preparingCheckout = ref(false)
const router = useRouter()
const cartNotice = ref('')
const pendingCartAdds = new Set()
let cartNoticeTimer
const CART_STORAGE_KEY = 'runstore-cart-v1'
let checkoutRequest = null

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

function orderCreated({ items, cartSnapshot }) {
  const eligible = new Set(cartSnapshot)
  const remaining = new Map(items.map(item => [`${item.product_id}:${item.variant_id}`, item.quantity]))
  cartItems.value = cartItems.value.filter(item => {
    const key = `${item.product_id || item.id}:${item.variant_id}`
    const count = remaining.get(key) || 0
    if (!eligible.has(item) || !count) return true
    remaining.set(key, count - 1)
    return false
  })
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
    showCartNotice('This product or variant is not available for purchase.')
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
            'This product was unpublished, sold out or has insufficient stock.'
          )
        : 'Could not check the product due to an unstable connection. Your cart was not changed.'
    )
    return
  } finally {
    pendingCartAdds.delete(productKey)
  }

  if (!validatedItem) {
    showCartNotice('Could not get the latest stock information. Please try again.')
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

function removeCartLine(productKey) {
  cartItems.value = cartItems.value.filter(
    (product) => getCartKey(product) !== productKey
  )
}

async function setCartQuantity({ key, quantity }) {
  const target = Number(quantity)
  if (!Number.isSafeInteger(target) || target < 1) return
  const matching = cartItems.value.filter((item) => getCartKey(item) === key)
  if (!matching.length || target === matching.length) return

  if (target > matching.length) {
    if (pendingCartAdds.has(key)) return
    pendingCartAdds.add(key)
    try {
      const response = await validatePurchase([{
        product_id: matching[0].product_id || matching[0].id,
        variant_id: matching[0].variant_id,
        quantity: target
      }])
      const current = cartItems.value.filter((item) => getCartKey(item) === key)
      if (current.length !== matching.length) return
      const validated = response.data.items[0]
      const updated = {
        ...matching[0],
        stock_quantity: validated.stock_quantity,
        price: validated.unit_price,
        shop_id: validated.shop_id,
        shop: validated.shop
      }
      cartItems.value.push(...Array.from({ length: target - matching.length }, () => ({ ...updated })))
    } catch (error) {
      showCartNotice(
        isDefinitivePurchaseFailure(error)
          ? getPurchaseFailureMessage(error, 'There is not enough stock for this product.')
          : 'Could not check stock. The quantity in your cart was not changed.'
      )
    } finally {
      pendingCartAdds.delete(key)
    }
    return
  }

  let toRemove = matching.length - target
  cartItems.value = cartItems.value.filter((item) => {
    if (getCartKey(item) !== key || toRemove === 0) return true
    toRemove -= 1
    return false
  })
}

function refreshCartItem({ key, validated }) {
  cartItems.value = cartItems.value.map((item) => getCartKey(item) === key
    ? {
        ...item,
        stock_quantity: validated.stock_quantity,
        price: validated.unit_price,
        shop_id: validated.shop_id,
        shop: validated.shop
      }
    : item
  )
}

async function beginCheckout(keys) {
  if (preparingCheckout.value || sessionLoading.value) return
  if (!currentUser.value) { openAuthPanel(); return }
  const selected = new Set(keys)
  const grouped = new Map()
  cartItems.value.forEach((item) => {
    const key = getCartKey(item)
    if (!selected.has(key)) return
    const line = grouped.get(key)
    if (line) line.quantity += 1
    else grouped.set(key, { key, ...item, quantity: 1 })
  })
  const lines = [...grouped.values()]
  if (!lines.length) return

  preparingCheckout.value = true
  try {
    const userId = currentUser.value.id
    const items = lines.map(item => ({ product_id: item.product_id || item.id,
      variant_id: item.variant_id, quantity: item.quantity }))
    const signature = JSON.stringify([userId, items])
    if (checkoutRequest?.signature !== signature) checkoutRequest = { signature, id: crypto.randomUUID() }
    const response = await createCheckout(items, checkoutRequest.id)
    checkoutRequest = null
    if (currentUser.value?.id !== userId) return
    await router.push({ name: 'checkout', params: { checkoutToken: response.data.token } })
  } catch (error) {
    showCartNotice(
      isDefinitivePurchaseFailure(error)
        ? getPurchaseFailureMessage(error, 'An item is sold out or has insufficient stock.')
        : 'Could not check the selected item. Please try again.'
    )
  } finally {
    preparingCheckout.value = false
  }
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
      aria-label="Sign in and sign up"
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
        v-else-if="[
          'my-products',
          'product-edit',
          'product-trash',
          'my-shop',
          'management',
          'seller-order-list',
          'seller-order-detail',
          'shipping-methods',
          'shipping-method-list',
          'shipping-method-create',
          'shipping-countries',
          'shipping-country-list',
          'shipping-country-create',
          'shipping-settings',
          'shipping-setting-list',
          'shipping-setting-create',
          'shipping-setting-detail',
          'payment-method-list',
          'payment-method-create',
          'payment-method-edit'
        ].includes(route.name)"
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
        :preparing-checkout="preparingCheckout"
        @set-quantity="setCartQuantity"
        @remove-line="removeCartLine"
        @refresh-item="refreshCartItem"
        @begin-checkout="beginCheckout"
      />
      <component
        v-else-if="['checkout', 'order-detail', 'checkout-orders'].includes(route.name)"
        :is="Component"
        :current-user="currentUser"
        :session-loading="sessionLoading"
        :cart-items="cartItems"
        @order-created="orderCreated"
        @open-auth="openAuthPanel"
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
