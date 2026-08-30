import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  assertProductionOAuthClientId,
  configureBuiltManifest,
  verifyProductionManifest,
} from './scripts/manifest.mjs';

const root = import.meta.dirname;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const packageVersion = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
    .version as unknown;
  if (typeof packageVersion !== 'string' || !packageVersion.trim()) {
    throw new Error('package.json must contain a non-empty version for the extension manifest.');
  }
  const webStore = mode === 'webstore';
  if (webStore) assertProductionOAuthClientId(env.VITE_GOOGLE_OAUTH_CLIENT_ID);
  return {
    plugins: [
      react(),
      {
        name: 'atlas-manifest-config',
        closeBundle() {
          const path = resolve(root, 'dist/manifest.json');
          const manifest = configureBuiltManifest(JSON.parse(readFileSync(path, 'utf8')), {
            oauthClientId: env.VITE_GOOGLE_OAUTH_CLIENT_ID,
            extensionKey: env.VITE_CHROME_EXTENSION_KEY,
            extensionVersion: packageVersion,
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
          popup: resolve(root, 'popup.html'),
          library: resolve(root, 'library.html'),
          search: resolve(root, 'search.html'),
          sidepanel: resolve(root, 'sidepanel.html'),
          background: resolve(root, 'src/background.ts'),
        },
        output: { entryFileNames: 'assets/[name].js', chunkFileNames: 'assets/[name].js' },
      },
    },
  };
});
