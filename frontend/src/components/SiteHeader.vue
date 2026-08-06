<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { logout as logoutRequest } from '../services/authService.js'
import { API_BASE_URL } from '../services/apiClient.js'

const props = defineProps({
  cartCount: {
    type: Number,
    default: 0
  },
  categories: {
    type: Array,
    default: () => []
  },
  currentUser: {
    type: Object,
    default: null
  },
  sessionLoading: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['open-auth', 'logged-out'])
const route = useRoute()
const router = useRouter()
const headerRoot = ref(null)
const mobileMenuOpen = ref(false)
const categoryMenuOpen = ref(false)
const accountMenuOpen = ref(false)
const avatarLoadFailed = ref(false)
const logoutLoading = ref(false)
const accountError = ref('')
const searchQuery = ref(String(route.query.q || ''))

const accountName = computed(() =>
  props.currentUser?.full_name?.trim() || 'Tài khoản'
)

const accountInitials = computed(() => {
  const words = accountName.value.split(/\s+/).filter(Boolean)

  if (!props.currentUser || words.length === 0) {
    return 'TK'
  }

  return `${words[0][0]}${words.length > 1 ? words.at(-1)[0] : ''}`.toUpperCase()
})

const accountAvatarUrl = computed(() => {
  const avatarPath = props.currentUser?.avatar_url

  if (!avatarPath || avatarLoadFailed.value) {
    return ''
  }

  return new URL(avatarPath, API_BASE_URL).toString()
})

function closeMenus() {
  mobileMenuOpen.value = false
  categoryMenuOpen.value = false
  accountMenuOpen.value = false
}

function toggleMobileMenu() {
  mobileMenuOpen.value = !mobileMenuOpen.value
  categoryMenuOpen.value = false
  accountMenuOpen.value = false
}

function toggleCategoryMenu() {
  categoryMenuOpen.value = !categoryMenuOpen.value
  accountMenuOpen.value = false
}

function toggleAccountMenu() {
  if (props.sessionLoading) {
    return
  }

  accountMenuOpen.value = !accountMenuOpen.value
  categoryMenuOpen.value = false
  accountError.value = ''
}

function openAuthentication() {
  closeMenus()
  emit('open-auth')
}

function submitSearch() {
  const query = searchQuery.value.trim()

  router.push({
    name: 'products',
    query: query ? { q: query } : {}
  })

  closeMenus()
}

async function handleLogout() {
  logoutLoading.value = true
  accountError.value = ''

  try {
    await logoutRequest()
    emit('logged-out')
    closeMenus()

    if (route.meta.requiresAuth) {
      await router.push('/')
    }
  } catch (error) {
    accountError.value = error.message
  } finally {
    logoutLoading.value = false
  }
}

function handleOutsideClick(event) {
  if (!headerRoot.value?.contains(event.target)) {
    closeMenus()
  }
}

watch(
  () => route.fullPath,
  () => {
    searchQuery.value = String(route.query.q || '')
    closeMenus()
  }
)

watch(
  () => props.currentUser?.avatar_url,
  () => {
    avatarLoadFailed.value = false
  }
)

onMounted(() => document.addEventListener('click', handleOutsideClick))
onBeforeUnmount(() => document.removeEventListener('click', handleOutsideClick))
</script>

<template>
  <header ref="headerRoot" class="run-header" @keydown.esc="closeMenus">
    <div class="run-header__inner">
      <RouterLink class="run-brand" to="/" aria-label="SportBase - Trang chủ" @click="closeMenus">
        <span class="run-brand__mark" aria-hidden="true">SB</span>
        <span class="run-brand__copy">
          <strong>SportBase</strong>
          <small>Running goods</small>
        </span>
      </RouterLink>

      <button
        class="run-menu-toggle"
        type="button"
        :aria-expanded="mobileMenuOpen"
        aria-controls="primary-navigation"
        aria-label="Mở menu điều hướng"
        @click.stop="toggleMobileMenu"
      >
        <span aria-hidden="true"></span>
        <span aria-hidden="true"></span>
        <span aria-hidden="true"></span>
      </button>

      <nav
        id="primary-navigation"
        class="run-navigation"
        :class="{ 'is-open': mobileMenuOpen }"
        aria-label="Điều hướng chính"
      >
        <div class="run-navigation__links">
          <RouterLink class="run-navigation__link" to="/" @click="closeMenus">
            Trang chủ
          </RouterLink>

          <div
            class="run-category"
            :class="{ 'is-open': categoryMenuOpen }"
          >
            <button
              class="run-navigation__link run-category__trigger"
              :class="{
                'is-active': route.name === 'categories' || route.name === 'category'
              }"
              type="button"
              :aria-expanded="categoryMenuOpen"
              aria-controls="category-menu"
              @click.stop="toggleCategoryMenu"
            >
              Danh mục
              <span class="run-chevron" aria-hidden="true"></span>
            </button>

            <div id="category-menu" class="run-dropdown run-category__menu">
              <RouterLink to="/products" @click="closeMenus">
                <span>Tất cả sản phẩm</span>
              </RouterLink>
              <RouterLink
                v-for="category in categories"
                :key="category.slug"
                :to="{
                  name: 'category',
                  params: { slug: category.slug }
                }"
                @click="closeMenus"
              >
                <span>{{ category.name }}</span>
              </RouterLink>
            </div>
          </div>

          <RouterLink class="run-navigation__link" to="/products" @click="closeMenus">
            Sản phẩm
          </RouterLink>
        </div>

        <form class="run-search" role="search" @submit.prevent="submitSearch">
          <label class="visually-hidden" for="header-product-search">
            Tìm sản phẩm theo tên
          </label>
          <span class="run-search__icon" aria-hidden="true"></span>
          <input
            id="header-product-search"
            v-model="searchQuery"
            type="search"
            placeholder="Tìm giày, áo, phụ kiện..."
            autocomplete="off"
          />
          <button type="submit">Tìm kiếm</button>
        </form>
      </nav>

      <div class="run-header__actions">
        <RouterLink class="run-cart" to="/cart" aria-label="Mở giỏ hàng" @click="closeMenus">
          <span class="run-cart__icon" aria-hidden="true"></span>
          <span class="run-cart__label">Giỏ hàng</span>
          <strong>{{ cartCount }}</strong>
        </RouterLink>

        <div
          class="run-account"
          :class="{ 'is-open': accountMenuOpen }"
        >
          <button
            class="run-account__trigger"
            type="button"
            :disabled="sessionLoading"
            :aria-expanded="accountMenuOpen"
            aria-controls="account-menu"
            @click.stop="toggleAccountMenu"
          >
            <span class="run-account__avatar" aria-hidden="true">
              <img
                v-if="accountAvatarUrl"
                :src="accountAvatarUrl"
                alt=""
                @error="avatarLoadFailed = true"
              />
              <span v-else>{{ sessionLoading ? '…' : accountInitials }}</span>
            </span>
            <span class="run-account__copy">
              <small>{{ currentUser ? 'Xin chào' : 'Thành viên' }}</small>
              <strong>{{ sessionLoading ? 'Đang tải...' : accountName }}</strong>
            </span>
            <span class="run-chevron" aria-hidden="true"></span>
          </button>

          <div
            v-if="!sessionLoading"
            id="account-menu"
            class="run-dropdown run-account__menu"
            role="menu"
          >
            <template v-if="currentUser">
              <div class="run-account__summary">
                <span class="run-account__avatar run-account__avatar--large" aria-hidden="true">
                  <img
                    v-if="accountAvatarUrl"
                    :src="accountAvatarUrl"
                    alt=""
                    @error="avatarLoadFailed = true"
                  />
                  <span v-else>{{ accountInitials }}</span>
                </span>
                <span>
                  <strong>{{ currentUser.full_name }}</strong>
                  <small>{{ currentUser.email }}</small>
                </span>
              </div>

              <div class="run-account__divider"></div>

              <RouterLink class="run-account__item" to="/profile" role="menuitem" @click="closeMenus">
                <span>
                  <strong>Hồ sơ cá nhân</strong>
                  <small>Thông tin và ảnh đại diện</small>
                </span>
                <span class="run-item-arrow" aria-hidden="true"></span>
              </RouterLink>

              <div class="run-account__divider"></div>

              <button
                class="run-account__logout"
                type="button"
                role="menuitem"
                :disabled="logoutLoading"
                @click="handleLogout"
              >
                {{ logoutLoading ? 'Đang đăng xuất...' : 'Đăng xuất' }}
              </button>

              <p v-if="accountError" class="run-account__error">
                {{ accountError }}
              </p>
            </template>

            <template v-else>
              <div class="run-account__guest">
                <span class="run-account__avatar run-account__avatar--large" aria-hidden="true">
                  <span>TK</span>
                </span>
                <strong>Chào mừng đến SportBase</strong>
                <p>Đăng nhập để quản lý hồ sơ và sản phẩm của bạn.</p>
                <button type="button" @click="openAuthentication">
                  Đăng nhập / Đăng ký
                </button>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.run-header {
  --header-ink: #15231d;
  --header-muted: #68756f;
  --header-green: #0f5132;
  --header-green-dark: #0a3d26;
  --header-lime: #b9f25d;
  --header-line: rgba(21, 35, 29, 0.1);
  background: rgba(250, 251, 247, 0.92);
  border-bottom: 1px solid var(--header-line);
  box-shadow: 0 8px 30px rgba(21, 35, 29, 0.055);
  position: sticky;
  top: 0;
  z-index: 40;
  backdrop-filter: blur(18px) saturate(140%);
}

