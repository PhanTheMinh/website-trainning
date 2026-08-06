<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import ProductGrid from '../components/ProductGrid.vue'
import { sortProducts } from '../data/catalog.js'
import { categories } from '../data/categories.js'
import { getProducts } from '../services/productService.js'
import { mapApiProducts } from '../utils/productCatalog.js'

const emit = defineEmits(['add-to-cart'])
const rawProducts = ref([])
const loading = ref(true)
const loadError = ref('')

const categoryGroups = computed(() =>
  categories.map((category) => {
    const matchingProducts = rawProducts.value.filter(
      (product) => product.category === category.value
    )

    return {
      ...category,
      count: matchingProducts.length,
      products: sortProducts(
        mapApiProducts(matchingProducts, {
          fromCategory: category.slug
        })
      )
    }
  })
)

async function loadProducts() {
  loading.value = true
  loadError.value = ''

  try {
    const response = await getProducts()
    rawProducts.value = response.data
  } catch (error) {
    rawProducts.value = []
    loadError.value = error.message
  } finally {
    loading.value = false
  }
}

onMounted(loadProducts)
</script>

<template>
  <main class="catalog-page">
    <section class="section catalog-hero">
      <div class="section-heading">
        <p class="eyebrow">Danh mục</p>
        <h1>Danh mục chạy bộ</h1>
        <p>
          Chọn đúng nhóm sản phẩm. Số lượng bên dưới được tính từ các sản phẩm
          đang hoạt động trong hệ thống.
        </p>
      </div>

      <div class="category-pills" aria-label="Điều hướng danh mục">
        <RouterLink to="/products">Tất cả sản phẩm</RouterLink>
        <RouterLink
          v-for="category in categories"
          :key="category.slug"
          :to="{
            name: 'category',
            params: { slug: category.slug }
          }"
        >
          {{ category.name }}
        </RouterLink>
      </div>

      <div v-if="loading" class="catalog-empty" role="status">
        <h3>Đang tải danh mục...</h3>
      </div>

      <div v-else-if="loadError" class="catalog-empty">
        <h3>Không thể tải dữ liệu danh mục</h3>
        <p>{{ loadError }}</p>
        <button type="button" @click="loadProducts">Thử lại</button>
      </div>

      <template v-else>
        <div class="category-grid category-overview-grid">
          <RouterLink
            v-for="group in categoryGroups"
            :key="group.slug"
            class="category-card"
            :style="{ '--category-accent': group.accent }"
            :to="{
              name: 'category',
              params: { slug: group.slug }
            }"
          >
            <span>{{ group.count }} sản phẩm</span>
            <h2>{{ group.name }}</h2>
            <p>{{ group.description }}</p>
          </RouterLink>
        </div>

        <section
          v-for="group in categoryGroups.filter((item) => item.count > 0)"
          :key="`products-${group.slug}`"
          class="category-group"
        >
          <div class="category-group-heading">
            <div>
              <p class="eyebrow">{{ group.count }} sản phẩm</p>
              <h2>{{ group.name }}</h2>
            </div>
            <RouterLink
              :to="{
                name: 'category',
                params: { slug: group.slug }
              }"
            >
              Xem danh mục
            </RouterLink>
          </div>
          <ProductGrid
            :products="group.products"
            @add-to-cart="emit('add-to-cart', $event)"
          />
        </section>

        <div v-if="!rawProducts.length" class="catalog-empty category-overview-empty">
          <h3>Cửa hàng chưa có sản phẩm</h3>
          <p>Các danh mục đã sẵn sàng và sẽ cập nhật ngay khi có sản phẩm mới.</p>
          <RouterLink to="/products">Xem tất cả sản phẩm</RouterLink>
        </div>
      </template>
    </section>
  </main>
</template>
