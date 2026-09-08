<template>
  <footer class="site-footer">
    <RouterLink class="site-footer__brand" to="/">RUNSTORE</RouterLink>
    <nav class="site-footer__links" aria-label="Điều hướng cuối trang">
      <RouterLink to="/products">Sản phẩm</RouterLink>
      <RouterLink to="/categories">Danh mục</RouterLink>
      <RouterLink to="/cart">Giỏ hàng</RouterLink>
    </nav>
    <small>Đồ chạy bộ cho mọi cung đường.</small>
  </footer>
</template>

<script setup>
import { RouterLink } from 'vue-router'
</script>
