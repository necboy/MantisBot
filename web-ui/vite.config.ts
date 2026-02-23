import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8118',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://localhost:8118',
        ws: true
      },
      '/office-preview': {
        target: 'http://localhost:8118',
        changeOrigin: true
      }
    }
  }
});
