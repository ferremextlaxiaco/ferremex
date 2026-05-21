import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  base: "/pos",
  plugins: [react()],
  optimizeDeps: {
    exclude: ["@react-pdf/renderer"],
  },
  server: {
    port: 7002,
    host: "0.0.0.0",
    proxy: {
      "/caja": "http://localhost:9000",
      "/static": "http://localhost:9000",
    },
  },
})
