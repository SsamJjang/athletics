import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Served from the root of a Cloudflare Pages site. public/_redirects sends
// every deep link (/calendar, /sports/rowing) back to index.html.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // Libraries change far less often than the app; separate chunks
        // stay cached across deploys.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          markdown: ['marked', 'dompurify'],
        },
      },
    },
  },
})
