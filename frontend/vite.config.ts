import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages hosts this repository under /Factory-2030/, not at the domain root.
const pages = process.env.GITHUB_PAGES === 'true'

export default defineConfig({
  plugins: [react()],
  base: pages ? '/Factory-2030/' : '/',
  server: { port: 5173 },
})
