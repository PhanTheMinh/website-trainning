import { getCategoryByValue, getCategoryName } from '../data/categories.js'
import { API_BASE_URL } from '../services/apiClient.js'

export function mapApiProduct(product, options = {}) {
  const category = getCategoryByValue(product.category)
  const detailQuery = options.fromCategory
    ? { fromCategory: options.fromCategory }
    : undefined

  return {
    id: product.id,
    catalogKey: `database-product-${product.id}`,
    name: product.title,
    category: getCategoryName(product.category),
    categoryValue: product.category,
    price: product.price,
    stock: product.stock,
    tag: 'Mới đăng',
    color: category?.accent || '#0f766e',
    imageUrl: product.images[0]?.image_url
      ? new URL(product.images[0].image_url, API_BASE_URL).toString()
      : '',
    detailRoute: {
      name: 'product-detail',
      params: {
        id: product.id
      },
      query: detailQuery
    }
  }
}

export function mapApiProducts(products, options = {}) {
  return products.map((product) => mapApiProduct(product, options))
}
