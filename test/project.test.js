import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  packageName,
  updateIndexHtml,
  updatePackageJson,
  updatePackageLock,
  updateReadme,
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

test('updateReadme replaces the template heading', () => {
  const result = updateReadme('# Vuesp\n\nVue + ESP = Vuesp\n', { name: 'vuesp.bms-12v' });

  assert.match(result, /^# vuesp\.bms-12v\n/);
  assert.match(result, /Generated from the \[Vuesp\]/);
  assert.match(result, /Vue \+ ESP = Vuesp/);
});

test('updateIndexHtml replaces the title and adds a description', () => {
  const template = '<html><head><title>Vuesp</title><meta name="viewport" content="width=device-width"></head></html>';
  const result = updateIndexHtml(template, { name: 'vuesp.bms-12v', description: 'My & project' });

  assert.match(result, /<title>vuesp\.bms-12v<\/title>/);
  assert.match(result, /<meta name="description" content="My &amp; project" \/>/);
});
