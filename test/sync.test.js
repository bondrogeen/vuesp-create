import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { planSync, syncProject } from '../utils/sync.js';
import { run, runCapture } from '../utils/run.js';

const entry = (hash) => ({ hash, content: Buffer.from(hash) });

test('planSync marks files changed only upstream as safe updates', () => {
  const base = new Map([['vue/src/a.txt', entry('a1')], ['vue/src/b.txt', entry('b1')]]);
  const local = new Map([['vue/src/a.txt', 'a1'], ['vue/src/b.txt', 'b1']]);
  const target = new Map([
    ['vue/src/a.txt', entry('a2')],
    ['vue/src/b.txt', entry('b2')],
    ['vue/src/new.txt', entry('new')],
  ]);

  const plan = planSync({ local, base, target });
  assert.deepEqual(plan.summary, { add: 1, update: 2, delete: 0, conflict: 0 });
});

test('planSync reports files that differ from both base and target', () => {
  const base = new Map([['a', entry('1')], ['b', entry('1')], ['c', entry('1')]]);
  const local = new Map([['a', '1'], ['b', 'local'], ['c', '1']]);
  const target = new Map([['a', entry('2')], ['b', entry('2')], ['d', entry('4')]]);

  const plan = planSync({ local, base, target });
  assert.deepEqual(
    plan.files.sort((left, right) => left.path.localeCompare(right.path)),
    [
      { path: 'a', action: 'update' },
      { path: 'b', action: 'conflict' },
      { path: 'c', action: 'delete' },
      { path: 'd', action: 'add' },
    ]
  );
  assert.deepEqual(plan.summary, { add: 1, update: 1, delete: 1, conflict: 1 });
});

test('syncProject applies safe changes and preserves conflicting local edits', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vuesp-sync-test-'));
  const upstream = join(root, 'upstream');
  const project = join(root, 'project');

  try {
    await mkdir(join(upstream, 'vue/src'), { recursive: true });
    await writeFile(join(upstream, 'vue/src/a.txt'), 'a1\n');
    await writeFile(join(upstream, 'vue/src/b.txt'), 'b1\n');
    run('git', ['init', '-b', 'main', '-q'], { cwd: upstream });
    run('git', ['add', '-A'], { cwd: upstream });
    run('git', ['-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-qm', 'base'], { cwd: upstream });
    const base = runCapture('git', ['rev-parse', 'HEAD'], { cwd: upstream });

    await writeFile(join(upstream, 'vue/src/a.txt'), 'a2\n');
    await writeFile(join(upstream, 'vue/src/b.txt'), 'b2\n');
    await writeFile(join(upstream, 'vue/src/c.txt'), 'c2\n');
    run('git', ['add', '-A'], { cwd: upstream });
    run('git', ['-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-qm', 'target'], { cwd: upstream });
    const target = runCapture('git', ['rev-parse', 'HEAD'], { cwd: upstream });

    await mkdir(join(project, 'vue/src'), { recursive: true });
    await writeFile(join(project, 'vue/src/a.txt'), 'a1\n');
    await writeFile(join(project, 'vue/src/b.txt'), 'local\n');

    const manifest = {
      name: 'test',
      summary: 'test',
      description: '',
      platforms: [],
      tags: [],
      template: { source: upstream, commit: base },
    };
    await writeFile(join(project, '.vuesp.json'), `${JSON.stringify(manifest, null, 2)}\n`);

    const plan = await syncProject({ root: project, manifest });
    assert.deepEqual(
      plan.files.sort((left, right) => left.path.localeCompare(right.path)),
      [
        { path: 'vue/src/a.txt', action: 'update' },
        { path: 'vue/src/b.txt', action: 'conflict' },
        { path: 'vue/src/c.txt', action: 'add' },
      ]
    );

    await syncProject({ root: project, manifest, apply: true });
    assert.equal(await readFile(join(project, 'vue/src/a.txt'), 'utf8'), 'a2\n');
    assert.equal(await readFile(join(project, 'vue/src/b.txt'), 'utf8'), 'local\n');
    assert.equal(await readFile(join(project, 'vue/src/c.txt'), 'utf8'), 'c2\n');

    // A conflict must keep the old base so the next sync reports it again.
    const saved = JSON.parse(await readFile(join(project, '.vuesp.json'), 'utf8'));
    assert.equal(saved.template.commit, base);

    await syncProject({ root: project, manifest, apply: true, force: true });
    const forced = JSON.parse(await readFile(join(project, '.vuesp.json'), 'utf8'));
    assert.equal(forced.template.commit, target);
    assert.equal(await readFile(join(project, 'vue/src/b.txt'), 'utf8'), 'b2\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
