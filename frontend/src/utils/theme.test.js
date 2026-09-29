import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { createThemeController, THEME_STORAGE_KEY } from './theme.js'

function environment(saved = null, systemDark = false, blocked = false) {
  const listeners = {}
  const media = { matches: systemDark, addEventListener: vi.fn((name, fn) => { listeners.system = fn }), removeEventListener: vi.fn() }
  const storage = {
    getItem: vi.fn(() => { if (blocked) throw new Error('Blocked'); return saved }),
    setItem: vi.fn(() => { if (blocked) throw new Error('Blocked') })
  }
  const browser = { localStorage: storage, matchMedia: () => media, addEventListener: vi.fn((name, fn) => { listeners.storage = fn }), removeEventListener: vi.fn() }
  const meta = { setAttribute: vi.fn() }
  const doc = { documentElement: { dataset: {}, style: {} }, querySelector: () => meta }
  return { browser, doc, media, storage, listeners, meta }
}

describe('Theme preference', () => {
  it.each([false, true])('uses the system theme on the first visit (dark: %s)', dark => {
    const env = environment(null, dark)
    const controller = createThemeController(env.browser, env.doc)
    expect(controller.theme).toBe(dark ? 'dark' : 'light')
    expect(env.doc.documentElement.style.colorScheme).toBe(controller.theme)
  })
  it('prefers the saved setting and persists toggles', () => {
    const env = environment('light', true)
    const update = vi.fn()
    const controller = createThemeController(env.browser, env.doc, update)
    expect(controller.theme).toBe('light')
    controller.toggle()
    expect(env.storage.setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, 'dark')
    expect(env.doc.documentElement.dataset.theme).toBe('dark')
    expect(env.meta.setAttribute).toHaveBeenLastCalledWith('content', '#111815')
    expect(update).toHaveBeenLastCalledWith('dark')
  })
  it('follows system changes until a user makes an explicit choice', () => {
    const env = environment()
    const controller = createThemeController(env.browser, env.doc)
    env.media.matches = true
    env.listeners.system()
    expect(controller.theme).toBe('dark')
    controller.toggle()
    env.listeners.system()
    expect(controller.theme).toBe('light')
  })
  it('synchronizes other tabs and resumes following the system when cleared', () => {
    const env = environment('light', true)
    const controller = createThemeController(env.browser, env.doc)
    env.listeners.storage({ key: 'unrelated', newValue: 'dark' })
    expect(controller.theme).toBe('light')
    env.listeners.storage({ key: THEME_STORAGE_KEY, newValue: 'dark' })
    expect(controller.theme).toBe('dark')
    env.media.matches = false
    env.listeners.storage({ key: null, newValue: null })
    expect(controller.theme).toBe('light')
  })
  it('ignores invalid saved preferences', () => {
    const env = environment('invalid', true)
    expect(createThemeController(env.browser, env.doc).theme).toBe('dark')
  })
  it('works when local storage is blocked', () => {
    const env = environment(null, false, true)
    const controller = createThemeController(env.browser, env.doc)
    expect(() => controller.toggle()).not.toThrow()
    expect(controller.theme).toBe('dark')
  })
  it('removes listeners when disposed', () => {
    const env = environment()
    createThemeController(env.browser, env.doc).dispose()
    expect(env.browser.removeEventListener).toHaveBeenCalledWith('storage', env.listeners.storage)
    expect(env.media.removeEventListener).toHaveBeenCalledWith('change', env.listeners.system)
  })
  it.each([['dark', false, false], ['light', true, false], [null, true, false], [null, false, true], ['invalid', true, false]])('boot script matches the controller for %s / system dark %s / blocked %s', (saved, dark, blocked) => {
    const env = environment(saved, dark, blocked)
    const source = readFileSync(new URL('../../public/theme-init.js', import.meta.url), 'utf8')
    runInNewContext(source, { window: env.browser, document: env.doc, localStorage: env.storage })
    const bootTheme = env.doc.documentElement.dataset.theme
    expect(createThemeController(env.browser, env.doc).theme).toBe(bootTheme)
  })
})
