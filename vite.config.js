import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      // Forwards to server.js (the Grok/xAI proxy) when running `npm run server`.
      // Only used when VITE_USE_LIVE_ASSISTANT=true; otherwise the AI Assistant
      // uses local demo responses and never calls this route.
      '/api/assistant': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
});
