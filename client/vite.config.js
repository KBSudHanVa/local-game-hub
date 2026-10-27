import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const serverPort = process.env.API_PORT || '3001';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: Number(process.env.FRONTEND_PORT || 5173),
    strictPort: true,
    proxy: {
      '/socket.io': {
        target: `http://127.0.0.1:${serverPort}`,
        ws: true,
      },
      '/api': `http://127.0.0.1:${serverPort}`,
    },
  },
});
