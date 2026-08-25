<script setup>
import { onMounted, ref } from 'vue'
import { RouterView } from 'vue-router'
import AuthPanel from './components/AuthPanel.vue'
import SiteHeader from './components/SiteHeader.vue'
import { categories } from './data/catalog.js'
import { getProfile } from './services/authService.js'
import { getProduct } from './services/productService.js'

const currentUser = ref(null)
const sessionLoading = ref(true)
const showAuthPanel = ref(false)
const cartItems = ref([])

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
    return
  }

  let currentVariant

  try {
    const response = await getProduct(product.product_id || product.id)
    currentVariant = response.data.variants.find(
      (variant) => Number(variant.id) === Number(product.variant_id)
    )
  } catch {
    return
  }

  if (!currentVariant || currentVariant.stock_quantity <= 0) {
    return
  }

  const quantityInCart = cartItems.value.filter(
    (item) => getCartKey(item) === getCartKey(product)
  ).length

  if (quantityInCart >= currentVariant.stock_quantity) {
    return
  }

  cartItems.value.push({
    ...product,
    stock_quantity: currentVariant.stock_quantity,
    price: currentVariant.effective_price
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

onMounted(restoreCurrentUser)
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

    <div
      v-if="showAuthPanel && !currentUser"
      class="auth-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Login va register"
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
        v-else-if="['my-products', 'product-edit', 'product-trash'].includes(route.name)"
        :is="Component"
        :current-user="currentUser"
        :session-loading="sessionLoading"
        @open-auth="openAuthPanel"
      />
      <component
        v-else-if="route.name === 'cart'"
        :is="Component"
        :cart-items="cartItems"
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
        v-else-if="route.name === 'product-detail'"
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
  </div>
</template>
