import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        home: resolve(__dirname, 'index.html'),
        games: resolve(__dirname, 'games/index.html'),
        bombDodger: resolve(__dirname, 'bomb-dodger/index.html'),
      },
    },
  },
})