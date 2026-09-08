import categoryDefinitions from '../../../shared/product-categories.json'

export const categories = Object.freeze(
  categoryDefinitions.map((category) => Object.freeze({
    value: category.value,
    slug: category.slug,
    name: category.name,
    description: category.description,
    accent: category.accent
  }))
)

export function getCategoryBySlug(slug) {
  return categories.find((category) => category.slug === slug) || null
}

export function getCategoryByValue(value) {
  return categories.find((category) => category.value === value) || null
}

export function getCategoryName(value) {
  return getCategoryByValue(value)?.name || value
}
