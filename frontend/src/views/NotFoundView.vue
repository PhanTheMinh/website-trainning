<template>
  <main class="not-found-page">
    <section class="section not-found-panel">
      <p class="eyebrow">404</p>
      <h1>Không tìm thấy trang</h1>
      <p>Đường dẫn này không tồn tại hoặc đã được thay đổi.</p>
      <div class="not-found-actions">
        <RouterLink class="primary-action" to="/">Về trang chủ</RouterLink>
        <RouterLink class="secondary-action" to="/products">Xem sản phẩm</RouterLink>
      </div>
    </section>
  </main>
</template>

<script setup>
import { RouterLink } from 'vue-router'
</script>
