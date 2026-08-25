<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch
} from 'vue'
import { RouterLink } from 'vue-router'
import heroImage from '../assets/sports-store-hero.png'
import PaginationNav from '../components/PaginationNav.vue'
import ProductGrid from '../components/ProductGrid.vue'
import ProductTurntable from '../components/ProductTurntable.vue'
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
const homeRoot = ref(null)
const selectedCategory = ref('all')
const selectedBrand = ref('all')
const rawProducts = ref([])
const catalogProducts = ref([])
const productFacets = ref({ categories: [], brands: [] })
const homePagination = ref({
  currentPage: 1,
  pageSize: 12,
  totalItems: 0,
  totalPages: 0,
  hasPreviousPage: false,
  hasNextPage: false
})
const loading = ref(true)
const productLoadError = ref('')
let revealObserver
let animationFrame
let reducedMotionQuery
const observedElements = new WeakSet()
const bestSellerNames = Object.freeze([
  'Adidas Adizero EVO SL Crystal White',
  'Xtep 2000KM 5.0 Nam',
  'Motive Men Race Singlet 49g',
  'Quần Shorts Chạy Bộ 5 inch Essentials',
  'T8 Men’s Iced Tee',
  'T8 Men’s Sherpa Shorts'
])

const categoryCards = computed(() =>
  categories.map((category) => ({
    ...category,
    count: productFacets.value.categories.find(
      (item) => item.value === category.value
    )?.count || 0
  }))
)

const visibleProducts = computed(() => {
  const selectedDefinition = categories.find(
    (category) => category.value === selectedCategory.value
  )

  return mapApiProducts(catalogProducts.value, {
    fromCategory: selectedDefinition?.slug
  })
})

const cartTotal = computed(() =>
  props.cartItems.reduce((total, product) => total + product.price, 0)
)

const mappedProducts = computed(() => mapApiProducts(rawProducts.value))
const bestSellerProducts = computed(() => [...mappedProducts.value]
  .filter((product) => product.imageUrl && product.detailRoute && bestSellerNames.includes(product.name))
  .sort((left, right) => bestSellerNames.indexOf(left.name) - bestSellerNames.indexOf(right.name))
  .map((product) => ({
    ...product,
    spinSpriteUrl: /adizero evo sl crystal white/i.test(product.name)
        ? '/products/turntable/runstore-black-shoe-8-angle.png'
        : '',
    spinVideoUrl: /adizero evo sl crystal white/i.test(product.name)
      ? '/products/turntable/adidas-evo-sl-loop.mp4'
      : '',
    spinAccent: /xtep/i.test(product.name) ? '#ff6846' : '#b9f25d',
    spinTilt: '0deg',
    spinAspect: 0.889
  }))
)
const brandOptions = computed(() => {
  const groupedBrands = new Map()

  productFacets.value.brands.forEach((brand) => {
    const key = normalizeBrand(brand.value)
    if (!key) return
    const current = groupedBrands.get(key)
    groupedBrands.set(key, {
      key,
      label: key === 'coolmate' ? 'Coolmate' : current?.label || brand.value.trim(),
      count: (current?.count || 0) + brand.count
    })
  })

  const options = [...groupedBrands.values()]
  return options.length
    ? options
    : ['Adidas', 'Xtep', 'Coolmate', 'T8', 'Motive'].map((label) => ({
        key: normalizeBrand(label),
        label,
        count: 0
      }))
})
const selectedBrandLabel = computed(() =>
  brandOptions.value.find((brand) => brand.key === selectedBrand.value)?.label || ''
)

function normalizeBrand(brand) {
  return String(brand || '').trim().toLocaleLowerCase('vi').replace(/\s+/g, '')
}

async function selectBrand(brandKey) {
  selectedBrand.value = selectedBrand.value === brandKey ? 'all' : brandKey
  await loadCatalogProducts(1)
  await nextTick()
  document.querySelector('#products')?.scrollIntoView({
    behavior: reducedMotionQuery?.matches ? 'auto' : 'smooth',
    block: 'start'
  })
}

async function clearBrand() {
  selectedBrand.value = 'all'
  await loadCatalogProducts(1)
}

async function selectCategory(category) {
  selectedCategory.value = category
  await loadCatalogProducts(1)
}

function updatePointerEffects(event) {
  if (!homeRoot.value || reducedMotionQuery?.matches) return

  const x = (event.clientX / Math.max(window.innerWidth, 1) - 0.5) * 2
  const y = (event.clientY / Math.max(window.innerHeight, 1) - 0.5) * 2
  homeRoot.value.style.setProperty('--scene-rotate-x', `${(-y * 3).toFixed(2)}deg`)
  homeRoot.value.style.setProperty('--scene-rotate-y', `${(x * 5).toFixed(2)}deg`)
  homeRoot.value.style.setProperty('--pointer-near-x', `${(x * 15).toFixed(1)}px`)
  homeRoot.value.style.setProperty('--pointer-near-y', `${(y * 12).toFixed(1)}px`)
  homeRoot.value.style.setProperty('--pointer-far-x', `${(x * -11).toFixed(1)}px`)
  homeRoot.value.style.setProperty('--pointer-far-y', `${(y * -9).toFixed(1)}px`)
}

