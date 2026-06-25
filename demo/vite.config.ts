import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import uivisor from 'uivisor/vite'

export default defineConfig({
  plugins: [uivisor(), react()],
  server: { port: 5180 },
})
