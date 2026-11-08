import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MANIFEST_FILE, normalizeManifest, readManifest, writeManifest } from '../utils/manifest.js';

test('normalizeManifest trims, deduplicates and limits values', () => {
  const manifest = normalizeManifest({
    name: '  vuesp.bms  ',
    summary: '  Battery project  ',
    description: '## About',
    platforms: ['ESP32-C3', 'ESP32-C3', ' ESP32 '],
    tags: ['bms', 'bms', 'battery'],
    preset: 'bms',
    template: { source: 'github:bondrogeen/vuesp', ref: 'HEAD', commit: 'abc' },
  });

  assert.equal(manifest.name, 'vuesp.bms');
  assert.equal(manifest.summary, 'Battery project');
  assert.deepEqual(manifest.platforms, ['ESP32-C3', 'ESP32']);
  assert.deepEqual(manifest.tags, ['bms', 'battery']);
  assert.equal(manifest.preset, 'bms');
  assert.deepEqual(manifest.template, { source: 'github:bondrogeen/vuesp', ref: 'HEAD', commit: 'abc' });
});

test('normalizeManifest requires a name and summary', () => {
  assert.equal(normalizeManifest({ name: 'x' }), null);
  assert.equal(normalizeManifest({ summary: 'x' }), null);
  assert.equal(normalizeManifest(null), null);
});

test('writeManifest and readManifest round-trip', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { readFile } = await import('node:fs/promises');

  const root = await mkdtemp(join(tmpdir(), 'vuesp-create-manifest-'));

  try {
    await writeManifest(root, { name: 'vuesp.led', summary: 'LED project', platforms: ['ESP32'], tags: ['led'] });

    const raw = await readFile(join(root, MANIFEST_FILE), 'utf8');
    assert.match(raw, /"name": "vuesp.led"/);
    assert.deepEqual(await readManifest(root), {
      $schema: 'https://vuesp.ru/schema/vuesp-project.json',
      name: 'vuesp.led',
      summary: 'LED project',
      description: '',
      platforms: ['ESP32'],
      tags: ['led'],
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('readManifest returns null for invalid json', async () => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');

  const root = await mkdtemp(join(tmpdir(), 'vuesp-create-manifest-bad-'));

  try {
    await writeFile(join(root, MANIFEST_FILE), '{nope');
    assert.equal(await readManifest(root), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
