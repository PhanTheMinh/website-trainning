<script setup>
defineProps({ name: { type: String, required: true }, size: { type: Number, default: 20 } })
const paths = {
  sun: ['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8', 'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5'],
  moon: ['M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z'],
  search: ['M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15', 'm16 16 5 5'],
  cart: ['M3 3h2l2.5 12h11l2-8H6', 'M9 19h.01M18 19h.01'],
  user: ['M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8', 'M4 21v-2a8 8 0 0 1 16 0v2'],
  menu: ['M4 6h16M4 12h16M4 18h16'],
  close: ['m6 6 12 12M6 18 18 6'],
  chevron: ['m6 9 6 6 6-6'],
  arrow: ['M4 12h16m-6-6 6 6-6 6'],
  filter: ['M4 6h16M7 12h10M10 18h4'],
  plus: ['M12 5v14M5 12h14'],
  package: ['m12 3 9 5v8l-9 5-9-5V8l9-5Zm0 9v9M3 8l9 4 9-4M7.5 5.5l9 5V15'],
  image: ['M3 3h18v18H3z', 'm3 17 6-6 4 4 3-3 5 5M16 7h.01'],
  store: ['M3 10h18l-2-7H5l-2 7Zm2 0v11h14V10M9 21v-7h6v7'],
  truck: ['M3 5h11v12H3V5Zm11 5h4l3 4v3h-7', 'M7 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4M17 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4'],
  credit: ['M3 5h18v14H3zM3 10h18M7 15h3'],
  grid: ['M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z']
}
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <path v-for="(path, index) in paths[name] || paths.grid" :key="index" :d="path" />
  </svg>
</template>