.run-header::before {
  background: linear-gradient(90deg, var(--header-green), #1c7c50 58%, var(--header-lime));
  content: '';
  height: 2px;
  inset: 0 0 auto;
  position: absolute;
}

.run-header__inner {
  align-items: center;
  display: grid;
  gap: clamp(18px, 2vw, 34px);
  grid-template-columns: auto minmax(0, 1fr) auto;
  margin: 0 auto;
  max-width: 1480px;
  min-height: 78px;
  padding: 12px clamp(18px, 4vw, 58px);
}

.run-brand {
  align-items: center;
  display: inline-flex;
  gap: 11px;
  min-width: max-content;
}

.run-brand__mark {
  align-items: center;
  background: var(--header-green);
  border-radius: 13px;
  box-shadow: 0 8px 18px rgba(15, 81, 50, 0.2);
  color: #fff;
  display: inline-flex;
  font-size: 0.78rem;
  font-weight: 950;
  height: 42px;
  justify-content: center;
  letter-spacing: -0.04em;
  position: relative;
  width: 42px;
}

.run-brand__mark::after {
  background: var(--header-lime);
  border: 2px solid var(--header-green);
  border-radius: 50%;
  content: '';
  height: 10px;
  position: absolute;
  right: -2px;
  top: -2px;
  width: 10px;
}

.run-brand__copy {
  display: grid;
  line-height: 1;
}

.run-brand__copy strong {
  color: var(--header-ink);
  font-size: 1.2rem;
  font-weight: 950;
  letter-spacing: -0.035em;
}

.run-brand__copy small {
  color: var(--header-muted);
  font-size: 0.58rem;
  font-weight: 850;
  letter-spacing: 0.16em;
  margin-top: 6px;
  text-transform: uppercase;
}

.run-navigation {
  align-items: center;
  display: flex;
  gap: clamp(18px, 2vw, 32px);
  min-width: 0;
}

.run-navigation__links {
  align-items: center;
  display: flex;
  gap: 4px;
  white-space: nowrap;
}

.run-navigation__link {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: 999px;
  color: #46534e;
  display: inline-flex;
  font-size: 0.9rem;
  font-weight: 800;
  gap: 8px;
  min-height: 42px;
  padding: 9px 13px;
  transition: background 160ms ease, color 160ms ease, transform 160ms ease;
}

.run-navigation__link:hover,
.run-navigation__link:focus-visible,
.run-navigation__link.is-active,
.run-navigation__link.router-link-exact-active {
  background: rgba(15, 81, 50, 0.075);
  color: var(--header-green);
}

.run-navigation__link:active {
  transform: translateY(1px);
}

.run-category,
.run-account {
  position: relative;
}

.run-category::after,
.run-account::after {
  content: '';
  height: 14px;
  left: 0;
  position: absolute;
  right: 0;
  top: 100%;
}

.run-chevron {
  border-bottom: 1.5px solid currentColor;
  border-right: 1.5px solid currentColor;
  display: inline-block;
  height: 7px;
  margin: -3px 2px 0 3px;
  transform: rotate(45deg);
  transition: transform 180ms ease;
  width: 7px;
}

.run-category.is-open .run-chevron,
.run-account.is-open .run-chevron {
  margin-top: 3px;
  transform: rotate(225deg);
}

.run-dropdown {
  background: rgba(255, 255, 255, 0.98);
  border: 1px solid var(--header-line);
  border-radius: 16px;
  box-shadow: 0 22px 55px rgba(21, 35, 29, 0.16);
  opacity: 0;
  padding: 8px;
  pointer-events: none;
  position: absolute;
  top: calc(100% + 11px);
  transform: translateY(8px) scale(0.985);
  transition: opacity 160ms ease, transform 160ms ease, visibility 160ms ease;
  visibility: hidden;
  z-index: 50;
}

.run-category:hover .run-dropdown,
.run-category:focus-within .run-dropdown,
.run-category.is-open .run-dropdown,
.run-account:hover .run-dropdown,
.run-account:focus-within .run-dropdown,
.run-account.is-open .run-dropdown {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0) scale(1);
  visibility: visible;
}

