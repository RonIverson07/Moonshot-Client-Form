import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api/submissions': {
            target: 'http://localhost:5174',
            changeOrigin: true,
          },
          '/api/health': {
            target: 'http://localhost:5174',
            changeOrigin: true,
          },
          '/api/admin': {
            target: 'http://localhost:5174',
            changeOrigin: true,
          },
          '/api/settings': {
            target: 'http://localhost:5174',
            changeOrigin: true,
          },
          '/api/send-email': {
            target: 'http://localhost:5174',
            changeOrigin: true,
          },
        },
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
