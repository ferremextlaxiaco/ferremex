import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { mercurDashboardPlugin } from '@mercurjs/dashboard-sdk'

// https://vite.dev/config/
export default defineConfig({
  base: '/dashboard',
  plugins: [
    react(),
    mercurDashboardPlugin({
      medusaConfigPath: '../../packages/api/medusa-config.ts',
    }),
  ],
})
