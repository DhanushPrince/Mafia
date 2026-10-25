import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cloudflare } from '@cloudflare/vite-plugin'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const commit = (() => { try { return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { return 'unknown' } })()
const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url))).version

// `vite` runs the app and the Worker (rooms) together in workerd. Set NO_WORKER=1 for a plain static dev server.
export default defineConfig({
  plugins: [react(), ...(process.env.NO_WORKER || process.env.VITEST ? [] : [cloudflare()])],
  base: '/',
  define: { __BUILD_COMMIT__: JSON.stringify(commit), __APP_VERSION__: JSON.stringify(version) },
  test: {
    // report every Sonar source file (sonar-project.properties: src, worker), not only the ones a test
    // imports, so lcov matches what SonarQube counts as lines to cover
    coverage: {
      include: ['src/**/*.{js,jsx}', 'worker/**/*.js'],
      exclude: ['**/*.test.{js,jsx}', '**/*.spec.js', 'src/audio/vendor/**'],
    },
  },
})
