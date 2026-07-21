import { describe, expect, it, vi } from 'vitest';
import { emptyStore, type Bookmark } from '../domain/model';
import {
  AtlasLinksImportError,
  downloadAtlasLinksExport,
  parseAtlasLinksExport,
  prepareAtlasLinksImport,
  serializeAtlasLinksExport,
  type AtlasLinksImportRecord,
} from './atlasLinks';

const createdAt = '2025-01-01T00:00:00.000Z';
const updatedAt = '2026-01-01T00:00:00.000Z';
const exportedAt = '2026-07-14T12:00:00.000Z';

function bookmark(id: string, url = `https://${id}.example`): Bookmark {
  return {
    id,
    url,
    name: `Name ${id}`,
    description: `Description ${id}`,
    tags: ['Reference'],
    createdAt,
    updatedAt,
  };
}

function json(bookmarks: unknown[], overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    format: 'atlas-links',
    schemaVersion: 1,
    exportedAt,
    bookmarks,
    ...overrides,
  });
}

function record(overrides: Partial<AtlasLinksImportRecord> = {}): AtlasLinksImportRecord {
  return {
    url: 'https://new.example',
    name: 'New bookmark',
    description: '',
    tags: [],
    ...overrides,
  };
}

describe('Atlas Links export contract', () => {
  it('serializes active bookmarks deterministically with every supported field', () => {
    const store = emptyStore(updatedAt, 'private-device-id');
    store.revision = 41;
    store.bookmarks = [
      {
        ...bookmark('z', 'https://unicode.example/path?quote="yes"'),
        name: 'Café “notes”',
        description: 'Line one\nLine two',
        tags: ['Référence'],
      },
      bookmark('a'),
      { ...bookmark('deleted'), deletedAt: updatedAt },
    ];

    const first = serializeAtlasLinksExport(store, exportedAt);
    const second = serializeAtlasLinksExport(store, exportedAt);
    expect(first).toBe(second);
    expect(first.endsWith('\n')).toBe(true);
    expect(first).toContain('Café “notes”');
    expect(first).toContain('Line one\\nLine two');

    const decoded = JSON.parse(first) as Record<string, unknown>;
    expect(Object.keys(decoded)).toEqual(['format', 'schemaVersion', 'exportedAt', 'bookmarks']);
    expect(decoded).not.toHaveProperty('deviceId');
    expect(decoded).not.toHaveProperty('revision');
    expect(decoded).not.toHaveProperty('syncStatus');
    expect(decoded.bookmarks).toEqual([
      {
        id: 'a',
        url: 'https://a.example',
        name: 'Name a',
        description: 'Description a',
        tags: ['Reference'],
        createdAt,
        updatedAt,
      },
      {
        id: 'z',
        url: 'https://unicode.example/path?quote=%22yes%22',
        name: 'Café “notes”',
        description: 'Line one\nLine two',
        tags: ['Référence'],
        createdAt,
        updatedAt,
      },
    ]);
    expect(first).not.toContain('deleted');
    expect(first).not.toContain('deletedAt');
    expect(first).not.toContain('private-device-id');
  });

  it('round-trips an unchanged export without proposing changes', () => {
    const store = emptyStore(updatedAt, 'device');
    store.bookmarks = [bookmark('one'), bookmark('two')];
    const parsed = parseAtlasLinksExport(serializeAtlasLinksExport(store, exportedAt));
    const preview = prepareAtlasLinksImport(parsed.bookmarks, store.bookmarks);

    expect(parsed.invalid).toEqual([]);
    expect(preview).toMatchObject({
      newBookmarks: [],
      updated: [],
      conflicts: [],
    });
    expect(preview.unchanged).toHaveLength(2);
  });

  it('downloads with the stable filename and revokes its temporary object URL', () => {
    const anchor = {
      href: '',
      download: '',
      hidden: false,
      click: vi.fn(),
      remove: vi.fn(),
    };
    const environment = {
      body: { append: vi.fn() },
      createElement: vi.fn(() => anchor),
    };
    const objectUrls = {
      createObjectURL: vi.fn(() => 'blob:atlas-links'),
      revokeObjectURL: vi.fn(),
    };

    downloadAtlasLinksExport('{}', environment as never, objectUrls);

    expect(anchor.download).toBe('atlas-links.json');
    expect(anchor.href).toBe('blob:atlas-links');
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(anchor.remove).toHaveBeenCalledOnce();
    expect(objectUrls.revokeObjectURL).toHaveBeenCalledWith('blob:atlas-links');
  });
});

