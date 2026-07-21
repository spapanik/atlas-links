import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import crx3 from 'crx3';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const outputPath = resolve('atlas-links.crx');
const encryptedKey = process.env.CRX_SIGNING_KEY_PATH?.trim();

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status ?? 'unknown'}.`);
  }
}

await rm(outputPath, { force: true });

if (!encryptedKey) {
  throw new Error(
    'CRX packaging requires CRX_SIGNING_KEY_PATH to point to a GPG-encrypted RSA private key in PEM format.',
  );
}

const temporaryDirectory = await mkdtemp(join(tmpdir(), 'atlas-links-crx-'));
const privateKeyPath = join(temporaryDirectory, 'signing-key.pem');

try {
  run('gpg', [
    '--quiet',
    '--batch',
    '--decrypt',
    '--output',
    privateKeyPath,
    resolve(encryptedKey),
  ]);
  await chmod(privateKeyPath, 0o600);
  run('pnpm', ['exec', 'vite', 'build', '--mode', 'webstore']);
  run('node', ['scripts/verify-production-manifest.mjs', 'dist/manifest.json']);

  await crx3(['dist'], { keyPath: privateKeyPath, crxPath: outputPath });
  console.log(`Created signed CRX: ${outputPath}`);
} catch (error) {
  await rm(outputPath, { force: true });
  throw error;
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
