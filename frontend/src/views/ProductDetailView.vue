<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { formatCurrency } from '../data/catalog.js'
import {
  getCategoryBySlug,
  getCategoryName
} from '../data/categories.js'
import { API_BASE_URL } from '../services/apiClient.js'
import { getProduct } from '../services/productService.js'

const emit = defineEmits(['add-to-cart'])
const route = useRoute()
const product = ref(null)
const loading = ref(true)
const loadError = ref('')
const selectedImageUrl = ref('')

const sourceCategory = computed(() =>
  getCategoryBySlug(String(route.query.fromCategory || ''))
)

const backRoute = computed(() =>
  sourceCategory.value
    ? {
        name: 'category',
        params: { slug: sourceCategory.value.slug }
      }
    : { name: 'products' }
)

const categoryName = computed(() =>
  product.value ? getCategoryName(product.value.category) : ''
)

const imageUrls = computed(() =>
  (product.value?.images || []).map((image) => ({
    ...image,
    absoluteUrl: new URL(image.image_url, API_BASE_URL).toString()
  }))
)

const mainImageUrl = computed(
  () => selectedImageUrl.value || imageUrls.value[0]?.absoluteUrl || ''
)

async function loadProduct(productId) {
  loading.value = true
  loadError.value = ''
  product.value = null
  selectedImageUrl.value = ''

  try {
    const response = await getProduct(productId)
    product.value = response.data
  } catch (error) {
    loadError.value = error.message
  } finally {
    loading.value = false
  }
}

function addProductToCart() {
  if (!product.value || product.value.stock <= 0) {
    return
  }

  emit('add-to-cart', {
    id: product.value.id,
    catalogKey: `database-product-${product.value.id}`,
    name: product.value.title,
    category: categoryName.value,
    categoryValue: product.value.category,
    price: product.value.price,
    tag: 'Mới đăng',
    color: '#0f766e',
    image_url: product.value.images[0]?.image_url || null
  })
}

watch(
  () => route.params.id,
  (productId) => loadProduct(productId),
  {
    immediate: true
  }
)
</script>

<template>
  <main class="product-detail-page">
    <section class="section">
      <RouterLink class="profile-back" :to="backRoute">
        ← {{ sourceCategory ? `Quay lại ${sourceCategory.name}` : 'Quay lại sản phẩm' }}
      </RouterLink>

      <p
        v-if="route.query.created === '1'"
        class="account-notice account-notice--success product-created-notice"
        role="status"
      >
        Sản phẩm đã được tạo thành công và đang hiển thị trên cửa hàng.
      </p>

      <div v-if="loading" class="profile-empty">
        <h3>Đang tải sản phẩm...</h3>
      </div>

      <div v-else-if="loadError" class="profile-empty">
        <h3>Không thể tải sản phẩm</h3>
        <p>{{ loadError }}</p>
        <RouterLink to="/products">Xem danh sách sản phẩm</RouterLink>
      </div>

      <article v-else-if="product" class="product-detail-layout">
        <div class="product-detail-gallery">
          <div class="product-detail-main-image">
            <img
              :src="mainImageUrl"
              :alt="product.title"
            />
          </div>
          <div
            v-if="imageUrls.length > 1"
            class="product-detail-thumbnails"
          >
            <button
              v-for="image in imageUrls"
              :key="image.id"
              type="button"
              :class="{ active: mainImageUrl === image.absoluteUrl }"
              @click="selectedImageUrl = image.absoluteUrl"
            >
              <img :src="image.absoluteUrl" :alt="product.title" />
            </button>
          </div>
        </div>

        <div class="product-detail-content">
          <p class="eyebrow">{{ categoryName }}</p>
          <h1>{{ product.title }}</h1>
          <strong class="product-detail-price">
            {{ formatCurrency(product.price) }}
          </strong>
          <p class="product-detail-owner">
            Đăng bởi <b>{{ product.owner.full_name }}</b>
          </p>
          <p class="product-detail-description">
            {{ product.description }}
          </p>

          <dl class="product-detail-facts">
            <div>
              <dt>Tồn kho</dt>
              <dd>{{ product.stock }} sản phẩm</dd>
            </div>
            <div v-if="product.weight_grams">
              <dt>Cân nặng</dt>
              <dd>{{ product.weight_grams }} gram</dd>
            </div>
            <div v-if="product.sizes.length">
              <dt>Size</dt>
              <dd>{{ product.sizes.join(', ') }}</dd>
            </div>
            <div v-if="product.colors.length">
              <dt>Màu sắc</dt>
              <dd>{{ product.colors.join(', ') }}</dd>
            </div>
          </dl>

          <button
            class="product-detail-cart"
            type="button"
            :disabled="product.stock <= 0"
            @click="addProductToCart"
          >
            {{ product.stock > 0 ? 'Thêm vào giỏ' : 'Đã hết hàng' }}
          </button>
        </div>
      </article>
    </section>
  </main>
</template>
