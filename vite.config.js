import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'sw-version.js'],
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
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        cacheId: 'eleven-v72',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cdn\.sofifa\.net\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'sofifa-images-v71',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-v71' }
          }
        ]
      }
    })
  ],
  base: '/eleven/'
})
