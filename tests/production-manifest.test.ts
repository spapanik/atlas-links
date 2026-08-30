import { describe, expect, it } from 'vitest';
import {
  configureBuiltManifest,
  DEVELOPMENT_OAUTH_CLIENT_ID,
  isProductionOAuthClientId,
  REQUIRED_GOOGLE_HOST_PERMISSIONS,
  verifyProductionManifest,
} from '../scripts/manifest.mjs';

const validClientId = '1234567890-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com';

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    manifest_version: 3,
    oauth2: { client_id: validClientId, scopes: [] },
    host_permissions: [...REQUIRED_GOOGLE_HOST_PERMISSIONS],
    ...overrides,
  };
}

describe('Web Store manifest verification', () => {
  it.each([
    undefined,
    '',
    DEVELOPMENT_OAUTH_CLIENT_ID,
    'REPLACE_AT_BUILD_TIME.apps.googleusercontent.com',
    'your-extension-client-id.apps.googleusercontent.com',
    'not-a-google-client.example',
  ])('rejects missing or placeholder client ID %s', (clientId) => {
    expect(isProductionOAuthClientId(clientId)).toBe(false);
    expect(() =>
      verifyProductionManifest(manifest({ oauth2: { client_id: clientId, scopes: [] } })),
    ).toThrow(/requires VITE_GOOGLE_OAUTH_CLIENT_ID/i);
  });

  it('accepts a complete production manifest', () => {
    expect(verifyProductionManifest(manifest())).toEqual(manifest());
  });

  it('rejects a manifest key even when the remaining fields are valid', () => {
    expect(() => verifyProductionManifest(manifest({ key: 'development-public-key' }))).toThrow(
      /must not contain a key field/i,
    );
  });

  it.each(REQUIRED_GOOGLE_HOST_PERMISSIONS)(
    'rejects a missing %s host permission',
    (missingPermission) => {
      expect(() =>
        verifyProductionManifest(
          manifest({
            host_permissions: REQUIRED_GOOGLE_HOST_PERMISSIONS.filter(
              (permission) => permission !== missingPermission,
            ),
          }),
        ),
      ).toThrow(`missing required host permission: ${missingPermission}`);
    },
  );

  it('strips the development key when configuring a Web Store manifest', () => {
    const configured = configureBuiltManifest(manifest({ key: 'development-public-key' }), {
      oauthClientId: validClientId,
      extensionKey: 'another-development-key',
      webStore: true,
    });

    expect(configured.oauth2.client_id).toBe(validClientId);
    expect(configured).not.toHaveProperty('key');
    expect(() => verifyProductionManifest(configured)).not.toThrow();
  });

  it('keeps the existing development fallback and optional key behavior', () => {
    expect(
      configureBuiltManifest(manifest(), {
        oauthClientId: '',
        extensionKey: 'development-public-key',
      }),
    ).toMatchObject({
      oauth2: { client_id: DEVELOPMENT_OAUTH_CLIENT_ID },
      key: 'development-public-key',
    });
  });

  it('uses the supplied package version for the built manifest', () => {
    const configured = configureBuiltManifest(manifest({ version: '0.1.0' }), {
      oauthClientId: '',
      extensionKey: '',
      extensionVersion: '0.2.0',
    });

    expect(configured.version).toBe('0.2.0');
  });
});
