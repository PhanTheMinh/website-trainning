<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { logout as logoutRequest } from '../services/authService.js'
import { API_BASE_URL } from '../services/apiClient.js'
import { useTheme } from '../composables/useTheme.js'
import UiIcon from './ui/UiIcon.vue'

const props = defineProps({
  cartCount: { type: Number, default: 0 },
  categories: { type: Array, default: () => [] },
  currentUser: { type: Object, default: null },
  sessionLoading: { type: Boolean, default: false }
})
const emit = defineEmits(['open-auth', 'logged-out'])
const route = useRoute()
const router = useRouter()
const { theme, toggleTheme } = useTheme()
const headerRoot = ref(null)
const accountTrigger = ref(null)
const menuTrigger = ref(null)
const mobileMenuOpen = ref(false)
const accountMenuOpen = ref(false)
const avatarLoadFailed = ref(false)
const logoutLoading = ref(false)
const accountError = ref('')
const searchQuery = ref(String(route.query.q || ''))
const accountName = computed(() => props.currentUser?.full_name?.trim() || 'Account')
const accountAvatarUrl = computed(() => {
  const path = props.currentUser?.avatar_url
  return path && !avatarLoadFailed.value ? new URL(path, API_BASE_URL).toString() : ''
})
function closeMenus() { mobileMenuOpen.value = false; accountMenuOpen.value = false }
function escapeMenus() {
  if (accountMenuOpen.value) accountTrigger.value?.focus()
  else if (mobileMenuOpen.value) menuTrigger.value?.focus()
  closeMenus()
}
function toggleMobileMenu() { mobileMenuOpen.value = !mobileMenuOpen.value; accountMenuOpen.value = false }
function toggleAccountMenu() { accountMenuOpen.value = !accountMenuOpen.value; mobileMenuOpen.value = false; accountError.value = '' }
function openAuthentication() { closeMenus(); emit('open-auth') }
function submitSearch() {
  const query = searchQuery.value.trim()
  router.push({ name: 'products', query: query ? { q: query } : {} })
  closeMenus()
}
async function handleLogout() {
  logoutLoading.value = true
  accountError.value = ''
  try {
    await logoutRequest()
    emit('logged-out')
    closeMenus()
    if (route.meta.requiresAuth) await router.push('/')
  } catch (error) { accountError.value = error.message }
  finally { logoutLoading.value = false }
}
function handleOutsideClick(event) { if (!headerRoot.value?.contains(event.target)) closeMenus() }
function handleFocusOut(event) { if (event.relatedTarget && !headerRoot.value?.contains(event.relatedTarget)) closeMenus() }
watch(() => route.fullPath, () => { searchQuery.value = String(route.query.q || ''); closeMenus() })
watch(() => props.currentUser?.avatar_url, () => { avatarLoadFailed.value = false })
onMounted(() => document.addEventListener('click', handleOutsideClick))
onBeforeUnmount(() => document.removeEventListener('click', handleOutsideClick))
</script>

<template>
  <header ref="headerRoot" class="rs-header" @keydown.esc="escapeMenus" @focusout="handleFocusOut">
    <div class="rs-header__inner">
      <RouterLink class="rs-brand" to="/" aria-label="RunStore home" @click="closeMenus">
        <span class="rs-brand__mark" aria-hidden="true">R<span></span></span><span class="rs-brand__name">RUNSTORE</span>
      </RouterLink>
      <nav id="primary-navigation" class="rs-header__nav" :class="{ 'is-open': mobileMenuOpen }" aria-label="Main navigation">
        <RouterLink to="/products" :class="{ 'is-active': ['products', 'category', 'product-detail'].includes(route.name) }">Shop</RouterLink>
        <RouterLink to="/categories">Categories</RouterLink>
        <div class="rs-header__mobile-categories">
          <RouterLink v-for="category in categories" :key="category.slug" :to="{ name: 'category', params: { slug: category.slug } }">{{ category.name }}</RouterLink>
        </div>
      </nav>
      <form class="rs-header__search" role="search" @submit.prevent="submitSearch">
        <label class="rs-sr-only" for="header-product-search">Search products</label>
        <input id="header-product-search" v-model="searchQuery" type="search" placeholder="Search running gear" autocomplete="off" />
        <button type="submit" aria-label="Search"><UiIcon name="search" /></button>
      </form>
      <div class="rs-header__actions">
        <button class="rs-header__icon-button" type="button" :aria-label="theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'" :title="theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'" @click="toggleTheme">
          <UiIcon :name="theme === 'dark' ? 'sun' : 'moon'" />
        </button>
        <RouterLink class="rs-header__icon-button rs-header__cart" to="/cart" :aria-label="'Cart, ' + cartCount + ' items'" @click="closeMenus">
          <UiIcon name="cart" /><span v-if="cartCount" class="rs-header__count">{{ cartCount > 99 ? '99+' : cartCount }}</span>
        </RouterLink>
        <div class="rs-header__account">
          <button ref="accountTrigger" class="rs-header__icon-button" type="button" :aria-label="currentUser ? 'Account: ' + accountName : 'Account'" :disabled="sessionLoading" :aria-expanded="accountMenuOpen" aria-controls="account-menu" @click.stop="toggleAccountMenu">
            <img v-if="accountAvatarUrl" :src="accountAvatarUrl" alt="" @error="avatarLoadFailed = true" /><UiIcon v-else name="user" />
          </button>
          <div v-if="accountMenuOpen && !sessionLoading" id="account-menu" class="rs-header__account-menu">
            <template v-if="currentUser">
              <div class="rs-header__identity"><strong>{{ accountName }}</strong><small>{{ currentUser.email }}</small></div>
              <RouterLink to="/profile">My profile</RouterLink>
              <RouterLink :to="{ name: 'management' }">Seller workspace</RouterLink>
              <button type="button" :disabled="logoutLoading" @click="handleLogout">{{ logoutLoading ? 'Signing out…' : 'Sign out' }}</button>
              <p v-if="accountError" class="rs-alert rs-alert--error" role="alert">{{ accountError }}</p>
            </template>
            <template v-else>
              <strong>Welcome to RunStore</strong><p>Sign in to shop or manage your store.</p>
              <button class="rs-button" type="button" @click="openAuthentication">Sign in / Sign up</button>
            </template>
          </div>
        </div>
      </div>
      <button ref="menuTrigger" class="rs-header__icon-button rs-header__menu-button" type="button" :aria-expanded="mobileMenuOpen" aria-controls="primary-navigation" :aria-label="mobileMenuOpen ? 'Close navigation' : 'Open navigation'" @click.stop="toggleMobileMenu"><UiIcon :name="mobileMenuOpen ? 'close' : 'menu'" /></button>
    </div>
  </header>
