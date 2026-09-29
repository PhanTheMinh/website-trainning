import { createApp } from 'vue'
import App from './App.vue'
import router from './router.js'
import './styles.css'
import '@fontsource/be-vietnam-pro/latin-400.css'
import '@fontsource/be-vietnam-pro/latin-500.css'
import '@fontsource/be-vietnam-pro/latin-600.css'
import '@fontsource/be-vietnam-pro/latin-700.css'
import '@fontsource/be-vietnam-pro/vietnamese-400.css'
import '@fontsource/be-vietnam-pro/vietnamese-500.css'
import '@fontsource/be-vietnam-pro/vietnamese-600.css'
import '@fontsource/be-vietnam-pro/vietnamese-700.css'
import './styles/tokens.css'
import { initializeTheme } from './composables/useTheme.js'

initializeTheme()

createApp(App)
  .use(router)
  .mount('#app')
