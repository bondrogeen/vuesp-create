import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const MANIFEST_FILE = '.vuesp.json';
export const MANIFEST_SCHEMA = 'https://vuesp.ru/schema/vuesp-project.json';

export const LIMITS = {
  name: 120,
  summary: 300,
  description: 20_000,
  platforms: 20,
  platform: 64,
  tags: 20,
  tag: 32,
  preset: 64,
};

const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

const list = (value, maxItems, maxLength) => {
  if (!Array.isArray(value)) return [];
  const result = value
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim().slice(0, maxLength))
    .filter(Boolean);

  return [...new Set(result)].slice(0, maxItems);
};

/**
 * Normalizes a `.vuesp.json` payload. Used by the CLI and as a reference for
 * the backend prefill endpoint.
 *
 * @param {unknown} value
 * @returns {object | null}
 */
export const normalizeManifest = (value) => {
  if (!value || typeof value !== 'object') return null;
  const input = /** @type {Record<string, unknown>} */ (value);

  const name = text(input.name, LIMITS.name);
  const summary = text(input.summary, LIMITS.summary);
  if (!name || !summary) return null;

  const manifest = {
    $schema: typeof input.$schema === 'string' ? input.$schema : MANIFEST_SCHEMA,
    name,
    summary,
    description: text(input.description, LIMITS.description),
    platforms: list(input.platforms, LIMITS.platforms, LIMITS.platform),
    tags: list(input.tags, LIMITS.tags, LIMITS.tag),
  };

  const preset = text(input.preset, LIMITS.preset);
  if (preset) manifest.preset = preset;

  const createdWith = text(input.createdWith, 64);
  if (createdWith) manifest.createdWith = createdWith;

  const createdAt = text(input.createdAt, 40);
  if (createdAt) manifest.createdAt = createdAt;

  const template = input.template;
  if (template && typeof template === 'object') {
    const source = text(/** @type {Record<string, unknown>} */ (template).source, 300);
    const ref = text(/** @type {Record<string, unknown>} */ (template).ref, 120);
    const commit = text(/** @type {Record<string, unknown>} */ (template).commit, 64);
    if (source) manifest.template = { source, ...(ref ? { ref } : {}), ...(commit ? { commit } : {}) };
  }

  return manifest;
};

/**
 * Reads `.vuesp.json` from a project directory.
 *
 * @param {string} dir
 * @returns {Promise<object | null>}
 */
export const readManifest = async (dir) => {
  try {
    return normalizeManifest(JSON.parse(await readFile(join(dir, MANIFEST_FILE), 'utf8')));
  } catch {
    return null;
  }
};

/**
 * Writes `.vuesp.json`.
 *
 * @param {string} dir
 * @param {object} manifest
 * @returns {Promise<object>}
 */
export const writeManifest = async (dir, manifest) => {
  const normalized = normalizeManifest(manifest);
  if (!normalized) throw new Error('A manifest requires at least "name" and "summary"');

  await writeFile(join(dir, MANIFEST_FILE), `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return normalized;
};

/**
 * Builds the manifest written into a generated project.
 *
 * @param {{ name: string, summary: string, description: string, platforms: string[], tags: string[], preset?: string, createdWith?: string, createdAt?: string, template?: object }} input
 * @returns {object}
 */
export const buildManifest = (input) =>
  normalizeManifest({
    $schema: MANIFEST_SCHEMA,
    name: input.name,
    summary: input.summary,
    description: input.description,
    platforms: input.platforms,
    tags: input.tags,
    preset: input.preset,
    createdWith: input.createdWith,
    createdAt: input.createdAt,
    template: input.template,
  });
