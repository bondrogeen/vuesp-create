import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { writeManifest } from './manifest.js';
import { spawnSync } from 'node:child_process';

import { cloneUrl } from './fork.js';

export const DEFAULT_SYNC_PATHS = ['vue/src', 'vue/scripts', 'vue/package.json', 'vue/vite.config.ts'];

const git = (cwd, args, encoding = 'utf8') =>
  spawnSync('git', args, {
    cwd,
    encoding,
    maxBuffer: 20 * 1024 * 1024,
  });

const gitText = (cwd, args) => {
  const result = git(cwd, args);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || 'git command failed').trim());
  return result.stdout.trim();
};

const gitBuffer = (cwd, args) => {
  const result = git(cwd, args, null);
  if (result.error) throw result.error;
  if (result.status !== 0) return null;
  return Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? '');
};

const hash = (value) => createHash('sha256').update(value).digest('hex');

const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

/** Reads `.vuesp-sync.json` and falls back to the manifest/default paths. */
export const readSyncConfig = (root, manifest = null) => {
  const local = readJson(join(root, '.vuesp-sync.json')) ?? {};
  const paths = Array.isArray(local.paths) && local.paths.length ? local.paths.filter((item) => typeof item === 'string') : DEFAULT_SYNC_PATHS;
  const upstream = typeof local.upstream === 'string' ? local.upstream : manifest?.template?.source;
  const ref = typeof local.ref === 'string' ? local.ref : manifest?.template?.ref;
  return { paths, upstream, ref: ref && ref !== 'HEAD' && ref !== 'local' ? ref : undefined };
};

/** Maps every local file under the configured paths to its content hash. */
export const collectLocalFiles = (root, paths) => {
  const result = new Map();
  const walk = (path) => {
    const full = join(root, path);
    if (!existsSync(full)) return;
    const stats = statSync(full);
    if (stats.isDirectory()) {
      for (const name of readdirSync(full)) walk(join(path, name));
      return;
    }
    if (!stats.isFile()) return;
    result.set(path.split(sep).join('/'), hash(readFileSync(full)));
  };
  for (const path of paths) walk(path);
  return result;
};

const listTreeFiles = (cwd, rev, paths) => {
  const result = gitText(cwd, ['ls-tree', '-r', '--name-only', '-z', rev, '--', ...paths]);
  return result.split('\0').filter(Boolean);
};

const collectTreeFiles = (cwd, rev, paths) => {
  const result = new Map();
  for (const path of listTreeFiles(cwd, rev, paths)) {
    const content = gitBuffer(cwd, ['show', `${rev}:${path}`]);
    if (content !== null) result.set(path, { hash: hash(content), content });
  }
  return result;
};

/**
 * Builds a three-way plan between the recorded base, the local tree and the
 * upstream target.
 */
export const planSync = ({ local, base, target }) => {
  const paths = [...new Set([...base.keys(), ...local.keys(), ...target.keys()])].sort();
  const files = [];

  for (const path of paths) {
    const b = base.get(path)?.hash;
    const l = local.get(path);
    const t = target.get(path)?.hash;

    let action = 'skip';
    if (t === b) action = 'skip';
    else if (l === t) action = 'skip';
    else if (b === undefined) action = l === undefined ? 'add' : 'conflict';
    else if (t === undefined) action = l === undefined ? 'skip' : l === b ? 'delete' : 'conflict';
    else action = l === b ? 'update' : 'conflict';

    if (action !== 'skip') files.push({ path, action });
  }

  const summary = { add: 0, update: 0, delete: 0, conflict: 0 };
  for (const file of files) summary[file.action] += 1;
  return { files, summary };
};

const writeTargetFile = async (root, path, content) => {
  const full = join(root, path);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content);
};

/**
 * Compares a project with its upstream template. When `apply` is true, safely
 * applies non-conflicting changes and writes `template.commit/ref` back to the
 * manifest.
 */
export const syncProject = async ({
  root,
  manifest = null,
  upstream,
  ref,
  from,
  apply = false,
  force = false,
}) => {
  const config = readSyncConfig(root, manifest);
  const source = upstream ?? config.upstream;
  const targetRef = ref ?? config.ref;
  const baseCommit = from ?? manifest?.template?.commit;

  if (!source) throw new Error('No upstream template source. Add "upstream" to .vuesp-sync.json.');
  if (!baseCommit) throw new Error('No base commit. Pass --from or add template.commit to .vuesp.json.');

  const url = cloneUrl(source);
  if (!url) throw new Error(`Unsupported upstream source: ${source}`);

  const temp = await mkdtemp(join(tmpdir(), 'vuesp-sync-'));
  const repo = join(temp, 'repo');
  try {
    const cloned = git(temp, ['clone', '--no-checkout', '--quiet', url, repo]);
    if (cloned.error) throw cloned.error;
    if (cloned.status !== 0) throw new Error((cloned.stderr || 'git clone failed').trim());

    const base = gitText(repo, ['rev-parse', `${baseCommit}^{commit}`]);
    const target = gitText(repo, ['rev-parse', `${targetRef ?? 'HEAD'}^{commit}`]);
    const baseFiles = collectTreeFiles(repo, base, config.paths);
    const targetFiles = collectTreeFiles(repo, target, config.paths);
    const localFiles = collectLocalFiles(root, config.paths);
    const plan = planSync({ local: localFiles, base: baseFiles, target: targetFiles });

    if (apply) {
      for (const file of plan.files) {
        if (file.action === 'conflict' && !force) continue;
        const content = targetFiles.get(file.path)?.content;
        if (content === undefined) {
          await rm(join(root, file.path), { force: true });
        } else {
          await writeTargetFile(root, file.path, content);
        }
      }

      // Keep the old base while conflicts are unresolved, otherwise the next
      // sync would hide them. `--force` resolves them by taking upstream.
      if (manifest && (force || plan.summary.conflict === 0)) {
        const next = {
          ...manifest,
          template: {
            ...(manifest.template ?? {}),
            ...(source ? { source } : {}),
            ...(targetRef ? { ref: targetRef } : {}),
            commit: target,
          },
        };
        await writeManifest(root, next);
      }
    }

    return { upstream: source, base, target, ref: targetRef ?? 'HEAD', ...plan };
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
};

