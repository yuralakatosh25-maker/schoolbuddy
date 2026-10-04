import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // `npm run build` кладе сайт у wwwroot бекенду — його роздає ASP.NET
  build: { outDir: '../SchuoolBuddy.API/wwwroot', emptyOutDir: true },
  server: {
    // Запити /api йдуть на ASP.NET бекенд (SchuoolBuddy.API, профіль http)
    proxy: { '/api': 'http://localhost:5199' },
  },
  preview: {
    proxy: { '/api': 'http://localhost:5199' },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: { navigateFallbackDenylist: [/^\/api/] },
      manifest: {
        name: 'SchoolBuddy',
        short_name: 'SchoolBuddy',
        description: 'Peer mentoring for SŠINFIS students',
        theme_color: '#111112',
        background_color: '#f4f4f2',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
    }),
  ],
})
