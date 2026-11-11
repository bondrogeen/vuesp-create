import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { cloneFork, cloneUrl } from '../utils/fork.js';
import { run, runCapture } from '../utils/run.js';

test('cloneUrl converts GitHub shorthand and keeps local paths', () => {
  assert.equal(cloneUrl('github:bondrogeen/vuesp'), 'https://github.com/bondrogeen/vuesp.git');
  assert.equal(cloneUrl('gh:bondrogeen/vuesp'), 'https://github.com/bondrogeen/vuesp.git');
  assert.equal(cloneUrl('https://github.com/bondrogeen/vuesp.git'), 'https://github.com/bondrogeen/vuesp.git');
  assert.equal(cloneUrl(''), null);
});

test('cloneFork preserves history and keeps the parent as upstream', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vuesp-create-fork-'));
  const parent = join(root, 'parent');
  const child = join(root, 'child');

  try {
    await mkdir(parent, { recursive: true });
    run('git', ['init', '-b', 'main'], { cwd: parent });
    await writeFile(join(parent, 'template.txt'), 'from parent\n');
    run('git', ['add', 'template.txt'], { cwd: parent });
    run(
      'git',
      ['-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-m', 'parent commit'],
      { cwd: parent }
    );

    const result = await cloneFork({ source: parent, dir: child });

    assert.equal(result.upstream, parent);
    assert.equal(runCapture('git', ['remote', 'get-url', 'upstream'], { cwd: child }), parent);
    assert.equal(runCapture('git', ['log', '--format=%s', '-1'], { cwd: child }), 'parent commit');
    assert.equal(await readFile(join(child, 'template.txt'), 'utf8'), 'from parent\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
