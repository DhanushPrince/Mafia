import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cloudflare } from '@cloudflare/vite-plugin'

// `vite` runs the app and the Worker (rooms) together in workerd. Set NO_WORKER=1 for a plain static dev server.
export default defineConfig({
  plugins: [react(), ...(process.env.NO_WORKER || process.env.VITEST ? [] : [cloudflare()])],
  base: '/',
})
