import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En desarrollo, /api se redirige al servidor Express (puerto 3000)
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
});
