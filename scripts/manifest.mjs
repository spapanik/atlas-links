export const DEVELOPMENT_OAUTH_CLIENT_ID = 'CONFIGURE_GOOGLE_OAUTH_CLIENT_ID';
export const REQUIRED_GOOGLE_HOST_PERMISSIONS = [
  'https://www.googleapis.com/*',
  'https://oauth2.googleapis.com/*',
];

const PLACEHOLDER_PREFIXES = [
  /^configure(?:[-_]|$)/,
  /^replace(?:[-_]|$)/,
  /^placeholder(?:[-_]|$)/,
  /^your(?:[-_]|$)/,
  /^example(?:[-_]|$)/,
];

export function isProductionOAuthClientId(value) {
  if (typeof value !== 'string') return false;
  const clientId = value.trim();
  if (!clientId.toLowerCase().endsWith('.apps.googleusercontent.com')) return false;
  const prefix = clientId.slice(0, -'.apps.googleusercontent.com'.length).toLowerCase();
  return !PLACEHOLDER_PREFIXES.some((pattern) => pattern.test(prefix));
}

export function assertProductionOAuthClientId(value) {
  if (!isProductionOAuthClientId(value)) {
    throw new Error(
      'Web Store packaging requires VITE_GOOGLE_OAUTH_CLIENT_ID to contain a real Chrome Extension OAuth client ID.',
    );
  }
  return value.trim();
}

export function configureBuiltManifest(
  manifest,
  { oauthClientId, extensionKey, webStore = false },
) {
  const configured = structuredClone(manifest);
  if (!configured.oauth2 || typeof configured.oauth2 !== 'object') {
    throw new Error('Built manifest is missing its oauth2 configuration.');
  }

  configured.oauth2.client_id = webStore
    ? assertProductionOAuthClientId(oauthClientId)
    : oauthClientId?.trim() || DEVELOPMENT_OAUTH_CLIENT_ID;

  if (webStore) {
    delete configured.key;
  } else if (extensionKey?.trim()) {
    configured.key = extensionKey.trim();
  } else {
    delete configured.key;
  }
  return configured;
}

export function verifyProductionManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Web Store manifest verification expected a JSON object.');
  }
  assertProductionOAuthClientId(manifest.oauth2?.client_id);
  if (Object.prototype.hasOwnProperty.call(manifest, 'key')) {
    throw new Error('Web Store manifest must not contain a key field.');
  }
  if (!Array.isArray(manifest.host_permissions)) {
    throw new Error('Web Store manifest is missing host_permissions.');
  }
  for (const permission of REQUIRED_GOOGLE_HOST_PERMISSIONS) {
    if (!manifest.host_permissions.includes(permission)) {
      throw new Error(`Web Store manifest is missing required host permission: ${permission}`);
    }
  }
  return manifest;
}
