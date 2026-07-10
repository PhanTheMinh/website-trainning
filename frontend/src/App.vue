<script setup>
import { computed, ref } from 'vue'
import heroImage from './assets/sports-store-hero.png'
import AuthPanel from './components/AuthPanel.vue'
import BackendConnectionTest from './components/BackendConnectionTest.vue'

const categories = [
  { name: 'Giay chay bo', count: 28 },
  { name: 'Bong da', count: 16 },
  { name: 'Gym & Fitness', count: 34 },
  { name: 'Bong ro', count: 12 }
]

const products = [
  {
    id: 1,
    name: 'Giay chay bo AeroRun Pro',
    category: 'Giay chay bo',
    price: 1890000,
    tag: 'Ban chay',
    color: '#16a34a'
  },
  {
    id: 2,
    name: 'Ao training DryFlex',
    category: 'Gym & Fitness',
    price: 450000,
    tag: 'Moi',
    color: '#2563eb'
  },
  {
    id: 3,
    name: 'Bong da Strike Match',
    category: 'Bong da',
    price: 620000,
    tag: 'Hot',
    color: '#f97316'
  },
  {
    id: 4,
    name: 'Balo the thao Utility 24L',
    category: 'Gym & Fitness',
    price: 790000,
    tag: 'Giam 15%',
    color: '#0f766e'
  },
  {
    id: 5,
    name: 'Bong ro Street Grip',
    category: 'Bong ro',
    price: 540000,
    tag: 'Pho bien',
    color: '#dc2626'
  },
  {
    id: 6,
    name: 'Binh nuoc SportFlow 900ml',
    category: 'Gym & Fitness',
    price: 220000,
    tag: 'Tien ich',
    color: '#7c3aed'
  }
]

const selectedCategory = ref('Tat ca')
const cartItems = ref([])
const currentUser = ref(null)
const showAuthPanel = ref(false)
const profileForm = ref({
  name: '',
  email: '',
  sport: '',
  address: 'Quan 1, TP. Ho Chi Minh'
})

const categoryFilters = computed(() => ['Tat ca', ...categories.map((item) => item.name)])

const filteredProducts = computed(() => {
  if (selectedCategory.value === 'Tat ca') {
    return products
  }

  return products.filter((product) => product.category === selectedCategory.value)
})

const cartTotal = computed(() =>
  cartItems.value.reduce((total, product) => total + product.price, 0)
)

function formatCurrency(value) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND'
  }).format(value)
}

function addToCart(product) {
  cartItems.value.push(product)
}

function openAuthPanel() {
  showAuthPanel.value = true
}

function handleAuthenticated(user) {
  currentUser.value = user
  profileForm.value = {
    name: user.name,
    email: user.email,
    sport: user.sport,
    address: 'Quan 1, TP. Ho Chi Minh'
  }
  showAuthPanel.value = false
}

function saveProfile() {
  currentUser.value = {
    ...currentUser.value,
    name: profileForm.value.name,
    email: profileForm.value.email,
    sport: profileForm.value.sport
  }
}

function logout() {
  currentUser.value = null
  showAuthPanel.value = false
}
</script>

