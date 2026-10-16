import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5175, strictPort: true, proxy: { '/api': `http://127.0.0.1:${process.env.AGENT_CITY_API_PORT || 4175}` } },
  build: { target: 'es2020', chunkSizeWarningLimit: 800, assetsInlineLimit: 0 }
});
