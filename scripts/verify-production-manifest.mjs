import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { verifyProductionManifest } from './manifest.mjs';

const path = resolve(process.argv[2] ?? 'dist/manifest.json');

try {
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  verifyProductionManifest(manifest);
  console.log('Verified Web Store manifest.');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Web Store manifest verification failed: ${message}`);
  process.exitCode = 1;
}
