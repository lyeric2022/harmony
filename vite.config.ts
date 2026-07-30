import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages: https://lyeric2022.github.io/harmony/
export default defineConfig({
  plugins: [react()],
  base: '/harmony/',
})
