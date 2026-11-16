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

/**
 * Escape literal U+FFFD in generated JS (it only ever appears inside string/regex literals, where
 * the escape is equivalent) so the output stays plain, publishable text.
 */
function escapeReplacementChar(): Plugin {
  return {
    name: 'composer-escape-fffd',
    apply: 'build',
    generateBundle(_opts, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type === 'chunk' && file.code.includes('\uFFFD')) file.code = file.code.split('\uFFFD').join('\\uFFFD')
      }
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), escapeReplacementChar(), precacheManifest()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
