import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiUrl = env.VITE_API_URL || 'http://localhost:8079';
  const apiKey = env.VITE_API_KEY || '';

  return {
    server: {
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: apiUrl,
          changeOrigin: true,
          headers: apiKey ? { 'X-Api-Key': apiKey } : {},
        },
      },
    },
  };
});
