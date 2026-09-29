import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import ProfileView from './views/ProfileView.vue'
import MyProductsView from './views/MyProductsView.vue'
import ProductsView from './views/ProductsView.vue'
import CategoriesView from './views/CategoriesView.vue'
import CartView from './views/CartView.vue'
import CheckoutView from './views/CheckoutView.vue'
import AddProductView from './views/AddProductView.vue'
import ProductDetailView from './views/ProductDetailView.vue'
import EditProductView from './views/EditProductView.vue'
import ProductTrashView from './views/ProductTrashView.vue'
import ShopView from './views/ShopView.vue'
import MyShopView from './views/MyShopView.vue'
import ManagementView from './views/ManagementView.vue'
import ShippingMethodListView from './views/ShippingMethodListView.vue'
import ShippingMethodCreateView from './views/ShippingMethodCreateView.vue'
import ShippingCountryListView from './views/ShippingCountryListView.vue'
import ShippingCountryCreateView from './views/ShippingCountryCreateView.vue'
import ShippingSettingListView from './views/ShippingSettingListView.vue'
import ShippingSettingCreateView from './views/ShippingSettingCreateView.vue'
import ShippingSettingDetailView from './views/ShippingSettingDetailView.vue'
import PaymentMethodListView from './views/PaymentMethodListView.vue'
import PaymentMethodFormView from './views/PaymentMethodFormView.vue'
import NotFoundView from './views/NotFoundView.vue'

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
      path: '/me/shop',
      name: 'my-shop',
      component: MyShopView,
      meta: {
        requiresAuth: true
      }
    },
    {
      path: '/me/manage',
      name: 'management',
      component: ManagementView,
      meta: {
        requiresAuth: true
      }
    },
    {
      path: '/me/manage/shipping-methods',
      name: 'shipping-methods',
      redirect: { name: 'shipping-method-list' },
      meta: {
        requiresAuth: true
      }
    },
    {
      path: '/me/manage/shipping-methods/list',
      name: 'shipping-method-list',
      component: ShippingMethodListView,
      meta: {
        requiresAuth: true
      }
    },
    {
      path: '/me/manage/shipping-methods/new',
      name: 'shipping-method-create',
      component: ShippingMethodCreateView,
      meta: {
        requiresAuth: true
      }
    },
    {
      path: '/me/manage/shipping-countries',
      name: 'shipping-countries',
      redirect: { name: 'shipping-country-list' },
      meta: {
        requiresAuth: true
      }
    },
    {
      path: '/me/manage/shipping-countries/list',
      name: 'shipping-country-list',
      component: ShippingCountryListView,
      meta: {
        requiresAuth: true
      }
    },
    {
      path: '/me/manage/shipping-countries/new',
      name: 'shipping-country-create',
      component: ShippingCountryCreateView,
      meta: {
        requiresAuth: true
      }
    },
    {
      path: '/me/manage/shipping-settings',
      name: 'shipping-settings',
      redirect: { name: 'shipping-setting-list' },
      meta: {
        requiresAuth: true
      }
    },
    {
      path: '/me/manage/shipping-settings/list',
      name: 'shipping-setting-list',
      component: ShippingSettingListView,
      meta: {
        requiresAuth: true
      }
    },
    {
      path: '/me/manage/shipping-settings/new',
      name: 'shipping-setting-create',
      component: ShippingSettingCreateView,
      meta: {
        requiresAuth: true
      }
    },
    {
      path: '/me/manage/shipping-settings/:id',
      name: 'shipping-setting-detail',
      component: ShippingSettingDetailView,
      meta: {
        requiresAuth: true
      }
    },
    {
      path: '/me/manage/payment-methods',
      name: 'payment-method-list',
      component: PaymentMethodListView,
      meta: { requiresAuth: true }
    },
    {
      path: '/me/manage/payment-methods/new',
      name: 'payment-method-create',
      component: PaymentMethodFormView,
      meta: { requiresAuth: true }
    },
    {
      path: '/me/manage/payment-methods/:id/edit',
      name: 'payment-method-edit',
      component: PaymentMethodFormView,
      meta: { requiresAuth: true }
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
      path: '/shops/:identifier',
      name: 'shop',
      component: ShopView
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
      path: '/checkout/:checkoutToken?',
      name: 'checkout',
      component: CheckoutView
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: NotFoundView
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
