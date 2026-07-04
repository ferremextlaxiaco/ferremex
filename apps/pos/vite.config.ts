import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import fs from "fs"
import path from "path"

const certsDir = path.resolve(__dirname, "../../certs")

export default defineConfig({
  base: "/pos",
  // El vendor-ui de Mercur sirve el estático con express.static(appDir) SIN
  // recortar el prefijo /pos de la URL. Para que /pos/assets/... resuelva, el
  // build se emite en dist/pos/ y en medusa-config appDir apunta a dist/pos
  // (así express.static(dist/pos) + un fallback que sirve dist/pos/index.html).
  build: { outDir: "dist/pos" },
  plugins: [react(), tailwindcss()],
  server: {
    port: 7002,
    host: "0.0.0.0",
    https: {
      key:  fs.readFileSync(path.join(certsDir, "key.pem")),
      cert: fs.readFileSync(path.join(certsDir, "cert.pem")),
    },
    proxy: {
      "/caja": "http://localhost:9000",
      "/static": "http://localhost:9000",
    },
  },
})