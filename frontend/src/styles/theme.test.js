import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import postcss from 'postcss'

const root = fileURLToPath(new URL('../', import.meta.url))
const palette = postcss.parse(readFileSync(path.join(root, 'styles/tokens.css'), 'utf8'))
const themes = {}
palette.walkRules(rule => {
  if (![':root', ":root[data-theme='dark']"].includes(rule.selector)) return
  const values = {}
  rule.walkDecls(/^--rs-/, decl => { values[decl.prop] = decl.value })
  themes[rule.selector === ':root' ? 'light' : 'dark'] = values
})
themes.dark = { ...themes.light, ...themes.dark }

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map(channel => {
    const value = parseInt(channel, 16) / 255
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4
  })
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722
}

describe('Site-wide semantic themes', () => {
  it.each(['light', 'dark'])('%s palette keeps normal text and controls readable', theme => {
    const colors = themes[theme]
    const pairs = ['page', 'surface', 'subtle'].flatMap(bg => ['text', 'muted', 'link'].map(fg => [fg, bg]))
    pairs.push(['on-primary', 'primary'], ['on-solid', 'solid'], ['on-solid-muted', 'solid'], ['success', 'success-bg'], ['error', 'error-bg'], ['warning', 'warning-bg'])
    for (const [fg, bg] of pairs) {
      const values = [luminance(colors[`--rs-${fg}`]), luminance(colors[`--rs-${bg}`])].sort((a, b) => b - a)
      expect((values[0] + .05) / (values[1] + .05), `${theme}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('does not pin legacy pages to the light palette', () => {
    expect(palette.toString()).not.toMatch(/main:not|storefront\s*>\s*main/)
  })

  it('uses semantic colors for surfaces and text throughout every view and component', () => {
    function files(dir) {
      return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)])
    }
    const sources = files(root).filter(file => file.endsWith('.vue') || file === path.join(root, 'styles.css'))
    const violations = []
    for (const file of sources) {
      const source = readFileSync(file, 'utf8')
      const styles = file.endsWith('.vue') ? [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1]) : [source]
      for (const css of styles) postcss.parse(css).walkDecls(decl => {
        if (!/^(background(-color|-image)?|color)$/.test(decl.prop)) return
        // The small brand mark intentionally keeps its brand colors in both modes.
        if (file.endsWith('SiteHeader.vue') && decl.parent.selector === '.rs-brand__mark') return
        const value = decl.value.replace(/url\([^)]*\)/gi, '')
        if (/#(?:[\da-f]{3,8})\b|\brgba?\(|\b(?:white|black)\b/i.test(value)) violations.push(`${path.relative(root, file)}: ${decl.parent.selector}: ${decl.toString()}`)
      })
    }
    expect(violations).toEqual([])
  })
})