</template>

<style scoped>
.rs-header { position: sticky; top: 0; z-index: 40; background: var(--rs-surface); border-bottom: 1px solid var(--rs-border); color: var(--rs-text); }
.rs-header__inner { display: grid; grid-template-columns: auto auto minmax(160px, 1fr) auto; align-items: center; gap: 32px; max-width: 1440px; min-height: 80px; padding: 16px 24px; margin: auto; }
.rs-brand { display: inline-flex; align-items: center; gap: 10px; color: var(--rs-text); font-weight: 700; letter-spacing: -.06em; }
.rs-brand__mark { position: relative; display: grid; place-items: center; background: #123d32; color: #fff; width: 34px; height: 38px; border-radius: 6px; font-size: 23px; font-style: italic; overflow: hidden; }
.rs-brand__mark span { position: absolute; width: 20px; height: 4px; background: var(--rs-accent); right: -3px; top: 7px; transform: rotate(-45deg); }
.rs-brand__name { font-size: 17px; }
.rs-header__nav { display: flex; align-items: center; gap: 24px; }
.rs-header__nav > a { color: var(--rs-muted); font-size: 14px; font-weight: 500; padding-block: 10px; }
.rs-header__nav > a:hover, .rs-header__nav > a.router-link-active, .rs-header__nav > a.is-active { color: var(--rs-text); text-decoration: underline; text-underline-offset: 8px; }
.rs-header__search { display: flex; align-items: center; margin-left: auto; width: 100%; max-width: 380px; background: var(--rs-subtle); border: 1px solid transparent; border-radius: 6px; }
.rs-header__search:focus-within { border-color: var(--rs-focus); }
.rs-header__search input { border: 0; min-width: 0; flex: 1; width: 100%; padding: 10px 12px; height: 44px; background: transparent; color: var(--rs-text); font-size: 14px; outline: none; }
.rs-header__search input::placeholder { color: var(--rs-muted); }
.rs-header__search button, .rs-header__icon-button { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; flex-shrink: 0; padding: 0; border: 0; border-radius: 6px; color: var(--rs-text); background: transparent; }
.rs-header__icon-button:hover { background: var(--rs-subtle); }
.rs-header__actions { display: flex; gap: 4px; align-items: center; }
.rs-header__cart { position: relative; }
.rs-header__count { position: absolute; top: 1px; right: 0; padding: 1px 4px; min-width: 16px; background: var(--rs-accent); color: var(--rs-on-accent); font-size: 10px; border-radius: 20px; font-weight: 700; }
.rs-header__account { position: relative; }
.rs-header__account img { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; }
.rs-header__account-menu { position: absolute; top: calc(100% + 12px); right: 0; width: min(300px, calc(100vw - 32px)); padding: 16px; background: var(--rs-surface); border: 1px solid var(--rs-border); border-radius: 8px; box-shadow: var(--rs-shadow); }
.rs-header__account-menu > a, .rs-header__account-menu > button:not(.rs-button) { display: block; width: 100%; padding: 12px; border: 0; border-radius: 6px; font-size: 14px; text-align: left; color: var(--rs-text); background: transparent; }
.rs-header__account-menu > a:hover, .rs-header__account-menu > button:not(.rs-button):hover { background: var(--rs-subtle); }
.rs-header__account-menu p, .rs-header__identity small { color: var(--rs-muted); font-size: 13px; margin: 8px 0 16px; }
.rs-header__account-menu > .rs-button { width: 100%; }
.rs-header__identity { display: grid; border-bottom: 1px solid var(--rs-border); margin-bottom: 8px; overflow-wrap: anywhere; }
.rs-header__identity strong { font-size: 14px; }
.rs-header__menu-button, .rs-header__mobile-categories { display: none; }
@media (max-width: 1000px) {
  .rs-header__inner { grid-template-columns: 1fr auto auto; gap: 8px; padding: 12px 16px; }
  .rs-brand { grid-column: 1; grid-row: 1; }
  .rs-header__actions { grid-column: 2; grid-row: 1; }
  .rs-header__menu-button { display: flex; grid-column: 3; grid-row: 1; }
  .rs-header__search { grid-column: 1 / -1; grid-row: 2; max-width: none; }
  .rs-header__nav { display: none; grid-column: 1 / -1; grid-row: 3; padding: 8px 0; }
  .rs-header__nav.is-open { display: grid; gap: 4px; }
  .rs-header__mobile-categories { display: grid; gap: 4px; border-top: 1px solid var(--rs-border); margin-top: 8px; padding-top: 8px; }
  .rs-header__mobile-categories a { color: var(--rs-muted); font-size: 14px; font-weight: 400; padding: 10px 0; }
  .rs-header__account-menu { right: -48px; }
}
@media (max-width: 370px) { .rs-brand__name { display: none; } }
</style>
