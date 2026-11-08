import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addCard, addCards, createInfoCard, createPortCard, findProjectRoot, readDashboard } from '../utils/dashboard.js';

test('createPortCard builds a button card', () => {
  assert.deepEqual(createPortCard({ type: 'button', gpio: 12, name: 'Light' }), {
    id: 'ports.12',
    name: 'Light',
    type: 'button',
    icon: 'bulb',
    args: ['ports.12.value', 'ports.12'],
    set: '({ ...a, value: v, command: 2})',
    getTo: "v ? 'ON' : 'OFF'",
  });
});

test('createPortCard builds a disabled dimmer card', () => {
  const card = createPortCard({ type: 'dimmer', gpio: 14, id: 'dimmer', disabled: true });

  assert.equal(card.id, 'dimmer');
  assert.deepEqual(card.opts, { disabled: 1 });
  assert.equal(card.getTo, 'v');
  assert.equal(card.icon, 'windy');
});

test('createPortCard rejects invalid GPIO', () => {
  assert.throws(() => createPortCard({ type: 'button', gpio: -1 }), /GPIO/);
  assert.throws(() => createPortCard({ type: 'button', gpio: 100 }), /GPIO/);
});

test('createInfoCard builds a sensor card with unit and transform', () => {
  const card = createInfoCard({ id: 'device.voltage', name: 'Voltage', path: 'device.voltage', unit: 'V', get: 'v / 100' });

  assert.deepEqual(card, {
    id: 'device.voltage',
    name: 'Voltage',
    type: 'info',
    icon: 'info',
    args: ['device.voltage'],
    get: 'v / 100',
    getTo: '`${v} V`',
  });
});

test('createInfoCard escapes a unit inside the template literal', () => {
  const card = createInfoCard({ id: 'x', path: 'x', unit: '`${oops}' });
  assert.equal(card.getTo, '`${v} {oops}`');
});

test('findProjectRoot walks up to the project root', async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');

  const root = await mkdtemp(join(tmpdir(), 'vuesp-create-root-'));
  try {
    await mkdir(join(root, 'vue/json'), { recursive: true });
    await writeFile(join(root, 'platformio.ini'), '[env:esp32]\nboard = esp32dev\n');
    await writeFile(join(root, 'vue/json/dashboard.json'), '[]\n');

    assert.equal(findProjectRoot(join(root, 'vue')), root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('addCard writes dashboard.json and default.json', async () => {
  const { mkdtemp, mkdir, writeFile, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');

  const root = await mkdtemp(join(tmpdir(), 'vuesp-create-dashboard-'));

  try {
    await mkdir(join(root, 'vue/json'), { recursive: true });
    await mkdir(join(root, 'vue/public'), { recursive: true });
    await writeFile(join(root, 'platformio.ini'), '[env:esp32]\n');
    await writeFile(join(root, 'vue/json/dashboard.json'), '[]\n');
    await writeFile(join(root, 'vue/public/default.json'), JSON.stringify({ dashboard: [], menu: [], locales: {} }));

    const card = createPortCard({ type: 'button', gpio: 12 });
    await addCard(root, card);

    const json = JSON.parse(await readFile(join(root, 'vue/json/dashboard.json'), 'utf8'));
    const defaults = JSON.parse(await readFile(join(root, 'vue/public/default.json'), 'utf8'));
    assert.deepEqual(json, [card]);
    assert.deepEqual(defaults.dashboard, [card]);
    assert.deepEqual(await readDashboard(root), [card]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('addCard rejects duplicate ids', async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');

  const root = await mkdtemp(join(tmpdir(), 'vuesp-create-duplicate-'));

  try {
    await mkdir(join(root, 'vue/json'), { recursive: true });
    await writeFile(join(root, 'platformio.ini'), '[env:esp32]\n');
    await writeFile(join(root, 'vue/json/dashboard.json'), JSON.stringify([createPortCard({ type: 'button', gpio: 12 })]));

    await assert.rejects(() => addCard(root, createPortCard({ type: 'button', gpio: 12 })), /already exists/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('addCards skips existing ids', async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');

  const root = await mkdtemp(join(tmpdir(), 'vuesp-create-cards-'));

  try {
    await mkdir(join(root, 'vue/json'), { recursive: true });
    await writeFile(join(root, 'platformio.ini'), '[env:esp32]\n');
    await writeFile(join(root, 'vue/json/dashboard.json'), JSON.stringify([createPortCard({ type: 'button', gpio: 12 })]));

    const result = await addCards(root, [
      createPortCard({ type: 'button', gpio: 12 }),
      createPortCard({ type: 'button', gpio: 13 }),
    ]);

    assert.equal(result.added.length, 1);
    assert.equal(result.skipped.length, 1);
    assert.deepEqual((await readDashboard(root)).map((card) => card.id), ['ports.12', 'ports.13']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
