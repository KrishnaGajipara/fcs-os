import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' keeps asset URLs relative so the build works at any path
// (GitHub Pages serves it under /<repo>/).
export default defineConfig({
  plugins: [react()],
  base: './',
})
