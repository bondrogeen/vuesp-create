import assert from 'node:assert/strict';
import { test } from 'node:test';

import { compareVersions, isNewer, parseOutdated } from '../utils/updates.js';

test('compareVersions compares semantic versions', () => {
  assert.ok(compareVersions('1.2.0', '1.1.9') > 0);
  assert.ok(compareVersions('1.0.0', '1.0.1') < 0);
  assert.equal(compareVersions('v2.0.0', '2.0.0'), 0);
  assert.ok(compareVersions('2.0.0-beta', '1.9.9') > 0);
});

test('isNewer ignores a leading v', () => {
  assert.equal(isNewer('v1.2.3', '1.2.2'), true);
  assert.equal(isNewer('1.2.2', '1.2.3'), false);
  assert.equal(isNewer('1.2.3', '1.2.3'), false);
});

test('parseOutdated parses npm output', () => {
  const output = JSON.stringify({
    commander: { current: '14.0.3', wanted: '16.0.0', latest: '16.0.0' },
    giget: { current: '3.3.1', wanted: '3.3.1', latest: '3.3.1' },
  });

  assert.deepEqual(parseOutdated(output), [
    { name: 'commander', current: '14.0.3', wanted: '16.0.0', latest: '16.0.0' },
    { name: 'giget', current: '3.3.1', wanted: '3.3.1', latest: '3.3.1' },
  ]);
});

test('parseOutdated tolerates empty and broken output', () => {
  assert.deepEqual(parseOutdated(''), []);
  assert.deepEqual(parseOutdated('not json'), []);
});
