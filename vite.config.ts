import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 本地运行 Azure Functions（默认 7071）时，前端可直接访问同源的 /api。
    proxy: { '/api': 'http://localhost:7071' },
  },
})