.run-category__menu {
  display: grid;
  left: 0;
  min-width: 250px;
}

.run-category__menu a {
  align-items: center;
  border-radius: 10px;
  color: #46534e;
  display: flex;
  font-size: 0.9rem;
  font-weight: 760;
  gap: 20px;
  justify-content: space-between;
  padding: 11px 12px;
  transition: background 150ms ease, color 150ms ease;
}

.run-category__menu a:hover,
.run-category__menu a:focus-visible,
.run-category__menu a.router-link-active {
  background: #edf3eb;
  color: var(--header-green);
}

.run-category__menu small {
  align-items: center;
  background: #f1f4ef;
  border-radius: 999px;
  color: var(--header-muted);
  display: inline-flex;
  font-size: 0.72rem;
  font-weight: 850;
  justify-content: center;
  min-width: 28px;
  padding: 4px 7px;
}

.run-search {
  align-items: center;
  background: #eef2ec;
  border: 1px solid transparent;
  border-radius: 999px;
  display: flex;
  flex: 1;
  margin-left: auto;
  max-width: 410px;
  min-width: 210px;
  padding: 4px 5px 4px 17px;
  transition: background 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
}

.run-search:focus-within {
  background: #fff;
  border-color: rgba(15, 81, 50, 0.35);
  box-shadow: 0 0 0 4px rgba(15, 81, 50, 0.08);
}

