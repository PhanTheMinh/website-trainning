function optionMap(variant) {
  return Object.fromEntries(
    (variant?.option_values || []).map((optionValue) => [
      optionValue.option_code,
      optionValue.value
    ])
  )
}

function uniqueImages(images, source) {
  const seen = new Set()

  return images.filter((image) => {
    const url = String(image?.image_url || '').trim()
    if (!url || seen.has(url)) return false
    seen.add(url)
    return true
  }).map((image) => ({ ...image, source: image.source || source }))
}

export function buildProductGallery(product, selections = {}) {
  if (!product) return []

  const productImages = uniqueImages(product.images || [], 'product')
  const selectedCodes = Object.keys(selections)
  const matchingVariants = (product.variants || []).filter((variant) => {
    if (variant.status && variant.status !== 'active') return false
    const values = optionMap(variant)
    return selectedCodes.every((code) => values[code] === selections[code])
  })
  const variantImages = uniqueImages(
    matchingVariants.flatMap((variant) => variant.images || []),
    'variant'
  )

  if (selectedCodes.length && variantImages.length) return variantImages
  if (productImages.length) return productImages

  return uniqueImages(
    (product.variants || []).flatMap((variant) => variant.images || []),
    'variant'
  )
}

