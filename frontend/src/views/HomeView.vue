<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import heroImage from '../assets/sports-store-hero.png'
import ProductGrid from '../components/ProductGrid.vue'
import { categories } from '../data/categories.js'
import { getProducts } from '../services/productService.js'
import { mapApiProducts } from '../utils/productCatalog.js'

defineProps({
  cartItems: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['add-to-cart'])
const rawProducts = ref([])
const categoryFacets = ref([])
const loading = ref(true)
const loadError = ref('')

const featuredProducts = computed(() => mapApiProducts(rawProducts.value))
const categoryCards = computed(() => categories.map((category) => ({
  ...category,
  count: categoryFacets.value.find((item) => item.value === category.value)?.count || 0
})))

async function loadOverview() {
  loading.value = true
  loadError.value = ''

  try {
    const response = await getProducts({ page: 1, limit: 6, sort: 'featured' })
    rawProducts.value = response.data
    categoryFacets.value = response.facets?.categories || []
  } catch (error) {
    rawProducts.value = []
    categoryFacets.value = []
    loadError.value = error.message || 'Could not load products.'
  } finally {
    loading.value = false
  }
}

onMounted(loadOverview)
</script>

<template>
  <main class="home-overview-page">
    <section class="home-overview-hero">
      <img :src="heroImage" alt="Running shoes and apparel at RunStore" />
      <div class="home-overview-hero__shade" aria-hidden="true"></div>
      <div class="home-overview-hero__content">
        <p>RunStore</p>
        <h1>Gear for every step.</h1>
        <span>Shoes, apparel and accessories for your everyday training.</span>
        <div class="home-overview-actions">
          <RouterLink class="home-overview-action home-overview-action--primary" to="/products">
            Shop products
          </RouterLink>
          <RouterLink class="home-overview-action" to="/categories">
            Browse categories
          </RouterLink>
        </div>
      </div>
    </section>

    <section class="home-overview-intro">
      <p>RunStore brings together the essentials for runners, from your first run to your next big goal.</p>
      <RouterLink to="/products">Explore the store →</RouterLink>
    </section>

    <section class="home-overview-section home-overview-categories" aria-labelledby="home-category-title">
      <header class="home-overview-heading">
        <h2 id="home-category-title">Shop by category</h2>
        <RouterLink to="/categories">View all</RouterLink>
      </header>

      <div class="home-overview-category-grid">
        <RouterLink
          v-for="category in categoryCards"
          :key="category.slug"
          :to="{ name: 'category', params: { slug: category.slug } }"
        >
          <h3>{{ category.name }}</h3>
          <span>{{ loading ? 'Loading' : `${category.count} products` }}</span>
        </RouterLink>
      </div>
    </section>

    <section class="home-overview-section home-overview-products" aria-labelledby="home-product-title">
      <header class="home-overview-heading">
        <h2 id="home-product-title">Featured products</h2>
        <RouterLink to="/products">Shop all</RouterLink>
      </header>

      <div v-if="loading" class="home-overview-state" role="status">Loading products...</div>
      <div v-else-if="loadError" class="home-overview-state home-overview-state--error">
        <p>{{ loadError }}</p>
        <button type="button" @click="loadOverview">Try again</button>
      </div>
      <ProductGrid
        v-else
        :products="featuredProducts"
        empty-title="No products yet"
        empty-message="Featured products will be available soon."
        @add-to-cart="emit('add-to-cart', $event)"
      />
    </section>

    <section class="home-overview-footer">
      <h2>Ready to get started?</h2>
      <RouterLink class="home-overview-action home-overview-action--primary" to="/products">
        Visit the store
      </RouterLink>
    </section>
  </main>
</template>

<style scoped>
.home-overview-page { background: var(--rs-page); color: var(--rs-text); }
.home-overview-hero { min-height: min(660px, calc(100svh - 74px)); overflow: hidden; position: relative; }
.home-overview-hero > img, .home-overview-hero__shade { height: 100%; inset: 0; position: absolute; width: 100%; }
.home-overview-hero > img { object-fit: cover; object-position: center; }
.home-overview-hero__shade { background: linear-gradient(90deg, color-mix(in srgb, var(--rs-surface) 98%, transparent), color-mix(in srgb, var(--rs-surface) 88%, transparent) 34%, color-mix(in srgb, var(--rs-surface) 12%, transparent) 72%); }
.home-overview-hero__content { align-content: center; display: grid; min-height: inherit; padding: clamp(48px, 7vw, 92px) clamp(18px, 6vw, 80px); position: relative; width: min(700px, 62%); z-index: 1; }
.home-overview-hero__content > p { color: var(--rs-link); font-size: .76rem; font-weight: 900; letter-spacing: .14em; margin-bottom: 12px; text-transform: uppercase; }
.home-overview-hero h1 { color: var(--rs-text); font-size: clamp(3rem, 6vw, 6.2rem); letter-spacing: -.055em; line-height: .98; margin: 0 0 20px; max-width: 9ch; }
.home-overview-hero__content > span { color: var(--rs-muted); font-size: 1rem; line-height: 1.65; max-width: 510px; }
.home-overview-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 28px; }
.home-overview-action { border: 1px solid var(--rs-border); border-radius: 6px; color: var(--rs-text); display: inline-flex; font-size: .88rem; font-weight: 850; justify-content: center; padding: 12px 18px; text-decoration: none; }
.home-overview-action--primary { background: var(--rs-solid); color: var(--rs-on-solid); }
.home-overview-intro { align-items: center; background: var(--rs-surface); border-block: 1px solid var(--rs-border); display: flex; gap: 30px; justify-content: space-between; padding: 34px clamp(18px, 6vw, 80px); }
.home-overview-intro p { color: var(--rs-text); line-height: 1.65; margin: 0; max-width: 760px; }
.home-overview-intro a, .home-overview-heading a { color: var(--rs-text); flex-shrink: 0; font-size: .84rem; font-weight: 850; }
.home-overview-section { padding: clamp(64px, 7vw, 92px) clamp(18px, 6vw, 80px); }
.home-overview-categories { background: var(--rs-surface); }
.home-overview-products { background: var(--rs-surface); border-block: 1px solid var(--rs-border); }
.home-overview-heading { align-items: center; display: flex; justify-content: space-between; margin-bottom: 28px; }
.home-overview-heading h2 { font-size: clamp(1.8rem, 3.2vw, 2.8rem); letter-spacing: -.035em; margin: 0; }
.home-overview-category-grid { display: grid; gap: 14px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
.home-overview-category-grid a { border: 1px solid var(--rs-border); border-radius: 10px; min-height: 150px; padding: 20px; transition: border-color 160ms ease, transform 160ms ease; }
.home-overview-category-grid a:hover, .home-overview-category-grid a:focus-visible { border-color: var(--rs-border); transform: translateY(-3px); }
.home-overview-category-grid h3 { color: var(--rs-text); font-size: 1.15rem; margin: 0 0 8px; }
.home-overview-category-grid span { color: var(--rs-muted); font-size: .78rem; }
.home-overview-state { background: var(--rs-surface); border: 1px solid var(--rs-border); border-radius: 10px; color: var(--rs-muted); padding: 30px; text-align: center; }
.home-overview-state p { margin-bottom: 12px; }
.home-overview-state button { background: var(--rs-solid); border: 0; border-radius: 6px; color: var(--rs-on-solid); font-weight: 800; padding: 9px 14px; }
.home-overview-footer { align-items: center; display: flex; justify-content: space-between; padding: 52px clamp(18px, 6vw, 80px); }
.home-overview-footer h2 { font-size: clamp(1.7rem, 3vw, 2.5rem); margin: 0; }

@media (max-width: 820px) {
  .home-overview-hero { min-height: 620px; }
  .home-overview-hero__content { width: min(620px, 82%); }
  .home-overview-category-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 560px) {
  .home-overview-hero__shade { background: color-mix(in srgb, var(--rs-surface) 84%, transparent); }
  .home-overview-hero__content { width: 100%; }
  .home-overview-intro, .home-overview-footer { align-items: flex-start; flex-direction: column; }
  .home-overview-category-grid { grid-template-columns: 1fr; }
  .home-overview-heading { align-items: flex-start; gap: 10px; }
}
</style>
