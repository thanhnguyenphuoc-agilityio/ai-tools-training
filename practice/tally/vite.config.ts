import { cloudflare } from '@cloudflare/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => {
  const isServe = command === 'serve';
  const devLogin = isServe && process.env.TALLY_DEV_LOGIN === 'true';

  return {
    plugins: [react(), cloudflare(devLogin ? { config: { vars: { DEV_LOGIN: 'true' } } } : undefined)],
    server: {
      port: Number(process.env.TALLY_PORT ?? 5173),
      strictPort: true,
    },
  };
});
