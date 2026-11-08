import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  packageName,
  updateIndexHtml,
  updatePackageJson,
  updatePackageLock,
  buildReadme,
  validatePackageName,
  validateProjectName,
} from '../utils/project.js';

test('validateProjectName accepts typical Vuesp names', () => {
  for (const name of ['vuesp.my-project', 'bms-12v', 'my_project', 'project2']) {
    assert.equal(validateProjectName(name), true, name);
  }
});

test('validateProjectName rejects unsafe names', () => {
  for (const name of ['', 'My-Project', '-project', '_project', 'a/b', 'node_modules']) {
    assert.notEqual(validateProjectName(name), true, name);
  }
});

test('validatePackageName allows scoped packages', () => {
  assert.equal(validatePackageName('vuesp.project'), true);
  assert.equal(validatePackageName('@bondrogeen/vuesp-project'), true);
  assert.notEqual(validatePackageName('Vuesp Project'), true);
});

test('packageName normalizes an input', () => {
  assert.equal(packageName('  Vuesp BMS 12V  '), 'vuesp-bms-12v');
});

test('updatePackageJson sets project metadata and drops template links', () => {
  const template = JSON.stringify({
    name: 'vuesp',
    version: '3.4.0',
    description: 'template',
    repository: { url: 'https://github.com/bondrogeen/vuesp' },
    homepage: 'https://vuesp.ru',
    bugs: { url: 'https://github.com/bondrogeen/vuesp/issues' },
    author: 'bondrogeen',
    license: 'MIT',
  });

  const result = JSON.parse(updatePackageJson(template, { name: 'vuesp.bms-12v', description: 'My project' }));

  assert.equal(result.name, 'vuesp.bms-12v');
  assert.equal(result.version, '0.1.0');
  assert.equal(result.description, 'My project');
  assert.equal(result.private, true);
  assert.equal(result.repository, undefined);
  assert.equal(result.homepage, undefined);
  assert.equal(result.bugs, undefined);
  assert.equal(result.author, undefined);
  assert.equal(result.license, 'MIT');
});

test('updatePackageLock updates the root name and version only', () => {
  const lock = JSON.stringify({ name: 'vuesp', version: '3.4.0', lockfileVersion: 3, packages: { '': { name: 'vuesp', version: '3.4.0' } } });
  const result = JSON.parse(updatePackageLock(lock, { name: 'vuesp.bms-12v' }));

  assert.equal(result.name, 'vuesp.bms-12v');
  assert.equal(result.version, '0.1.0');
  assert.equal(result.packages[''].name, 'vuesp.bms-12v');
  assert.equal(result.packages[''].version, '0.1.0');
});

test('buildReadme creates a project-specific README', () => {
  const result = buildReadme({
    name: 'vuesp.bms-12v',
    summary: 'Battery project',
    description: '## Battery management',
    board: 'esp32-c3-devkitm-1',
  });

  assert.match(result, /^# vuesp\.bms-12v\n/);
  assert.match(result, /\[Vuesp\]\(https:\/\/github\.com\/bondrogeen\/vuesp\)/);
  assert.match(result, /## Battery management/);
  assert.match(result, /pio run -e esp32-c3-devkitm-1/);
  assert.match(result, /vuesp-create/);
  assert.doesNotMatch(result, /Vue \+ ESP = Vuesp/);
  assert.doesNotMatch(result, /Acknowledgments/);
});

test('buildReadme includes the preset note', () => {
  const result = buildReadme({
    name: 'vuesp.led',
    summary: 'LED project',
    description: '',
    board: 'esp32',
    presetLabel: 'LED · lighting',
    presetNote: 'GPIO 12/13 are buttons.',
  });

  assert.match(result, /\*\*Preset:\*\* LED · lighting/);
  assert.match(result, /GPIO 12\/13 are buttons/);
});

test('updateIndexHtml replaces the title and adds a description', () => {
  const template = '<html><head><title>Vuesp</title><meta name="viewport" content="width=device-width"></head></html>';
  const result = updateIndexHtml(template, { name: 'vuesp.bms-12v', description: 'My & project' });

  assert.match(result, /<title>vuesp\.bms-12v<\/title>/);
  assert.match(result, /<meta name="description" content="My &amp; project" \/>/);
});
