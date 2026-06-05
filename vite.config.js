import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'sw-version.js'],
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
        cacheId: 'eleven-v10',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cdn\.sofifa\.net\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'sofifa-images-v10',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-v10' }
          }
        ]
      }
    })
  ],
  base: '/eleven/'
})
// Cache version — bump this number on every deployment.
// Current: 10
// History:
//   1 — initial build (Phase 1 scaffold)
//   2 — Phase 2 Home screen + NavBar
//   3 — Fix GitHub Pages base path + 404 routing
//   4 — Mobile responsiveness audit
//   5 — Seasons list + Season Detail + CreateSeasonModal (Phase 3)
//   6 — Home screen redesign: European Nights visual system
//   7 — Hero typography: Inter 800 direction
//   8 — Connect real Firebase project + S1 data seeded
//   9 — Fix GitHub Pages BrowserRouter basename
//   10 — European Nights migration: Seasons list + Season Detail
const SW_VERSION = 10;
