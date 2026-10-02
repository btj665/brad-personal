import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // Relative asset paths, so the built site runs from any root — a localhost
  // port, a subfolder on an internal host, a file server — without being told
  // where it lives. This is what lets the shareable package "just work".
  base: './',
})