.run-search__icon {
  border: 1.8px solid var(--header-muted);
  border-radius: 50%;
  flex: 0 0 auto;
  height: 14px;
  position: relative;
  width: 14px;
}

.run-search__icon::after {
  background: var(--header-muted);
  border-radius: 2px;
  content: '';
  height: 1.8px;
  position: absolute;
  right: -5px;
  top: 11px;
  transform: rotate(45deg);
  width: 6px;
}

.run-search input {
  background: transparent;
  border: 0;
  box-shadow: none;
  color: var(--header-ink);
  flex: 1;
  font-size: 0.88rem;
  min-height: 38px;
  min-width: 0;
  outline: 0;
  padding: 0 12px;
}

.run-search input::placeholder {
  color: #7b8781;
}

.run-search input::-webkit-search-cancel-button {
  cursor: pointer;
}

.run-search button {
  background: var(--header-green);
  border: 0;
  border-radius: 999px;
  color: #fff;
  font-size: 0.78rem;
  font-weight: 850;
  min-height: 36px;
  padding: 8px 14px;
  transition: background 160ms ease, transform 160ms ease;
  white-space: nowrap;
}

.run-search button:hover,
.run-search button:focus-visible {
  background: var(--header-green-dark);
}

.run-search button:active {
  transform: scale(0.98);
}

.run-header__actions {
  align-items: center;
  display: flex;
  gap: 9px;
  justify-self: end;
}

.run-cart,
.run-account__trigger {
  align-items: center;
  border-radius: 999px;
  display: inline-flex;
  min-height: 46px;
  transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
}

.run-cart {
  background: var(--header-ink);
  color: #fff;
  gap: 9px;
  padding: 8px 9px 8px 14px;
}

.run-cart:hover,
.run-cart:focus-visible {
  box-shadow: 0 10px 24px rgba(21, 35, 29, 0.2);
  transform: translateY(-1px);
}

.run-cart__icon {
  border: 1.7px solid currentColor;
  border-radius: 2px 2px 5px 5px;
  height: 12px;
  position: relative;
  transform: skew(-5deg);
  width: 17px;
}

.run-cart__icon::before {
  border-top: 1.7px solid currentColor;
  content: '';
  left: -5px;
  position: absolute;
  top: -4px;
  width: 7px;
}

.run-cart__icon::after {
  background: currentColor;
  border-radius: 50%;
  bottom: -6px;
  box-shadow: 10px 0 0 currentColor;
  content: '';
  height: 3px;
  left: 1px;
  position: absolute;
  width: 3px;
}

