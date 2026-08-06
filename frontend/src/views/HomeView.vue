<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import heroImage from '../assets/sports-store-hero.png'
import BackendConnectionTest from '../components/BackendConnectionTest.vue'
import ProductGrid from '../components/ProductGrid.vue'
import { formatCurrency } from '../data/catalog.js'
import { categories } from '../data/categories.js'
import { getProducts } from '../services/productService.js'
import { mapApiProducts } from '../utils/productCatalog.js'

const props = defineProps({
  cartItems: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['add-to-cart'])
const selectedCategory = ref('all')
const rawProducts = ref([])
const loading = ref(true)
const productLoadError = ref('')

const categoryCards = computed(() =>
  categories.map((category) => ({
    ...category,
    count: rawProducts.value.filter(
      (product) => product.category === category.value
    ).length
  }))
)

const visibleProducts = computed(() => {
  const filtered = selectedCategory.value === 'all'
    ? rawProducts.value
    : rawProducts.value.filter(
        (product) => product.category === selectedCategory.value
      )

  const selectedDefinition = categories.find(
    (category) => category.value === selectedCategory.value
  )

  return mapApiProducts(filtered, {
    fromCategory: selectedDefinition?.slug
  })
})

const cartTotal = computed(() =>
  props.cartItems.reduce((total, product) => total + product.price, 0)
)

async function loadProducts() {
  loading.value = true
  productLoadError.value = ''

  try {
    const response = await getProducts()
    rawProducts.value = response.data
  } catch (error) {
    rawProducts.value = []
    productLoadError.value = error.message
  } finally {
    loading.value = false
  }
}

onMounted(loadProducts)
</script>

<template>
  <main>
    <section class="hero">
      <img :src="heroImage" alt="Bộ sưu tập đồ chạy bộ trên kệ trưng bày" />
      <div class="hero-content">
        <p class="eyebrow">Running essentials</p>
        <h1>Trang bị tốt hơn cho mỗi bước chạy.</h1>
        <p>
          Giày, trang phục và phụ kiện chạy bộ được cập nhật trực tiếp từ cửa hàng.
        </p>
        <div class="hero-actions">
          <RouterLink class="primary-action" to="/products">
            Mua ngay
          </RouterLink>
          <RouterLink class="secondary-action" to="/categories">
            Xem danh mục
          </RouterLink>
        </div>
      </div>
    </section>

    <section id="categories" class="section">
      <div class="section-heading">
        <p class="eyebrow">Danh mục</p>
        <h2>Chọn trang bị cho buổi chạy</h2>
      </div>
      <div class="category-grid">
        <RouterLink
          v-for="category in categoryCards"
          :key="category.slug"
          class="category-card"
          :to="{
            name: 'category',
            params: { slug: category.slug }
          }"
        >
          <span>{{ category.count }} sản phẩm</span>
          <h3>{{ category.name }}</h3>
          <p>{{ category.description }}</p>
        </RouterLink>
      </div>
    </section>

    <section id="products" class="section product-section">
      <div class="section-heading">
        <p class="eyebrow">Sản phẩm</p>
        <h2>Sản phẩm đang bán</h2>
      </div>

      <div class="filters" aria-label="Lọc sản phẩm">
        <button
          :class="{ active: selectedCategory === 'all' }"
          type="button"
          @click="selectedCategory = 'all'"
        >
          Tất cả sản phẩm
        </button>
        <button
          v-for="category in categories"
          :key="category.value"
          :class="{ active: selectedCategory === category.value }"
          type="button"
          @click="selectedCategory = category.value"
        >
          {{ category.name }}
        </button>
      </div>

      <p v-if="productLoadError" class="result error">
        Không thể tải sản phẩm: {{ productLoadError }}
      </p>

      <div class="product-layout">
        <div v-if="loading" class="catalog-empty" role="status">
          <h3>Đang tải sản phẩm...</h3>
        </div>
        <ProductGrid
          v-else
          :products="visibleProducts"
          empty-title="Chưa có sản phẩm"
          empty-message="Danh mục này hiện chưa có sản phẩm đang hoạt động."
          @add-to-cart="emit('add-to-cart', $event)"
        />

        <aside class="cart-summary">
          <p class="eyebrow">Giỏ hàng</p>
          <h2>{{ cartItems.length }} sản phẩm</h2>
          <p class="cart-total">{{ formatCurrency(cartTotal) }}</p>
          <ul v-if="cartItems.length">
            <li
              v-for="(item, index) in cartItems"
              :key="`${item.id}-${index}`"
            >
              {{ item.name }}
            </li>
          </ul>
          <p v-else class="empty-cart">Chưa có sản phẩm nào trong giỏ.</p>
          <RouterLink class="cart-summary-link" to="/cart">
            Xem giỏ hàng
          </RouterLink>
        </aside>
      </div>
    </section>

    <section id="backend" class="section backend-section">
      <div class="section-heading">
        <p class="eyebrow">API</p>
        <h2>Kiểm tra kết nối backend</h2>
      </div>
      <BackendConnectionTest />
    </section>
  </main>
</template>
