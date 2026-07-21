import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  assertProductionOAuthClientId,
  configureBuiltManifest,
  verifyProductionManifest,
} from './scripts/manifest.mjs';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const webStore = mode === 'webstore';
  if (webStore) assertProductionOAuthClientId(env.VITE_GOOGLE_OAUTH_CLIENT_ID);
  return {
    plugins: [
      react(),
      {
        name: 'atlas-manifest-config',
        closeBundle() {
          const path = resolve(__dirname, 'dist/manifest.json');
          const manifest = configureBuiltManifest(JSON.parse(readFileSync(path, 'utf8')), {
            oauthClientId: env.VITE_GOOGLE_OAUTH_CLIENT_ID,
            extensionKey: env.VITE_CHROME_EXTENSION_KEY,
            webStore,
          });
          if (webStore) verifyProductionManifest(manifest);
          writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
        },
      },
    ],
    define: { __OAUTH_CLIENT_ID__: JSON.stringify(env.VITE_GOOGLE_OAUTH_CLIENT_ID ?? '') },
    build: {
      rollupOptions: {
        input: {
          popup: resolve(__dirname, 'popup.html'),
          library: resolve(__dirname, 'library.html'),
          search: resolve(__dirname, 'search.html'),
          sidepanel: resolve(__dirname, 'sidepanel.html'),
          background: resolve(__dirname, 'src/background.ts'),
        },
        output: { entryFileNames: 'assets/[name].js', chunkFileNames: 'assets/[name].js' },
      },
    },
  };
});
