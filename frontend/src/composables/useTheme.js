import { readonly, ref } from 'vue'
import { createThemeController } from '../utils/theme.js'

const theme = ref('light')
let controller

export function initializeTheme() {
  controller?.dispose()
  controller = createThemeController(window, document, value => { theme.value = value })
}

export function useTheme() {
  return { theme: readonly(theme), toggleTheme: () => controller?.toggle() }
}

if (import.meta.hot) import.meta.hot.dispose(() => controller?.dispose())
