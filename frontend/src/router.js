import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import ProfileView from './views/ProfileView.vue'
import MyProductsView from './views/MyProductsView.vue'
import ProductsView from './views/ProductsView.vue'
import CategoriesView from './views/CategoriesView.vue'
import CartView from './views/CartView.vue'
import AddProductView from './views/AddProductView.vue'
import ProductDetailView from './views/ProductDetailView.vue'
import EditProductView from './views/EditProductView.vue'
import ProductTrashView from './views/ProductTrashView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView
    },
    {
      path: '/profile',
      name: 'profile',
      component: ProfileView,
      meta: {
        requiresAuth: true
      }
    },
    {
      path: '/me/products',
      name: 'my-products',
      component: MyProductsView,
      meta: {
        requiresAuth: true
      }
    },
    {
      path: '/me/products/trash',
      name: 'product-trash',
      component: ProductTrashView,
      meta: {
        requiresAuth: true
      }
    },
    {
      path: '/me/products/:id/edit',
      name: 'product-edit',
      component: EditProductView,
      meta: {
        requiresAuth: true
      }
    },
    {
      path: '/products',
      name: 'products',
      component: ProductsView
    },
    {
      path: '/products/new',
      name: 'product-create',
      component: AddProductView,
      meta: {
        requiresAuth: true
      }
    },
    {
      path: '/products/:id',
      name: 'product-detail',
      component: ProductDetailView
    },
    {
      path: '/categories',
      name: 'categories',
      component: CategoriesView
    },
    {
      path: '/categories/:slug',
      name: 'category',
      component: ProductsView
    },
    {
      path: '/cart',
      name: 'cart',
      component: CartView
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/'
    }
  ],
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    }

    if (to.hash) {
      return {
        el: to.hash,
        behavior: 'smooth'
      }
    }

    if (
      to.name === from.name &&
      ['my-products', 'product-trash'].includes(to.name)
    ) {
      return false
    }

    return {
      top: 0
    }
  }
})

export default router
