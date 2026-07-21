import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type Manifest = {
  icons: Record<string, string>;
  action: { default_icon: Record<string, string> };
};

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(
  readFileSync(resolve(root, 'public/manifest.json'), 'utf8'),
) as Manifest;

function pngDimensions(path: string) {
  const png = readFileSync(path);
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
  expect(png[24]).toBe(8);
  expect(png[25]).toBe(6);
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

describe('extension icon assets', () => {
  it('provides an exact-size PNG for every manifest declaration', () => {
    const declarations = { ...manifest.icons, ...manifest.action.default_icon };

    for (const [declaredSize, relativePath] of Object.entries(declarations)) {
      expect(relativePath.endsWith('.png')).toBe(true);
      expect(pngDimensions(resolve(root, 'public', relativePath))).toEqual({
        width: Number(declaredSize),
        height: Number(declaredSize),
      });
    }
  });

  it('keeps only manifest PNGs in the public icon directory', () => {
    const declaredPaths = new Set([
      ...Object.values(manifest.icons),
      ...Object.values(manifest.action.default_icon),
    ]);
    const publicIcons = readdirSync(resolve(root, 'public/icons')).map((name) => `icons/${name}`);

    expect(publicIcons.sort()).toEqual([...declaredPaths].sort());
  });

  it('keeps the canonical editable SVG outside the public package', () => {
    expect(readFileSync(resolve(root, 'assets/atlas-links.svg'), 'utf8')).toMatch(
      /^<svg[\s\S]*<\/svg>\s*$/,
    );
  });
});
