import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const cleanVersion = (value) => String(value ?? '').replace(/^v/, '').split(/[+-]/)[0];
const parts = (value) => cleanVersion(value).split('.').map((part) => Number.parseInt(part, 10) || 0);

/**
 * Compares two semver-like versions.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} positive when a > b
 */
export const compareVersions = (a, b) => {
  const left = parts(a);
  const right = parts(b);

  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference) return difference;
  }

  return 0;
};

/**
 * @param {string} latest
 * @param {string} current
 * @returns {boolean}
 */
export const isNewer = (latest, current) => compareVersions(latest, current) > 0;

const githubRepo = (source) => {
  if (!source) return null;
  const value = String(source)
    .replace(/^github:/, '')
    .replace(/^gh:/, '')
    .replace(/^https?:\/\/github\.com\//, '')
    .replace(/\.git$/, '');

  const [repoWithRef, hash] = value.split('#');
  const [owner, repo] = repoWithRef.split('/');
  if (!owner || !repo) return null;
  return { owner, repo, ref: hash || 'HEAD' };
};

const fetchJson = async (url) => {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'vuesp-create', Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
};

/**
 * Latest `vuesp-create` version from the npm registry.
 *
 * @returns {Promise<string | null>}
 */
export const latestCliVersion = async () => {
  const data = await fetchJson('https://registry.npmjs.org/vuesp-create/latest');
  return typeof data?.version === 'string' ? data.version : null;
};

/**
 * Latest commit SHA of a GitHub template.
 *
 * @param {{ source?: string, ref?: string }} template
 * @returns {Promise<string | null>}
 */
export const latestTemplateCommit = async ({ source, ref } = {}) => {
  const github = githubRepo(source);
  if (!github) return null;

  const branch = ref || github.ref;
  const data = await fetchJson(`https://api.github.com/repos/${github.owner}/${github.repo}/commits/${encodeURIComponent(branch)}`);
  return typeof data?.sha === 'string' ? data.sha : null;
};

/**
 * Current commit of a local git checkout.
 *
 * @param {string} dir
 * @returns {string | null}
 */
export const localGitCommit = (dir) => {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: dir,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });

  return result.status === 0 ? result.stdout.trim() : null;
};

/**
 * Parses `npm outdated --json` output.
 *
 * @param {string} output
 * @returns {Array<{ name: string, current: string, wanted: string, latest: string }>}
 */
export const parseOutdated = (output) => {
  try {
    const data = JSON.parse(output || '{}');
    return Object.entries(data).map(([name, info]) => ({
      name,
      current: String(info?.current ?? ''),
      wanted: String(info?.wanted ?? ''),
      latest: String(info?.latest ?? ''),
    }));
  } catch {
    return [];
  }
};

/**
 * Returns outdated dependencies from vue/package.json, or null when
 * node_modules is not installed yet.
 *
 * @param {string} dir project root
 * @returns {Array<{ name: string, current: string, wanted: string, latest: string }> | null}
 */
export const outdatedDependencies = (dir) => {
  if (!existsSync(join(dir, 'vue/node_modules'))) return null;

  const result = spawnSync('npm', ['outdated', '--json'], {
    cwd: join(dir, 'vue'),
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 60_000,
  });

  if (result.error) return null;
  return parseOutdated(result.stdout ?? '');
};

/**
 * Collects update information for a project.
 *
 * @param {{ dir: string, manifest?: object | null, cliVersion: string }} options
 * @returns {Promise<object>}
 */
export const checkProjectUpdates = async ({ dir, manifest, cliVersion }) => {
  const template = manifest?.template ?? {};
  const source = template.source ?? '';
  const isLocal = typeof source === 'string' && (source.startsWith('.') || source.startsWith('/') || source.startsWith('file:') || source.startsWith('~'));

  const latestCommit = isLocal
    ? localGitCommit(resolve(source.startsWith('file:') ? source.slice(5) : source))
    : await latestTemplateCommit(template);

  const latestCli = await latestCliVersion();
  const dependencies = outdatedDependencies(dir);

  return {
    cli: {
      current: cliVersion,
      latest: latestCli,
      updateAvailable: Boolean(latestCli && isNewer(latestCli, cliVersion)),
    },
    template: {
      source: template.source ?? null,
      ref: template.ref ?? null,
      current: template.commit ?? null,
      latest: latestCommit,
      updateAvailable: Boolean(template.commit && latestCommit && template.commit !== latestCommit),
    },
    dependencies,
    dependencyUpdates: (dependencies ?? []).filter((item) => item.latest && isNewer(item.latest, item.current)),
  };
};
