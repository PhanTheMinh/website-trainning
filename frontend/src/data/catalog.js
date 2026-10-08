export { categories } from './categories.js'

export const sortOptions = Object.freeze([
  {
    value: 'name-asc',
    label: 'Name: A–Z'
  },
  {
    value: 'name-desc',
    label: 'Name: Z–A'
  },
  {
    value: 'featured',
    label: 'Featured'
  },
  {
    value: 'price-asc',
    label: 'Price: low to high'
  },
  {
    value: 'price-desc',
    label: 'Price: high to low'
  }
])

export function getPriorityScore(product) {
  const tag = String(product.tag || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()

  if (tag.includes('giam') || tag.includes('khuyen mai')) {
    return 4
  }

  if (tag.includes('ban chay')) {
    return 3
  }

  if (tag.includes('hot')) {
    return 2
  }

  if (tag.includes('pho bien') || tag.includes('moi')) {
    return 1
  }

  return 0
}

export function sortProducts(productList, sortKey = 'name-asc') {
  return [...productList].sort((left, right) => {
    if (sortKey === 'name-desc') {
      return right.name.localeCompare(left.name, 'vi')
    }

    if (sortKey === 'featured') {
      return (
        getPriorityScore(right) - getPriorityScore(left) ||
        left.name.localeCompare(right.name, 'vi')
      )
    }

    if (sortKey === 'price-asc') {
      return left.price - right.price
    }

    if (sortKey === 'price-desc') {
      return right.price - left.price
    }

    return left.name.localeCompare(right.name, 'vi')
  })
}

export function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'VND',
    currencyDisplay: 'code'
  }).format(value)
}
