import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  base: "/pos",
  plugins: [react()],
  server: {
    port: 7002,
    proxy: {
      "/caja": "http://localhost:9000",
    },
  },
})