function resetPointerEffects() {
  homeRoot.value?.style.setProperty('--scene-rotate-x', '0deg')
  homeRoot.value?.style.setProperty('--scene-rotate-y', '0deg')
  homeRoot.value?.style.setProperty('--pointer-near-x', '0px')
  homeRoot.value?.style.setProperty('--pointer-near-y', '0px')
  homeRoot.value?.style.setProperty('--pointer-far-x', '0px')
  homeRoot.value?.style.setProperty('--pointer-far-y', '0px')
}

function observeRevealElements() {
  if (!revealObserver || !homeRoot.value) return

  homeRoot.value.querySelectorAll('[data-reveal]').forEach((element) => {
    if (!observedElements.has(element)) {
      observedElements.add(element)
      revealObserver.observe(element)
    }
  })
}

function updateScrollEffects() {
  animationFrame = undefined
  if (!homeRoot.value || reducedMotionQuery?.matches) return

  const heroProgress = Math.min(window.scrollY / Math.max(window.innerHeight, 1), 1)
  homeRoot.value.style.setProperty('--hero-scroll', heroProgress.toFixed(3))
  homeRoot.value.style.setProperty('--hero-scroll-offset', `${(-heroProgress * 28).toFixed(2)}px`)
}

function requestScrollUpdate() {
  if (!animationFrame) {
    animationFrame = requestAnimationFrame(updateScrollEffects)
  }
}

async function loadProducts() {
  loading.value = true
  productLoadError.value = ''

  try {
    const [catalogResponse, ...bestSellerResponses] = await Promise.all([
      getProducts({ page: 1, limit: 12, sort: 'featured' }),
      ...bestSellerNames.map((name) => getProducts({
        search: name,
        page: 1,
        limit: 1,
        sort: 'featured'
      }))
    ])
    const productById = new Map()
    bestSellerResponses.forEach((response) => {
      response.data.forEach((product) => productById.set(product.id, product))
    })
    rawProducts.value = [...productById.values()]
    catalogProducts.value = catalogResponse.data
    productFacets.value = catalogResponse.facets || { categories: [], brands: [] }
    homePagination.value = catalogResponse.pagination
  } catch (error) {
    rawProducts.value = []
    catalogProducts.value = []
    productLoadError.value = error.message
  } finally {
    loading.value = false
  }
}

async function loadCatalogProducts(page) {
  loading.value = true
  productLoadError.value = ''

  try {
    const brand = brandOptions.value.find(
      (option) => option.key === selectedBrand.value
    )?.label
    const response = await getProducts({
      category: selectedCategory.value === 'all' ? undefined : selectedCategory.value,
      brand: selectedBrand.value === 'all' ? undefined : brand,
      page,
      limit: 12,
      sort: 'featured'
    })
    catalogProducts.value = response.data
    homePagination.value = response.pagination
  } catch (error) {
    catalogProducts.value = []
    productLoadError.value = error.message
  } finally {
    loading.value = false
  }
}

async function goToHomePage(page) {
  await loadCatalogProducts(page)
  await nextTick()
  document.querySelector('#products')?.scrollIntoView({
    behavior: reducedMotionQuery?.matches ? 'auto' : 'smooth',
    block: 'start'
  })
}

watch(
  () => [loading.value, selectedCategory.value],
  () => nextTick(observeRevealElements)
)

onMounted(() => {
  reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible')
        revealObserver.unobserve(entry.target)
      }
    })
  }, {
    threshold: 0.14,
    rootMargin: '0px 0px -8%'
  })

  observeRevealElements()
  window.addEventListener('scroll', requestScrollUpdate, { passive: true })
  window.addEventListener('resize', requestScrollUpdate)
  reducedMotionQuery.addEventListener('change', requestScrollUpdate)
  requestScrollUpdate()
  loadProducts()
})

onBeforeUnmount(() => {
  revealObserver?.disconnect()
  window.removeEventListener('scroll', requestScrollUpdate)
  window.removeEventListener('resize', requestScrollUpdate)
  reducedMotionQuery?.removeEventListener('change', requestScrollUpdate)
  if (animationFrame) cancelAnimationFrame(animationFrame)
})
</script>