describe('Atlas Links export parser', () => {
  it('normalizes supported editable values and accepts new records without IDs or timestamps', () => {
    const parsed = parseAtlasLinksExport(
      json([
        {
          url: ' HTTPS://EXAMPLE.COM/#part ',
          name: ' Edited name ',
          description: ' Notes ',
          tags: [' Work ', 'Café'],
        },
      ]),
    );
    expect(parsed.bookmarks).toEqual([
      {
        url: 'https://example.com',
        name: 'Edited name',
        description: 'Notes',
        tags: ['Work', 'Café'],
      },
    ]);
  });

  it.each([
    ['invalid JSON', '{', /valid JSON/i],
    ['wrong format', json([], { format: 'other' }), /not an Atlas Links export/i],
    ['unsupported version', json([], { schemaVersion: 2 }), /version is not supported/i],
    ['invalid export time', json([], { exportedAt: 'yesterday' }), /timestamp/i],
    ['internal top-level field', json([], { revision: 4 }), /unsupported top-level field/i],
  ])('rejects %s', (_label, value, message) => {
    expect(() => parseAtlasLinksExport(value)).toThrow(message);
  });

  it('rejects duplicate IDs for the whole file', () => {
    const duplicate = {
      id: 'same',
      url: 'https://one.example',
      name: 'One',
      description: '',
      tags: [],
    };
    expect(() =>
      parseAtlasLinksExport(json([duplicate, { ...duplicate, url: 'https://two.example' }])),
    ).toThrow(/duplicate bookmark ID/i);
  });

  it('reports malformed records, unsafe URLs, invalid tags and timestamps without accepting them', () => {
    const parsed = parseAtlasLinksExport(
      json([
        {
          id: 'deleted',
          url: 'https://ok.example',
          name: 'Deleted',
          description: '',
          tags: [],
          deletedAt: updatedAt,
        },
        { url: 'javascript:alert(1)', name: 'Unsafe', description: '', tags: [] },
        { url: 'https://tags.example', name: 'Tags', description: '', tags: ['Work', ' work '] },
        {
          url: 'https://time.example',
          name: 'Time',
          description: '',
          tags: [],
          updatedAt: 'later',
        },
        { url: 'https://missing.example', name: 'Missing tags', description: '' },
      ]),
    );
    expect(parsed.bookmarks).toEqual([]);
    expect(parsed.invalid).toHaveLength(5);
    expect(parsed.invalid.map((item) => item.reason).join(' ')).toMatch(/deletedAt/i);
    expect(parsed.invalid.map((item) => item.reason).join(' ')).toMatch(/HTTP and HTTPS/i);
    expect(parsed.invalid.map((item) => item.reason).join(' ')).toMatch(/duplicated/i);
    expect(parsed.invalid.map((item) => item.reason).join(' ')).toMatch(/timestamp/i);
  });

  it('enforces configurable UTF-8 file and entry limits', () => {
    expect(() => parseAtlasLinksExport(json([]), { maxFileSizeBytes: 10 })).toThrow(/larger/i);
    expect(() => parseAtlasLinksExport(json([record(), record()]), { maxEntries: 1 })).toThrow(
      /more than 1 entries/i,
    );
  });
});

describe('Atlas Links import planning', () => {
  it('matches by ID for tag, name, and URL edits while preserving the intended target', () => {
    const local = bookmark('stable', 'https://old.example');
    const edited = record({
      id: 'stable',
      url: 'https://new.example',
      name: 'Renamed',
      description: local.description,
      tags: ['Personal'],
      createdAt: local.createdAt,
      updatedAt: local.updatedAt,
    });
    const preview = prepareAtlasLinksImport([edited], [local]);
    expect(preview.updated).toHaveLength(1);
    expect(preview.updated[0].target?.id).toBe('stable');
    expect(preview.updated[0].changes).toEqual(['url', 'name', 'tags']);
  });

  it('falls back to normalized URL matching and proposes unmatched records with or without IDs', () => {
    const local = bookmark('local', 'https://existing.example');
    const preview = prepareAtlasLinksImport(
      [
        record({
          id: 'foreign',
          url: 'https://EXISTING.example/#fragment',
          name: local.name,
          description: local.description,
          tags: ['Edited'],
        }),
        record({ id: 'preserve-me', url: 'https://with-id.example' }),
        record({ url: 'https://without-id.example' }),
      ],
      [local],
    );
    expect(preview.updated).toHaveLength(1);
    expect(preview.updated[0].target?.id).toBe('local');
    expect(preview.newBookmarks.map((proposal) => proposal.record.id)).toEqual([
      'preserve-me',
      undefined,
    ]);
  });

  it('surfaces ID/URL cross-collisions, duplicate URLs, repeated targets, and tombstoned IDs', () => {
    const one = bookmark('one', 'https://one.example');
    const two = bookmark('two', 'https://two.example');
    const deleted = { ...bookmark('gone', 'https://gone.example'), deletedAt: updatedAt };
    const preview = prepareAtlasLinksImport(
      [
        record({ id: 'one', url: two.url }),
        record({ id: 'gone', url: 'https://restored.example' }),
        record({ id: 'new-a', url: 'https://duplicate.example' }),
        record({ id: 'new-b', url: 'https://duplicate.example/#fragment' }),
        record({ url: one.url, name: one.name, description: one.description, tags: one.tags }),
        record({
          id: 'foreign',
          url: one.url,
          name: one.name,
          description: one.description,
          tags: one.tags,
        }),
      ],
      [one, two, deleted],
    );
    expect(preview.newBookmarks).toEqual([]);
    expect(preview.updated).toEqual([]);
    expect(preview.unchanged).toEqual([]);
    expect(preview.conflicts).toHaveLength(6);
    expect(preview.conflicts.map((conflict) => conflict.reason).join(' ')).toMatch(
      /different local bookmarks/i,
    );
    expect(preview.conflicts.map((conflict) => conflict.reason).join(' ')).toMatch(
      /deleted local record/i,
    );
  });

  it('does not infer changes for local bookmarks missing from the import', () => {
    const included = bookmark('included');
    const omitted = bookmark('omitted');
    const preview = prepareAtlasLinksImport(
      [
        record({
          id: included.id,
          url: included.url,
          name: included.name,
          description: included.description,
          tags: included.tags,
        }),
      ],
      [included, omitted],
    );
    expect(preview.unchanged.map((proposal) => proposal.target?.id)).toEqual(['included']);
    expect(JSON.stringify(preview)).not.toContain('omitted');
  });

  it('uses a specific import error type for contract failures', () => {
    expect(() => parseAtlasLinksExport('null')).toThrow(AtlasLinksImportError);
  });
});
