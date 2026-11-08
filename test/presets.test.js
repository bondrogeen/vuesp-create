import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getPreset, PRESETS, presetNames } from '../utils/presets.js';

test('presets expose required metadata', () => {
  for (const name of presetNames) {
    const preset = getPreset(name);
    assert.ok(preset.label, name);
    assert.ok(preset.summary, name);
    assert.ok(preset.description, name);
    assert.ok(Array.isArray(preset.platforms), name);
    assert.ok(Array.isArray(preset.tags), name);
    assert.ok(Array.isArray(preset.dashboard), name);
  }
});

test('getPreset rejects unknown names', () => {
  assert.throws(() => getPreset('unknown'), /Unknown preset/);
});

test('bms preset uses an ESP32-C3 board and mentions battery data', () => {
  const preset = PRESETS.bms;
  assert.equal(preset.board, 'esp32-c3-devkitm-1');
  assert.ok(preset.tags.includes('bms'));
  assert.ok(preset.dashboard.some((card) => card.id === 'device.voltage'));
});

test('led preset adds GPIO cards', () => {
  assert.deepEqual(PRESETS.led.dashboard.map((card) => card.id), ['ports.12', 'ports.13', 'ports.14']);
});
