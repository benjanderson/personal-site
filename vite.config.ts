import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        home: resolve(__dirname, 'index.html'),
        games: resolve(__dirname, 'games/index.html'),
        gemTd: resolve(__dirname, 'games/gem-td.html'),
        bombDodger: resolve(__dirname, 'games/bomb-dodger.html'),
      },
    },
  },
})