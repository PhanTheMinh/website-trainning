import { defineConfig } from '../../frontend/node_modules/vite/dist/node/index.js'
import vue from '../../frontend/node_modules/@vitejs/plugin-vue/dist/index.mjs'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
    root: fileURLToPath(new URL('../../frontend', import.meta.url)),
    plugins: [vue()],
    server: {
        host: '127.0.0.1', port: 5181, strictPort: true,
        proxy: { '/api': 'http://127.0.0.1:3101', '/uploads': 'http://127.0.0.1:3101' }
    }
})
