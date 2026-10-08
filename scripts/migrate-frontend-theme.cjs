/* One-time mechanical migration of legacy CSS to the shared semantic palette.
 * Only CSS declarations are touched; scripts, templates, and API values remain
 * unchanged. Existing image pixels and product-color data are not transformed.
 * Run with --write to apply, otherwise print the migration inventory. */
const fs = require('node:fs')
const path = require('node:path')
const postcss = require('../frontend/node_modules/postcss')
const root = path.resolve(__dirname, '../frontend/src')
const skip = new Set(['SiteHeader.vue', 'SiteFooter.vue', 'ProductCard.vue', 'ProductGrid.vue', 'ManagementSidebar.vue', 'PaginationNav.vue', 'ProductsView.vue', 'PaymentMethodListView.vue', 'PaymentMethodFormView.vue'])
const files = [path.join(root, 'styles.css')]
for (const folder of ['views', 'components']) {
  for (const file of fs.readdirSync(path.join(root, folder))) {
    if (file.endsWith('.vue') && !skip.has(file)) files.push(path.join(root, folder, file))
  }
}
const colorPattern = /#[\da-f]{3,8}\b|rgba?\(\s*[\d.,%\s]+\)|\b(?:white|black)\b/gi
const semantic = name => `var(--rs-${name})`
function rgb(value) {
  if (value === 'white') return [255, 255, 255, 1]
  if (value === 'black') return [0, 0, 0, 1]
  if (value.startsWith('#')) {
    let hex = value.slice(1)
    if (hex.length === 3 || hex.length === 4) hex = [...hex].map(c => c + c).join('')
    return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)).concat(hex.length === 8 ? parseInt(hex.slice(6), 16) / 255 : 1)
  }
  const values = value.match(/[\d.]+/g).map(Number)
  return [...values.slice(0, 3), values[3] ?? 1]
}
function mapColor(value, prop, selector) {
  const [r, g, b, a] = rgb(value.toLowerCase())
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const brightness = (max + min) / 510
  const saturated = max - min > 45
  const red = r > g * 1.3 && r > b * 1.2
  const yellow = r > 120 && g > b * 1.5 && r > g * .95
  const error = /error|danger|invalid|delete|remove|stopped|inactive/.test(selector) && red
  const warning = /warning|notice|pending/.test(selector) && (red || yellow)
  const success = /success|active|available|verified/.test(selector) && g > r && g > b
  const background = /background/.test(prop)
  const border = /border|outline/.test(prop)
  let token
  if (/shadow|filter/.test(prop)) return value // Shadows do not paint light surfaces.
  if (background) {
    if (error) token = brightness > .65 ? 'error-bg' : 'danger-solid'
    else if (warning) token = brightness > .65 ? 'warning-bg' : 'warning-solid'
    else if (success) token = brightness > .65 ? 'success-bg' : 'success-solid'
    else if (brightness > .94) token = /(?:-page|:root|\.section)(?:\s|,|$)/.test(selector) ? 'page' : 'surface'
    else if (brightness > .72) token = saturated ? 'accent-surface' : 'subtle'
    else if (saturated && brightness > .55) token = 'accent-surface'
    else token = 'solid'
    if (a < .5 && brightness < .5) token = 'text'
    if (/modal|backdrop|overlay/.test(selector) && brightness < .5 && a >= .35 && a < 1) return semantic('overlay')
  } else if (border) {
    token = error ? 'error' : /focus|selected|active/.test(selector) && saturated ? 'focus' : 'border'
    // Border contrast is intentional; do not make it nearly invisible by
    // applying the legacy alpha on top of an already subtle border token.
    return semantic(token)
  } else {
    if (brightness > .96) token = 'on-solid'
    else if (brightness > .8) token = 'on-solid-muted'
    else if (error) token = 'error'
    else if (warning) token = 'warning'
    else if (success) token = 'success'
    else if (saturated && brightness > .23) token = 'link'
    else token = brightness > .3 ? 'muted' : 'text'
  }
  return a < 1 ? `color-mix(in srgb, ${semantic(token)} ${Math.round(a * 100)}%, transparent)` : semantic(token)
}
function migrate(css) {
  const ast = postcss.parse(css)
  ast.walkDecls(decl => {
    const prop = decl.prop.toLowerCase()
    const selector = decl.parent.selector || ':root'
    if (!/^(?:color|background(?:-color|-image)?|border(?:-[\w-]+)?|outline(?:-color)?|fill|stroke|accent-color|box-shadow|text-shadow|filter|--seller-[\w-]+)$/.test(prop)) return
    if (/shadow|filter/.test(prop)) return
    const context = prop.startsWith('--') ? (/ink|muted|danger/.test(prop) ? 'color' : /line/.test(prop) ? 'border-color' : 'background') : prop
    // Asset filenames can contain color words (for example black-shoe.png).
    decl.value = decl.value.split(/(url\([^)]*\))/gi).map(part => /^url\(/i.test(part) ? part : part.replace(colorPattern, value => mapColor(value, context, selector))).join('')
    decl.value = decl.value.replace(/var\(--seller-(ink|navy-soft|navy|blue-soft|blue|lime|green|paper|surface|line|muted|danger)\)/g, (_, key) => {
      if (key === 'paper') return semantic('page')
      if (key === 'surface') return semantic('surface')
      if (key === 'line') return semantic('border')
      if (key === 'muted') return semantic('muted')
      if (key === 'blue-soft') return semantic('subtle')
      if (key === 'lime') return semantic(/background/.test(context) ? 'accent-surface' : 'accent')
      if (key === 'danger') return semantic(/background/.test(context) ? 'danger-solid' : 'error')
      if (/border|outline/.test(context)) return semantic('focus')
      if (/background/.test(context)) return semantic('solid')
      return semantic(/blue|green/.test(key) ? 'link' : 'text')
    })
  })
  return ast.toString()
}
let changes = 0
for (const file of files) {
  const original = fs.readFileSync(file, 'utf8')
  const next = file.endsWith('.css') ? migrate(original) : original.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/g, (_, open, css, close) => open + migrate(css) + close)
  if (next !== original) {
    changes++
    if (process.argv.includes('--write')) fs.writeFileSync(file, next)
    console.log(path.relative(root, file))
  }
}
console.log(`${changes} CSS sources ${process.argv.includes('--write') ? 'migrated' : 'would change'}.`)
