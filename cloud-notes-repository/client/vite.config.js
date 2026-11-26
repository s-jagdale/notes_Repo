import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development, requests starting with /api are forwarded to the Express backend,
// so the browser sees ONE origin and no CORS configuration is needed.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: process.env.VITE_PROXY_TARGET || 'http://localhost:4000', changeOrigin: true } }
  }
});