<template>
  <div class="storefront">
    <header class="site-header">
      <a class="brand" href="#">SportBase</a>
      <nav aria-label="Dieu huong chinh">
        <a href="#categories">Danh muc</a>
        <a href="#products">San pham</a>
        <a href="#profile">Profile</a>
        <a href="#backend">Backend</a>
      </nav>
      <div class="header-actions">
        <button v-if="!currentUser" class="auth-button" type="button" @click="openAuthPanel">
          Login / Register
        </button>
        <a v-else class="profile-chip" href="#profile">{{ currentUser.name }}</a>
        <button class="cart-button" type="button">
          Gio hang
          <span>{{ cartItems.length }}</span>
        </button>
      </div>
    </header>

    <div
      v-if="showAuthPanel && !currentUser"
      class="auth-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Login va register"
      @click.self="showAuthPanel = false"
    >
      <AuthPanel
        id="auth"
        @authenticated="handleAuthenticated"
        @close="showAuthPanel = false"
      />
    </div>

    <main>
      <section class="hero">
        <img :src="heroImage" alt="Bo suu tap do the thao tren ke trung bay" />
        <div class="hero-content">
          <p class="eyebrow">Sports essentials</p>
          <h1>Trang bi tot hon cho moi buoi tap.</h1>
          <p>
            Webbase ban do the thao voi danh muc, san pham noi bat, gio hang mini
            va cau truc san sang ket noi backend Node.js.
          </p>
          <div class="hero-actions">
            <a class="primary-action" href="#products">Mua ngay</a>
            <a class="secondary-action" href="#categories">Xem danh muc</a>
          </div>
        </div>
      </section>

      <section id="categories" class="section">
        <div class="section-heading">
          <p class="eyebrow">Danh muc</p>
          <h2>Chon mon the thao cua ban</h2>
        </div>
        <div class="category-grid">
          <article v-for="category in categories" :key="category.name" class="category-card">
            <span>{{ category.count }} san pham</span>
            <h3>{{ category.name }}</h3>
          </article>
        </div>
      </section>

      <section id="products" class="section product-section">
        <div class="section-heading">
          <p class="eyebrow">Noi bat</p>
          <h2>San pham dang ban</h2>
        </div>

        <div class="filters" aria-label="Loc san pham">
          <button
            v-for="filter in categoryFilters"
            :key="filter"
            :class="{ active: selectedCategory === filter }"
            type="button"
            @click="selectedCategory = filter"
          >
            {{ filter }}
          </button>
        </div>

        <div class="product-layout">
          <div class="product-grid">
            <article v-for="product in filteredProducts" :key="product.id" class="product-card">
              <div class="product-visual" :style="{ '--accent': product.color }">
                <span>{{ product.tag }}</span>
              </div>
              <div class="product-info">
                <p>{{ product.category }}</p>
                <h3>{{ product.name }}</h3>
                <strong>{{ formatCurrency(product.price) }}</strong>
              </div>
              <button type="button" @click="addToCart(product)">Them vao gio</button>
            </article>
          </div>

          <aside class="cart-summary">
            <p class="eyebrow">Gio hang</p>
            <h2>{{ cartItems.length }} san pham</h2>
            <p class="cart-total">{{ formatCurrency(cartTotal) }}</p>
            <ul v-if="cartItems.length">
              <li v-for="(item, index) in cartItems" :key="`${item.id}-${index}`">
                {{ item.name }}
              </li>
            </ul>
            <p v-else class="empty-cart">Chua co san pham nao trong gio.</p>
          </aside>
        </div>
      </section>

      <section id="profile" class="section profile-section">
        <div class="section-heading">
          <p class="eyebrow">Profile</p>
          <h2>Tai khoan khach hang</h2>
        </div>

        <div v-if="currentUser" class="profile-layout">
          <aside class="profile-card">
            <div class="avatar">{{ currentUser.name.charAt(0).toUpperCase() }}</div>
            <h3>{{ currentUser.name }}</h3>
            <p>{{ currentUser.email }}</p>
            <span>{{ currentUser.membership }}</span>
            <button type="button" @click="logout">Dang xuat</button>
          </aside>

          <form class="profile-form" @submit.prevent="saveProfile">
            <div class="field">
              <label for="profile-name">Ho ten</label>
              <input id="profile-name" v-model="profileForm.name" autocomplete="name" />
            </div>
            <div class="field">
              <label for="profile-email">Email</label>
              <input id="profile-email" v-model="profileForm.email" autocomplete="email" type="email" />
            </div>
            <div class="field">
              <label for="profile-sport">Mon the thao yeu thich</label>
              <select id="profile-sport" v-model="profileForm.sport">
                <option>Gym & Fitness</option>
                <option>Giay chay bo</option>
                <option>Bong da</option>
                <option>Bong ro</option>
              </select>
            </div>
            <div class="field">
              <label for="profile-address">Dia chi giao hang</label>
              <input id="profile-address" v-model="profileForm.address" autocomplete="street-address" />
            </div>
            <button type="submit">Luu profile</button>
          </form>
        </div>

        <div v-else class="profile-empty">
          <h3>Dang nhap de quan ly profile</h3>
          <p>
            Sau khi login/register, thong tin tai khoan se hien tai day. Backend co
            the thay the mock state bang API profile that.
          </p>
          <button type="button" @click="openAuthPanel">Login / Register</button>
        </div>
      </section>

      <section id="backend" class="section backend-section">
        <div class="section-heading">
          <p class="eyebrow">API</p>
          <h2>Kiem tra ket noi backend</h2>
        </div>
        <BackendConnectionTest />
      </section>
    </main>
  </div>
</template>
