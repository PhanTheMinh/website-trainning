<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import ProductGrid from '../components/ProductGrid.vue'
import { sortProducts } from '../data/catalog.js'
import { categories } from '../data/categories.js'
import { getProducts } from '../services/productService.js'
import { mapApiProducts } from '../utils/productCatalog.js'

const emit = defineEmits(['add-to-cart'])
const categoryResults = ref({})
const loading = ref(true)
const loadError = ref('')

const categoryGroups = computed(() =>
  categories.map((category) => {
    const result = categoryResults.value[category.value] || {
      count: 0,
      products: []
    }

    return {
      ...category,
      count: result.count,
      products: result.products
    }
  })
)

async function loadProducts() {
  loading.value = true
  loadError.value = ''

  try {
    const responses = await Promise.all(categories.map((category) =>
      getProducts({ category: category.value, page: 1, limit: 3 })
    ))
    categoryResults.value = Object.fromEntries(
      categories.map((category, index) => [
        category.value,
        {
          count: responses[index].pagination.totalItems,
          products: sortProducts(mapApiProducts(responses[index].data, {
            fromCategory: category.slug
          }))
        }
      ])
    )
  } catch (error) {
    categoryResults.value = {}
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
        <p class="eyebrow">Categories</p>
        <h1>Running categories</h1>
        <p>Find the right products for your run.</p>
      </div>

      <div class="category-pills" aria-label="Category navigation">
        <RouterLink to="/products">All products</RouterLink>
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
        <h3>Loading categories...</h3>
      </div>

      <div v-else-if="loadError" class="catalog-empty">
        <h3>Could not load categories</h3>
        <p>{{ loadError }}</p>
        <button type="button" @click="loadProducts">Try again</button>
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
            <span>{{ group.count }} products</span>
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
              <p class="eyebrow">{{ group.count }} products</p>
              <h2>{{ group.name }}</h2>
            </div>
            <RouterLink
              :to="{
                name: 'category',
                params: { slug: group.slug }
              }"
            >
              View category
            </RouterLink>
          </div>
          <ProductGrid
            :products="group.products"
            @add-to-cart="emit('add-to-cart', $event)"
          />
        </section>

        <div v-if="!categoryGroups.some((group) => group.count)" class="catalog-empty category-overview-empty">
          <h3>No products yet</h3>
          <p>Products will appear here when available.</p>
          <RouterLink to="/products">View all products</RouterLink>
        </div>
      </template>
    </section>
  </main>
</template>
