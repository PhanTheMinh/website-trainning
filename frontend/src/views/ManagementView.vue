<script setup>
import { RouterLink } from 'vue-router'
import ManagementSidebar from '../components/ManagementSidebar.vue'

defineProps({
  currentUser: {
    type: Object,
    default: null
  },
  sessionLoading: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['open-auth'])
</script>

<template>
  <main class="management-page">
    <section class="section management-section">
      <div v-if="sessionLoading" class="profile-empty">
        <h3>Loading management area...</h3>
      </div>

      <div v-else-if="!currentUser" class="profile-empty">
        <h3>Sign in to manage your store</h3>
        <p>Sign in to manage your shop, products and shipping.</p>
        <button type="button" @click="emit('open-auth')">Sign in</button>
      </div>

      <div v-else class="management-layout">
        <ManagementSidebar />

        <div class="management-content">
          <header class="management-hero">
            <h1>Tasks</h1>
          </header>

          <div class="management-cards">
            <RouterLink :to="{ name: 'my-products' }">
              <span class="management-card__index">01</span>
              <small>Management</small>
              <h2>Products</h2>
              <p>Products, prices and stock.</p>
              <strong>View products →</strong>
            </RouterLink>

            <RouterLink class="management-card--accent" :to="{ name: 'shipping-methods' }">
              <span class="management-card__index">02</span>
              <small>Shipping</small>
              <h2>Shipping</h2>
              <p>Methods, countries and rates.</p>
              <strong>Manage shipping →</strong>
            </RouterLink>

            <RouterLink :to="{ name: 'my-shop' }">
              <span class="management-card__index">03</span>
              <small>Configuration</small>
              <h2>Shop</h2>
              <p>Store information and status.</p>
              <strong>Shop settings →</strong>
            </RouterLink>
          </div>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.management-page {
  background: var(--rs-page);
  min-height: calc(100vh - 80px);
}

.management-section {
  padding-block: 26px 48px;
}

.management-layout {
  display: grid;
  gap: 20px;
  grid-template-columns: 260px minmax(0, 1fr);
}

.management-content {
  min-width: 0;
}

.management-hero {
  background: var(--rs-surface);
  border: 1px solid var(--rs-border);
  border-radius: 12px;
  margin-bottom: 14px;
  padding: 14px 16px;
}

.management-hero p,
.management-cards small {
  color: var(--rs-link);
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  margin: 0 0 4px;
  text-transform: uppercase;
}

.management-hero h1 {
  color: var(--rs-text);
  flex-shrink: 0;
  font-size: 1.25rem;
  margin: 0;
  white-space: nowrap;
}

.management-cards {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.management-cards a {
  background: var(--rs-surface);
  border: 1px solid var(--rs-border);
  border-radius: 12px;
  color: var(--rs-text);
  min-height: 160px;
  padding: 18px;
  position: relative;
  text-decoration: none;
  transition: transform 180ms ease, box-shadow 180ms ease;
}

.management-cards a:hover,
.management-cards a:focus-visible {
  box-shadow: 0 18px 45px rgba(10, 37, 51, 0.1);
  transform: translateY(-3px);
}

.management-card--accent {
  background: var(--rs-surface) !important;
  color: var(--rs-text) !important;
}

.management-card__index {
  color: var(--rs-muted);
  float: right;
  font-size: 0.82rem;
  font-weight: 900;
}

.management-cards h2 {
  font-size: 1.05rem;
  margin: 7px 0;
}

.management-cards p {
  color: var(--rs-muted);
  font-size: 0.84rem;
  line-height: 1.45;
  margin: 0 0 16px;
}

.management-card--accent p {
  color: var(--rs-muted);
}

.management-cards strong {
  color: var(--rs-link);
  font-size: 0.88rem;
}

.management-card--accent strong,
.management-card--accent small {
  color: var(--rs-link);
}

@media (max-width: 860px) {
  .management-layout {
    grid-template-columns: 1fr;
  }

  .management-cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 620px) {
  .management-cards {
    grid-template-columns: 1fr;
  }
}
</style>
