import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Optional: proxy API in dev to avoid CORS if Nakama blocks browser origin
      '/nakama': {
        target: 'http://127.0.0.1:7350',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/nakama/, ''),
      },
    },
  },
});
