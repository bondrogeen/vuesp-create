import { resolve, sep } from 'node:path';

import { run } from './run.js';

const isLocalSource = (source) =>
  source.startsWith('.') || source.startsWith('/') || source.startsWith('file:') || source.startsWith('~');

const normalizeLocalSource = (source) =>
  (source.startsWith('file:') ? source.slice(5) : source).replace(/^~(?=$|\/|\\)/, process.env.HOME ?? '~');

/**
 * Converts a template source into a URL/path accepted by `git clone`.
 *
 * @param {string} source
 * @returns {string | null}
 */
export const cloneUrl = (source) => {
  if (!source) return null;
  if (isLocalSource(source)) return resolve(normalizeLocalSource(source));
  if (/^(git@|ssh:\/\/|git:\/\/|https?:\/\/)/.test(source)) return source;

  const repo = source
    .replace(/^github:/, '')
    .replace(/^gh:/, '')
    .replace(/\.git$/, '');
  const [owner, name] = repo.split('/');
  if (!owner || !name) return null;
  return `https://github.com/${owner}/${name}.git`;
};

/**
 * Clones a template as a history-preserving fork and keeps the template as
 * the `upstream` remote. The project then shares git history with the parent,
 * so future updates can be merged instead of applied as patches.
 *
 * @param {{ source: string, ref?: string, dir: string }} options
 * @returns {{ dir: string, upstream: string }}
 */
export const cloneFork = ({ source, ref, dir }) => {
  const [baseSource, sourceRef] = source.split('#');
  const upstream = cloneUrl(baseSource);
  if (!upstream) throw new Error(`Fork mode requires a git repository source, received "${source}"`);

  if (isLocalSource(baseSource)) {
    const root = resolve(normalizeLocalSource(baseSource));
    const target = resolve(dir);
    if (target === root || target.startsWith(`${root}${sep}`)) {
      throw new Error('The target directory must be outside the template directory');
    }
  }

  run('git', ['clone', upstream, dir]);

  const targetRef = ref ?? sourceRef;
  if (targetRef) {
    run('git', ['checkout', targetRef], { cwd: dir });
  }

  run('git', ['remote', 'rename', 'origin', 'upstream'], { cwd: dir });

  return { dir, upstream };
};
