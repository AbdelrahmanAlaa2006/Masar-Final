import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // All Supabase / data-access code lives in /backend now.
      '@backend': path.resolve(__dirname, 'backend'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'supabase': ['@supabase/supabase-js'],
          'tus': ['tus-js-client'],
        }
      }
    }
  },
  server: {
    port: 3000,
    open: true,
    host: true,
    proxy: {
      // WAPilot blocks browser calls (CORS); in dev the browser hits this
      // same-origin path and Vite forwards it server-side where CORS doesn't
      // apply. Production sending will go through an edge function instead.
      '/wapilot-proxy': {
        target: 'https://api.wapilot.net',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/wapilot-proxy/, ''),
        // WAPilot silently drops queued messages whose requests carry
        // browser-identity headers (server-side sends deliver, identical
        // browser sends vanish). Strip them so the forwarded request looks
        // like the server-to-server call it actually is.
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            const strip = [
              'origin', 'referer', 'cookie',
              'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest',
              'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform',
              'accept-language',
            ]
            strip.forEach((h) => proxyReq.removeHeader(h))
            proxyReq.setHeader('user-agent', 'masar-platform/1.0')
          })
        },
      },
    },
  }
})
