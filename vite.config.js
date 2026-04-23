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
  server: {
    port: 3000,
    open: true,
    host: true
  }
})
