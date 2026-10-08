import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

function normalizePublicOrigin(value) {
  if (!value?.trim()) {
    return ''
  }

  const url = new URL(value)

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('VITE_PUBLIC_SITE_URL must use http or https')
  }

  return url.origin
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const publicOrigin = normalizePublicOrigin(env.VITE_PUBLIC_SITE_URL)
  const socialImageUrl = publicOrigin
    ? `${publicOrigin}/og.png`
    : '/og.png'

  return {
    plugins: [
      vue(),
      {
        name: 'runstore-social-image-url',
        transformIndexHtml(html) {
          return html.replaceAll(
            'content="/og.png"',
            `content="${socialImageUrl}"`
          )
        }
      }
    ],
    server: {
      port: 5173,
      host: true,
      proxy: {
        '/api': 'http://localhost:3000',
        '/health': 'http://localhost:3000',
        '/uploads': 'http://localhost:3000'
      }
    }
  }
})
