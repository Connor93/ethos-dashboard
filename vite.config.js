import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiUrl = env.VITE_API_URL || 'http://localhost:8079';
  const apiKey = env.VITE_API_KEY || '';
  // Pub editor GFX proxy. Defaults to the production em-web-client over HTTPS
  // because most devs won't have the EGFs available locally; set VITE_GFX_URL
  // to a local em-web-client (e.g. http://localhost:8000) to override.
  const gfxUrl = env.VITE_GFX_URL || 'https://client.calamity-online.cloud';

  return {
    server: {
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: apiUrl,
          changeOrigin: true,
          headers: apiKey ? { 'X-Api-Key': apiKey } : {},
        },
        '/gfx': {
          target: gfxUrl,
          changeOrigin: true,
        },
        // Backup sidecar (in-container in prod, started by docker-entrypoint).
        // For `npm run dev`, run `node sidecar/server.js` separately and the
        // dashboard's pre-save snapshot calls land here.
        '/local-api': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/local-api/, ''),
        },
      },
    },
  };
});