.run-cart__label {
  font-size: 0.84rem;
  font-weight: 800;
}

.run-cart strong {
  align-items: center;
  background: var(--header-lime);
  border-radius: 50%;
  color: var(--header-ink);
  display: inline-flex;
  font-size: 0.72rem;
  height: 28px;
  justify-content: center;
  min-width: 28px;
  padding: 0 5px;
}

.run-account__trigger {
  background: #fff;
  border: 1px solid rgba(21, 35, 29, 0.13);
  color: var(--header-ink);
  gap: 9px;
  max-width: 230px;
  padding: 5px 12px 5px 5px;
}

.run-account__trigger:hover,
.run-account__trigger:focus-visible,
.run-account.is-open .run-account__trigger {
  border-color: rgba(15, 81, 50, 0.32);
  box-shadow: 0 9px 22px rgba(21, 35, 29, 0.09);
}

.run-account__trigger:disabled {
  cursor: wait;
}

.run-account__avatar {
  align-items: center;
  background: linear-gradient(145deg, var(--header-green), #1d7850);
  border: 2px solid rgba(185, 242, 93, 0.68);
  border-radius: 50%;
  color: #fff;
  display: inline-flex;
  flex: 0 0 auto;
  font-size: 0.67rem;
  font-weight: 950;
  height: 34px;
  justify-content: center;
  letter-spacing: -0.03em;
  overflow: hidden;
  width: 34px;
}

.run-account__avatar img {
  height: 100%;
  object-fit: cover;
  width: 100%;
}

.run-account__avatar--large {
  height: 46px;
  width: 46px;
}

.run-account__copy {
  display: grid;
  min-width: 0;
  text-align: left;
}

.run-account__copy small {
  color: var(--header-muted);
  font-size: 0.64rem;
  font-weight: 700;
}

.run-account__copy strong {
  font-size: 0.82rem;
  font-weight: 900;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.run-account__menu {
  min-width: 290px;
  right: 0;
}

.run-account__summary {
  align-items: center;
  display: flex;
  gap: 11px;
  padding: 9px;
}

.run-account__summary > span:last-child {
  display: grid;
  min-width: 0;
}

.run-account__summary strong,
.run-account__summary small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.run-account__summary strong {
  color: var(--header-ink);
  font-size: 0.9rem;
}

.run-account__summary small {
  color: var(--header-muted);
  font-size: 0.73rem;
  margin-top: 3px;
}

.run-account__divider {
  border-top: 1px solid var(--header-line);
  margin: 6px 4px;
}

.run-account__item {
  align-items: center;
  border-radius: 11px;
  color: var(--header-ink);
  display: flex;
  gap: 16px;
  justify-content: space-between;
  padding: 10px 11px;
  transition: background 150ms ease, color 150ms ease;
}

.run-account__item > span:first-child {
  display: grid;
}

.run-account__item strong {
  font-size: 0.84rem;
}

.run-account__item small {
  color: var(--header-muted);
  font-size: 0.7rem;
  margin-top: 2px;
}

.run-account__item:hover,
.run-account__item:focus-visible,
.run-account__item.router-link-active {
  background: #edf3eb;
  color: var(--header-green);
}

.run-item-arrow {
  border-right: 1.5px solid currentColor;
  border-top: 1.5px solid currentColor;
  height: 7px;
  transform: rotate(45deg);
  width: 7px;
}

.run-account__logout {
  background: transparent;
  border: 0;
  border-radius: 10px;
  color: #9d342c;
  font-size: 0.82rem;
  font-weight: 850;
  padding: 10px 11px;
  text-align: left;
  width: 100%;
}

.run-account__logout:hover,
.run-account__logout:focus-visible {
  background: #fff1ef;
}

.run-account__error {
  color: #9d342c;
  font-size: 0.72rem;
  margin: 4px 8px 6px;
}

.run-account__guest {
  align-items: center;
  display: grid;
  justify-items: center;
  padding: 15px 13px 13px;
  text-align: center;
}

.run-account__guest > strong {
  color: var(--header-ink);
  font-size: 0.93rem;
  margin-top: 10px;
}

.run-account__guest p {
  color: var(--header-muted);
  font-size: 0.76rem;
  line-height: 1.5;
  margin: 6px 0 13px;
}

.run-account__guest button {
  background: var(--header-green);
  border: 0;
  border-radius: 999px;
  color: #fff;
  font-size: 0.8rem;
  font-weight: 850;
  min-height: 39px;
  padding: 9px 17px;
  width: 100%;
}

.run-menu-toggle {
  align-items: center;
  background: #fff;
  border: 1px solid var(--header-line);
  border-radius: 12px;
  display: none;
  flex-direction: column;
  gap: 4px;
  height: 44px;
  justify-content: center;
  padding: 0;
  width: 44px;
}

.run-menu-toggle span {
  background: var(--header-ink);
  border-radius: 4px;
  height: 2px;
  transition: transform 180ms ease, opacity 180ms ease;
  width: 17px;
}

.run-menu-toggle[aria-expanded='true'] span:first-child {
  transform: translateY(6px) rotate(45deg);
}

.run-menu-toggle[aria-expanded='true'] span:nth-child(2) {
  opacity: 0;
}

.run-menu-toggle[aria-expanded='true'] span:last-child {
  transform: translateY(-6px) rotate(-45deg);
}

.run-header :focus-visible {
  outline: 3px solid rgba(185, 242, 93, 0.85);
  outline-offset: 2px;
}

@media (max-width: 1160px) {
  .run-header__inner {
    gap: 18px;
  }

  .run-brand__copy small,
  .run-navigation__links > .run-navigation__link:first-child {
    display: none;
  }

  .run-search {
    max-width: none;
  }
}

@media (max-width: 940px) {
  .run-header__inner {
    grid-template-columns: minmax(0, 1fr) auto auto;
    min-height: 70px;
  }

  .run-brand {
    grid-column: 1;
    grid-row: 1;
  }

  .run-menu-toggle {
    display: inline-flex;
    grid-column: 3;
    grid-row: 1;
  }

  .run-header__actions {
    grid-column: 2;
    grid-row: 1;
  }

  .run-navigation {
    align-items: stretch;
    background: #fff;
    border: 1px solid var(--header-line);
    border-radius: 16px;
    box-shadow: 0 18px 38px rgba(21, 35, 29, 0.1);
    display: none;
    flex-direction: column;
    gap: 10px;
    grid-column: 1 / -1;
    grid-row: 2;
    padding: 10px;
  }

  .run-navigation.is-open {
    display: flex;
  }

  .run-navigation__links {
    align-items: stretch;
    flex-direction: column;
  }

  .run-navigation__links > .run-navigation__link:first-child {
    display: inline-flex;
  }

  .run-navigation__link {
    justify-content: space-between;
    width: 100%;
  }

  .run-category__menu {
    box-shadow: none;
    display: none;
    left: auto;
    margin: 2px 0 5px;
    opacity: 1;
    position: static;
    transform: none;
    visibility: visible;
    width: 100%;
  }

  .run-category:hover .run-category__menu,
  .run-category:focus-within .run-category__menu {
    display: none;
  }

  .run-category.is-open .run-category__menu {
    display: grid;
    pointer-events: auto;
  }

  .run-search {
    margin: 0;
    max-width: none;
    width: 100%;
  }
}

@media (max-width: 650px) {
  .run-header__inner {
    gap: 8px;
    padding: 10px 12px;
  }

  .run-brand__mark {
    border-radius: 11px;
    height: 38px;
    width: 38px;
  }

  .run-brand__copy strong {
    font-size: 1.05rem;
  }

  .run-brand__copy small,
  .run-cart__label,
  .run-account__copy {
    display: none;
  }

  .run-cart {
    min-height: 42px;
    padding: 7px 8px 7px 12px;
  }

  .run-cart strong {
    height: 25px;
    min-width: 25px;
  }

  .run-account__trigger {
    min-height: 42px;
    padding: 3px 9px 3px 3px;
  }

  .run-account__avatar {
    height: 34px;
    width: 34px;
  }

  .run-account__menu {
    max-width: calc(100vw - 24px);
    min-width: min(290px, calc(100vw - 24px));
    right: -52px;
  }

  .run-menu-toggle {
    border-radius: 11px;
    height: 42px;
    width: 42px;
  }

  .run-search button {
    font-size: 0;
    padding: 0;
    position: relative;
    width: 38px;
  }

  .run-search button::after {
    border: solid #fff;
    border-width: 0 2px 2px 0;
    content: '';
    height: 7px;
    left: 14px;
    position: absolute;
    top: 13px;
    transform: rotate(-45deg);
    width: 7px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .run-header *,
  .run-header *::before,
  .run-header *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
