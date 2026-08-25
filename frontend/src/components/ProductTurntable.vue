<script setup>
import { computed, ref } from 'vue'
import { formatCurrency } from '../data/catalog.js'
import ProductSpinViewer from './ProductSpinViewer.vue'

const props = defineProps({
  products: {
    type: Array,
    default: () => []
  }
})

const activeIndex = ref(0)
const showcaseProducts = computed(() => props.products.slice(0, 10))
const normalizedIndex = computed(() => {
  const count = showcaseProducts.value.length
  return count ? ((activeIndex.value % count) + count) % count : 0
})
const activeProduct = computed(() => showcaseProducts.value[normalizedIndex.value])
const activeHasSpin = computed(() => Boolean(
  activeProduct.value?.spinVideoUrl || activeProduct.value?.spinSpriteUrl
))
const activeSpecs = computed(() => {
  const category = activeProduct.value?.category?.toLowerCase() || ''
  if (category.includes('giày')) return [
    ['Bề mặt', 'Road'],
    ['Mục tiêu', 'Daily / Race'],
    ['Trải nghiệm', activeHasSpin.value ? '360° interactive' : 'Studio preview']
  ]
  if (category.includes('áo') || category.includes('quần')) return [
    ['Chất liệu', 'Performance'],
    ['Độ thoáng', 'High airflow'],
    ['Trải nghiệm', activeHasSpin.value ? '360° interactive' : 'Studio preview']
  ]
  return [
    ['Bộ môn', 'Running'],
    ['Thiết kế', 'Performance'],
    ['Trải nghiệm', activeHasSpin.value ? '360° interactive' : 'Studio preview']
  ]
})

function selectProduct(direction) {
  if (showcaseProducts.value.length > 1) activeIndex.value += direction
}

function setProduct(index) {
  activeIndex.value = index
}
</script>

<template>
  <section class="product-turntable" aria-labelledby="turntable-title">
    <div class="product-turntable__heading">
      <div>
        <p class="eyebrow">02 · Best sellers 360°</p>
        <h2 id="turntable-title">Xoay để nhìn.<br /><em>Chạm để sở hữu.</em></h2>
      </div>
      <p>
        Sản phẩm được dựng đứng như phòng chọn vật phẩm trong game. Kéo hoặc
        vuốt trực tiếp để đổi góc nhìn, nhấn vào vật thể để xem chi tiết.
      </p>
    </div>

    <div v-if="activeProduct" class="product-turntable__layout">
      <div class="product-turntable__meta">
        <span>{{ activeProduct.brand || activeProduct.category }}</span>
        <strong>{{ activeProduct.name }}</strong>
        <small>{{ formatCurrency(activeProduct.price) }}</small>
        <div>
          <i :class="{ 'is-ready': activeHasSpin }"></i>
          {{ activeHasSpin ? '360° interactive · kéo để xoay' : 'Studio preview · 360° coming soon' }}
        </div>
      </div>

      <ProductSpinViewer
        :key="activeProduct.catalogKey"
        :detail-route="activeProduct.detailRoute"
        :label="activeProduct.name"
        :sprite-url="activeProduct.spinSpriteUrl"
        :video-url="activeProduct.spinVideoUrl"
        :image-url="activeProduct.imageUrl"
        :accent="activeProduct.spinAccent"
        :object-tilt="activeProduct.spinTilt"
        :sprite-aspect="activeProduct.spinAspect"
      />

      <div v-if="showcaseProducts.length > 1" class="product-turntable__selector">
        <button type="button" aria-label="Sản phẩm trước" @click="selectProduct(-1)">←</button>
        <div aria-live="polite">
          <span>{{ String(normalizedIndex + 1).padStart(2, '0') }} / {{ String(showcaseProducts.length).padStart(2, '0') }}</span>
          <strong>{{ activeProduct.name }}</strong>
        </div>
        <button type="button" aria-label="Sản phẩm tiếp theo" @click="selectProduct(1)">→</button>
      </div>


      <dl class="product-turntable__specs" aria-label="Thông số sản phẩm nổi bật">
        <div v-for="spec in activeSpecs" :key="spec[0]">
          <dt>{{ spec[0] }}</dt>
          <dd>{{ spec[1] }}</dd>
        </div>
      </dl>
    </div>

    <div v-if="showcaseProducts.length > 1" class="product-turntable__rail" aria-label="Chọn sản phẩm bán chạy">
      <button
        v-for="(product, index) in showcaseProducts"
        :key="product.catalogKey"
        type="button"
        :class="{ 'is-active': index === normalizedIndex }"
        :aria-label="`Xem ${product.name}`"
        :aria-pressed="index === normalizedIndex"
        @click="setProduct(index)"
      >
        <img :src="product.imageUrl" :alt="product.name" />
        <span>{{ String(index + 1).padStart(2, '0') }}</span>
      </button>
    </div>
  </section>
</template>
