import categoryDefinitions from '../../../shared/product-categories.json'

// Display copy only: keep API values and existing category URLs unchanged.
const englishCopy = {
  'giay-chay-bo': ['Running shoes', 'Training and race-day shoes for every runner.'],
  'ao-chay-bo': ['Running tops', 'Lightweight, breathable layers for every distance.'],
  'quan-chay-bo': ['Running bottoms', 'Shorts and tights made for everyday movement.'],
  'phu-kien-chay-bo': ['Accessories', 'Hydration, socks, belts, and running essentials.']
}

export const categories = Object.freeze(
  categoryDefinitions.map((category) => Object.freeze({
    value: category.value,
    slug: category.slug,
    name: englishCopy[category.value]?.[0] || category.name,
    description: englishCopy[category.value]?.[1] || category.description,
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
