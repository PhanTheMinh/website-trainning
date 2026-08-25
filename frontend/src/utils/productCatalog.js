import { getCategoryByValue, getCategoryName } from '../data/categories.js'
import { API_BASE_URL } from '../services/apiClient.js'

export function mapApiProduct(product, options = {}) {
  const category = getCategoryByValue(product.category)
  const detailQuery = options.fromCategory
    ? { fromCategory: options.fromCategory }
    : undefined

  const activeVariants = (product.variants || []).filter(
    (variant) => variant.status === 'active'
  )
  const defaultVariant = !(product.options || []).length
    ? activeVariants.find((variant) => variant.is_default) || activeVariants[0]
    : null
  const cartItem = defaultVariant
    ? {
        id: product.id,
        product_id: product.id,
        variant_id: defaultVariant.id,
        catalogKey: `database-variant-${defaultVariant.id}`,
        sku: defaultVariant.sku,
        option_values: defaultVariant.option_values,
        stock_quantity: defaultVariant.stock_quantity,
        name: product.title,
        category: getCategoryName(product.category),
        categoryValue: product.category,
        price: defaultVariant.effective_price,
        tag: 'Mới đăng',
        color: category?.accent || '#0f766e',
        image_url: defaultVariant.image_url ||
          product.images[0]?.image_url ||
          null
      }
    : null

  return {
    id: product.id,
    catalogKey: `database-product-${product.id}`,
    name: product.title,
    brand: product.brand || '',
    category: getCategoryName(product.category),
    categoryValue: product.category,
    price: product.min_price ?? product.price,
    maxPrice: product.max_price ?? product.price,
    stock: product.stock,
    soldCount: Number(product.sold_count ?? product.total_sold ?? 0),
    requiresSelection: Boolean((product.options || []).length),
    cartItem,
    tag: 'Mới đăng',
    color: category?.accent || '#0f766e',
    imageFrames: (product.images || [])
      .filter((image) => image.image_url)
      .map((image) => new URL(image.image_url, API_BASE_URL).toString()),
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
