/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'

/** Emits precache-manifest.json (every built asset) for the service worker. */
function precacheManifest(): Plugin {
  return {
    name: 'composer-precache-manifest',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map') && f !== 'precache-manifest.json')
      this.emitFile({ type: 'asset', fileName: 'precache-manifest.json', source: JSON.stringify(files) })
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), precacheManifest()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
