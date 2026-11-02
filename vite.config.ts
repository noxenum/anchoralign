import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    // Licenses of all bundled dependencies, served with the app.
    license: { fileName: 'licenses/bundled-dependencies.md' },
  },
  worker: {
    format: 'es',
  },
  test: {
    environment: 'jsdom',
  },
});