<template>
  <main
    ref="homeRoot"
    class="home-page"
    @pointermove="updatePointerEffects"
    @pointerleave="resetPointerEffects"
  >
    <section class="hero home-hero home-hero--classic">
      <img :src="heroImage" alt="Không gian trưng bày giày và trang phục chạy bộ" />
      <div class="home-hero__grid" aria-hidden="true"></div>
      <div class="home-hero__orb" aria-hidden="true"></div>
      <div class="hero-content">
        <p class="eyebrow">RunStore · Move beyond</p>
        <h1>
          Trang bị tốt hơn.<br />
          <em>Chạy xa hơn.</em>
        </h1>
        <p>
          Từ buổi chạy đầu tiên đến vạch đích marathon — tìm đúng đôi giày,
          trang phục và phụ kiện dành cho nhịp chạy của bạn.
        </p>
        <div class="hero-actions">
          <RouterLink class="primary-action" to="/products">
            Mua ngay
          </RouterLink>
          <RouterLink class="secondary-action" to="/categories">
            Xem danh mục
          </RouterLink>
        </div>
        <dl class="home-hero__stats" aria-label="Thông tin cửa hàng">
          <div><dt>{{ homePagination.totalItems || '20+' }}</dt><dd>Sản phẩm chọn lọc</dd></div>
          <div><dt>{{ brandOptions.length }}</dt><dd>Thương hiệu chạy bộ</dd></div>
          <div><dt>4</dt><dd>Nhóm trang bị</dd></div>
        </dl>
      </div>
      <a class="home-scroll-cue" href="#home-intro" aria-label="Cuộn xuống khám phá">
        <span>Scroll to run</span><i aria-hidden="true"></i>
      </a>
    </section>

    <section class="home-brand-showcase" aria-labelledby="brand-showcase-title">
      <p id="brand-showcase-title">Selected running brands</p>
      <div class="home-brand-grid">
        <button
          v-for="brand in brandOptions"
          :key="brand.key"
          type="button"
          :class="{ 'is-active': selectedBrand === brand.key }"
          :aria-pressed="selectedBrand === brand.key"
          :aria-label="`Lọc ${brand.count} sản phẩm thương hiệu ${brand.label}`"
          @click="selectBrand(brand.key)"
        >
          <i aria-hidden="true">{{ brand.label.slice(0, 1) }}</i>
          <span><strong>{{ brand.label }}</strong><small>{{ brand.count }} sản phẩm</small></span>
          <b aria-hidden="true">→</b>
        </button>
      </div>
    </section>

    <section id="home-intro" class="section home-intro" data-reveal>
      <p class="eyebrow">Find your rhythm</p>
      <div class="home-intro__layout">
        <h2>Mỗi cung đường cần một bộ trang bị <em>đúng nhịp.</em></h2>
        <p>
          RunStore gom những lựa chọn thiết thực cho road, trail và race day
          vào một trải nghiệm mua sắm gọn, rõ và đầy cảm hứng.
        </p>
      </div>
    </section>

    <section id="categories" class="section home-categories" data-reveal>
      <div class="section-heading">
        <p class="eyebrow">01 · Chọn cung đường</p>
        <h2>Trang bị cho từng chuyển động</h2>
      </div>
      <div class="category-grid">
        <RouterLink
          v-for="(category, index) in categoryCards"
          :key="category.slug"
          class="category-card"
          :style="{ '--reveal-index': index }"
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

    <ProductTurntable :products="bestSellerProducts" />

    <section id="products" class="section product-section home-products" data-reveal>
      <div class="section-heading">
        <p class="eyebrow">03 · Gear up</p>
        <h2>Đang có mặt tại RunStore</h2>
        <div v-if="selectedBrand !== 'all'" class="home-products__active-filter" role="status">
          <span>Đang xem thương hiệu <strong>{{ selectedBrandLabel }}</strong></span>
          <button type="button" @click="clearBrand">Bỏ lọc ×</button>
        </div>
      </div>

      <div class="filters" aria-label="Lọc sản phẩm">
        <button
          :class="{ active: selectedCategory === 'all' }"
          type="button"
          @click="selectCategory('all')"
        >
          Tất cả sản phẩm
        </button>
        <button
          v-for="category in categories"
          :key="category.value"
          :class="{ active: selectedCategory === category.value }"
          type="button"
          @click="selectCategory(category.value)"
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
        <div v-else class="home-products__catalog">
          <ProductGrid
            :products="visibleProducts"
            empty-title="Chưa có sản phẩm"
            empty-message="Danh mục này hiện chưa có sản phẩm đang hoạt động."
            @add-to-cart="emit('add-to-cart', $event)"
          />
          <PaginationNav
            :pagination="homePagination"
            :disabled="loading"
            @change="goToHomePage"
          />
        </div>

        <aside class="cart-summary">
          <p class="eyebrow">Giỏ hàng</p>
          <h2>{{ cartItems.length }} sản phẩm</h2>
          <p class="cart-total">{{ formatCurrency(cartTotal) }}</p>
          <ul v-if="cartItems.length">
            <li
              v-for="(item, index) in cartItems"
              :key="`${item.catalogKey}-${index}`"
            >
              {{ item.name }} · {{ item.sku }}
            </li>
          </ul>
          <p v-else class="empty-cart">Chưa có sản phẩm nào trong giỏ.</p>
          <RouterLink class="cart-summary-link" to="/cart">
            Xem giỏ hàng
          </RouterLink>
        </aside>
      </div>
    </section>

    <section class="section home-closing" data-reveal>
      <p class="eyebrow">Your next run starts here</p>
      <h2>Sẵn sàng cho cung đường tiếp theo?</h2>
      <RouterLink class="primary-action" to="/products">Bắt đầu khám phá</RouterLink>
    </section>
  </main>
</template>
