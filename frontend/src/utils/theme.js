export const THEME_STORAGE_KEY = 'runstore.theme'

export function createThemeController(browser, doc, onChange = () => {}) {
  const media = browser.matchMedia('(prefers-color-scheme: dark)')
  const valid = value => value === 'light' || value === 'dark'
  let preference = null
  try {
    const saved = browser.localStorage.getItem(THEME_STORAGE_KEY)
    if (valid(saved)) preference = saved
  } catch { /* Keep the toggle usable when storage is unavailable. */ }
  let theme
  function apply() {
    theme = preference || (media.matches ? 'dark' : 'light')
    doc.documentElement.dataset.theme = theme
    doc.documentElement.style.colorScheme = theme
    doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#111815' : '#f6f7f5')
    onChange(theme)
  }
  function systemChanged() { if (!preference) apply() }
  function storageChanged(event) {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return
    preference = valid(event.newValue) ? event.newValue : null
    apply()
  }
  media.addEventListener('change', systemChanged)
  browser.addEventListener('storage', storageChanged)
  apply()
  return {
    get theme() { return theme },
    toggle() {
      preference = theme === 'dark' ? 'light' : 'dark'
      try { browser.localStorage.setItem(THEME_STORAGE_KEY, preference) } catch { /* Session-only fallback. */ }
      apply()
    },
    dispose() {
      media.removeEventListener('change', systemChanged)
      browser.removeEventListener('storage', storageChanged)
    }
  }
}
