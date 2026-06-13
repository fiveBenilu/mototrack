import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // autoUpdate + skipWaiting/clients.claim im SW: neue Versionen aktivieren
      // sich selbst und laden die Seite neu, statt auf eine Nutzeraktion zu warten.
      registerType: 'autoUpdate',
      // Registrierung erfolgt explizit in main.tsx (registerSW) – darum hier aus.
      injectRegister: false,
      includeAssets: ['favicon.svg'],
      injectManifest: {
        // Precache auch die größeren JS-Bundles (Leaflet etc.).
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      manifest: {
        name: 'MotoTrack',
        short_name: 'MotoTrack',
        description: 'Motorrad-Touren aufzeichnen, Schräglagen messen, mit Freunden vergleichen',
        theme_color: '#0a0a0c',
        background_color: '#0a0a0c',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:8009',
      '/uploads': 'http://localhost:8009',
      '/ws': { target: 'ws://localhost:8009', ws: true },
    },
  },
})
