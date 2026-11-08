import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PRESETS } from '../utils/presets.js';
import { scaffold } from '../utils/scaffold.js';

const platformio = `[common]
firmware_version = '{4, 0, 1}'
device_name = '"vuesp-"'

[platformio]
build_dir = build

[env:esp8266]
platform = espressif8266
board = esp12e

[env:esp32]
platform = espressif32
board = esp32dev
`;

const exists = async (path) => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};

test('scaffold applies the board, manifest and preset', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vuesp-create-scaffold-'));

  try {
    await mkdir(join(root, 'vue/json'), { recursive: true });
    await mkdir(join(root, 'vue/public'), { recursive: true });
    await writeFile(join(root, 'platformio.ini'), platformio);
    await writeFile(join(root, 'README.md'), '# Vuesp\n\nTemplate for your arduino projects with a web interface.\n\n## License\n\nMIT\n');
    await writeFile(join(root, 'AGENTS.md'), 'internal\n');
    await writeFile(join(root, 'DEVELOPMENT.md'), 'Vuesp development guide\n');
    await writeFile(join(root, 'CONTRIBUTING.md'), 'Vuesp contributing guide\n');
    await writeFile(join(root, 'SECURITY.md'), 'Vuesp security policy\n');
    await mkdir(join(root, 'docs/architecture'), { recursive: true });
    await writeFile(join(root, 'docs/architecture/prompt.md'), 'Vuesp architecture\n');
    await writeFile(join(root, 'vue/.env'), 'VITE_IP=192.168.1.2\n');
    await writeFile(
      join(root, 'vue/package.json'),
      JSON.stringify({ name: 'vuesp', version: '3.4.0', license: 'MIT', repository: { url: 'x' }, engines: { node: '>=20', npm: '>=10' } })
    );
    await writeFile(
      join(root, 'vue/package-lock.json'),
      JSON.stringify({ name: 'vuesp', version: '3.4.0', lockfileVersion: 3, packages: { '': { name: 'vuesp', version: '3.4.0' } } })
    );
    await writeFile(join(root, 'vue/index.html'), '<html><head><title>Vuesp</title><meta name="viewport" content="width=device-width"></head></html>');
    await writeFile(
      join(root, 'vue/json/dashboard.json'),
      JSON.stringify([
        { id: 'ports.12', name: 'ports.12', type: 'button', icon: 'bulb', args: ['ports.12.value', 'ports.12'] },
        { id: 'device.now', name: 'now', type: 'date', icon: 'timer', args: ['device.now', 'device'] },
      ])
    );
    await writeFile(
      join(root, 'vue/public/default.json'),
      JSON.stringify({ dashboard: [{ id: 'ports.12', name: 'ports.12', type: 'button', icon: 'bulb', args: [] }], menu: [], locales: {} })
    );

    const result = await scaffold(root, {
      name: 'vuesp.led',
      board: 'esp32',
      preset: PRESETS.led,
      presetName: 'led',
      template: { source: 'local', ref: 'local', commit: 'abc' },
      createdWith: 'vuesp-create@1.0.0',
      createdAt: '2026-11-08T00:00:00.000Z',
    });

    const pkg = JSON.parse(await readFile(join(root, 'vue/package.json'), 'utf8'));
    const lock = JSON.parse(await readFile(join(root, 'vue/package-lock.json'), 'utf8'));
    const manifest = JSON.parse(await readFile(join(root, '.vuesp.json'), 'utf8'));
    const dashboard = JSON.parse(await readFile(join(root, 'vue/json/dashboard.json'), 'utf8'));
    const defaults = JSON.parse(await readFile(join(root, 'vue/public/default.json'), 'utf8'));
    const readme = await readFile(join(root, 'README.md'), 'utf8');
    const docs = await readFile(join(root, 'DOCS.md'), 'utf8');

    assert.deepEqual(result.boards, ['esp8266', 'esp32']);
    assert.equal(pkg.name, 'vuesp.led');
    assert.equal(pkg.version, '0.1.0');
    assert.equal(pkg.private, true);
    assert.equal(lock.name, 'vuesp.led');
    assert.equal(manifest.name, 'vuesp.led');
    assert.equal(manifest.preset, 'led');
    assert.deepEqual(manifest.platforms, ['ESP32']);
    assert.equal(manifest.template.commit, 'abc');
    assert.deepEqual(
      dashboard.map((card) => card.id),
      ['device.now', 'ports.12', 'ports.13', 'ports.14']
    );
    assert.equal(dashboard.find((card) => card.id === 'ports.12').name, 'Light 1');
    assert.deepEqual(defaults.dashboard, dashboard);
    assert.match(readme, /^# vuesp\.led/m);
    assert.match(readme, /## Version history/);
    assert.match(readme, /\[Detailed documentation\]\(\.\/DOCS\.md\)/);
    assert.doesNotMatch(readme, /Vuesp architecture/);
    assert.match(docs, /^# vuesp\.led — documentation/m);
    assert.match(docs, /## Overview/);
    assert.match(docs, /\*\*Preset:\*\* LED/);
    assert.equal(await exists(join(root, 'vue/.env')), false);
    assert.equal(await exists(join(root, 'AGENTS.md')), false);
    assert.equal(await exists(join(root, 'docs')), false);
    assert.equal(await exists(join(root, 'DEVELOPMENT.md')), false);
    assert.equal(await exists(join(root, 'CONTRIBUTING.md')), false);
    assert.equal(await exists(join(root, 'SECURITY.md')), false);
    assert.equal(await exists(join(root, 'firmware')), false);
    assert.equal(await exists(join(root, 'demo-dist')), false);
    assert.equal(await exists(join(root, 'github/images/screen/.gitkeep')), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
