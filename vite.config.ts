import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Genera un único dist/index.html con todo adentro: se puede subir a cualquier
// hosting estático o abrir directo desde la PC.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), viteSingleFile()],
})
