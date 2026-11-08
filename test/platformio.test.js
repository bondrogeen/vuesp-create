import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getBoardInfo, listBoards, selectBoard, setCommonValue, updatePlatformio } from '../utils/platformio.js';

const platformio = `; PlatformIO Project Configuration File
; https://docs.platformio.org/page/projectconf.html

[common]
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

[env:esp32-c3-devkitm-1]
platform = espressif32
board = esp32-c3-devkitm-1
`;

test('listBoards returns environments in file order', () => {
  assert.deepEqual(listBoards(platformio), ['esp8266', 'esp32', 'esp32-c3-devkitm-1']);
});

test('listBoards ignores comments that look like sections', () => {
  assert.deepEqual(listBoards('; [env:fake]\n[env:esp32]\nboard = esp32dev\n'), ['esp32']);
});

test('getBoardInfo reads platform and board of one environment', () => {
  assert.deepEqual(getBoardInfo(platformio, 'esp8266'), { platform: 'espressif8266', board: 'esp12e' });
  assert.deepEqual(getBoardInfo(platformio, 'missing'), { platform: null, board: null });
});

test('selectBoard keeps the selected environment and comments', () => {
  const result = selectBoard(platformio, 'esp32');

  assert.match(result, /\[env:esp32\]/);
  assert.doesNotMatch(result, /\[env:esp8266\]/);
  assert.doesNotMatch(result, /\[env:esp32-c3-devkitm-1\]/);
  assert.match(result, /^; PlatformIO Project Configuration File/);
  assert.match(result, /build_dir = build/);
});

test('selectBoard updates default_envs in [platformio]', () => {
  const text = '[platformio]\ndefault_envs = esp8266\n\n[env:esp8266]\nboard = esp12e\n\n[env:esp32]\nboard = esp32dev\n';
  const result = selectBoard(text, 'esp32');

  assert.match(result, /default_envs = esp32/);
});

test('selectBoard collapses extra blank lines', () => {
  const result = selectBoard(`[env:a]\nboard = a\n\n[env:b]\nboard = b\n\n`, 'b');
  assert.doesNotMatch(result, /\n{3,}/);
});

test('setCommonValue replaces an existing option', () => {
  const result = setCommonValue(platformio, 'device_name', '"my-project"');
  assert.match(result, /device_name = "my-project"/);
  assert.match(result, /firmware_version = '\{4, 0, 1\}'/);
});

test('setCommonValue inserts a missing option', () => {
  const result = setCommonValue('[common]\nfoo = 1\n\n[env:a]\nboard = a\n', 'bar', '"x"');
  assert.match(result, /\[common\]\nbar = "x"\nfoo = 1/);
});

test('updatePlatformio applies board, version and device name', () => {
  const result = updatePlatformio(platformio, { board: 'esp32-c3-devkitm-1', name: 'vuesp.bms-12v' });

  assert.match(result, /\[env:esp32-c3-devkitm-1\]/);
  assert.doesNotMatch(result, /\[env:esp8266\]/);
  assert.match(result, /firmware_version = '\{0, 1, 0\}'/);
  assert.match(result, /device_name = "vuesp.bms-12v"/);
});

test('updatePlatformio truncates a long device name to 20 characters', () => {
  const result = updatePlatformio(platformio, { board: 'esp32', name: 'a-very-long-project-name-12345' });
  assert.match(result, /device_name = "a-very-long-project"/);
});
