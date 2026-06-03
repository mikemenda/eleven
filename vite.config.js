import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico'],
      manifest: {
        name: 'Eleven — FC Career Mode Companion',
        short_name: 'Eleven',
        description: 'FC Career Mode Companion',
        theme_color: '#080d1a',
        background_color: '#080d1a',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/eleven/',
        start_url: '/eleven/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cdn\.sofifa\.net\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'sofifa-images',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          }
        ]
      }
    })
  ],
  base: '/eleven/'
})
