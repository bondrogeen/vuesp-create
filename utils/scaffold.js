import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { addCards, removeCards } from './dashboard.js';
import { buildManifest, writeManifest } from './manifest.js';
import { getBoardInfo, listBoards, updatePlatformio } from './platformio.js';
import { buildDocs, buildReadme, updateIndexHtml, updatePackageJson, updatePackageLock } from './project.js';

const read = (path) => readFile(path, 'utf8');
const write = (path, value) => writeFile(path, value, 'utf8');

/**
 * Applies the project name and board to a downloaded Vuesp template.
 *
 * @param {string} dir project directory
 * @param {{
 *   name: string,
 *   packageName?: string,
 *   board: string,
 *   preset?: { label: string, summary: string, description: string, platforms: string[], tags: string[], dashboard?: object[], replaceDashboardIds?: string[], note?: string } | null,
 *   presetName?: string,
 *   template?: { source?: string, ref?: string, commit?: string },
 *   createdWith?: string,
 *   createdAt?: string,
 * }} options
 * @returns {Promise<{ boards: string[], boardInfo: { platform: string | null, board: string | null }, manifest: object }>}
 */
export const scaffold = async (
  dir,
  { name, packageName = name, board, preset = null, presetName, template = {}, createdWith = '', createdAt = new Date().toISOString() }
) => {
  const platformioPath = join(dir, 'platformio.ini');
  const platformio = await read(platformioPath);
  const boards = listBoards(platformio);

  if (!boards.includes(board)) {
    throw new Error(`Unknown board "${board}". Available boards: ${boards.join(', ')}`);
  }

  const summary = preset?.summary ?? `${name} — Vuesp project with a local web interface`;
  const description =
    preset?.description ??
    [`## ${name}`, '', 'A project built with [Vuesp](https://github.com/bondrogeen/vuesp) — describe your device and its features here.'].join('\n');
  const boardInfo = getBoardInfo(platformio, board);

  await write(platformioPath, updatePlatformio(platformio, { board, name }));

  const packagePath = join(dir, 'vue/package.json');
  const packageJson = await read(packagePath);
  await write(packagePath, updatePackageJson(packageJson, { name: packageName, description: summary }));

  try {
    const lockPath = join(dir, 'vue/package-lock.json');
    const lock = await read(lockPath);
    await write(lockPath, updatePackageLock(lock, { name: packageName }));
  } catch {
    // The template does not have to ship a lockfile.
  }

  const readmePath = join(dir, 'README.md');
  await write(
    readmePath,
    buildReadme({
      name,
      summary,
      description,
    })
  );

  const docsPath = join(dir, 'DOCS.md');
  await write(
    docsPath,
    buildDocs({
      name,
      summary,
      description,
      presetLabel: preset?.label,
      presetNote: preset?.note,
    })
  );

  const indexPath = join(dir, 'vue/index.html');
  await write(indexPath, updateIndexHtml(await read(indexPath), { name, description: summary }));

  if (preset?.replaceDashboardIds?.length) {
    await removeCards(dir, preset.replaceDashboardIds);
  }
  if (preset?.dashboard?.length) {
    await addCards(dir, preset.dashboard);
  }

  const manifest = await writeManifest(
    dir,
    buildManifest({
      name,
      summary,
      description,
      platforms: preset?.platforms ?? [],
      tags: preset?.tags ?? [],
      preset: presetName,
      createdWith,
      createdAt,
      template,
    })
  );

  // The template repository accidentally tracks vue/.env with a developer's
  // device IP and credentials. Never carry it into a generated project.
  for (const file of ['vue/.env', 'vue/.env.local', 'vue/.env.screen.local', '.env', '.env.local']) {
    await rm(join(dir, file), { force: true });
  }

  // AGENTS.md is specific to the template repository and is not useful in a
  // generated project.
  await rm(join(dir, 'AGENTS.md'), { force: true });

  // Template documentation, screenshots and build artifacts describe the
  // Vuesp project itself, not the generated device.
  for (const path of ['docs', 'DEVELOPMENT.md', 'CONTRIBUTING.md', 'SECURITY.md', 'github', 'firmware', 'build', 'demo-dist', '.pio']) {
    await rm(join(dir, path), { recursive: true, force: true });
  }

  // Keep the conventional screenshot directory for the project owner.
  await mkdir(join(dir, 'github/images/screen'), { recursive: true });
  await writeFile(join(dir, 'github/images/screen/.gitkeep'), '', 'utf8');
  await writeFile(
    join(dir, 'github/images/README.md'),
    [
      '# Project images',
      '',
      '- `screen/` — project screenshots. The Vuesp catalog builds the gallery from this directory.',
      '- `cover.png` — optional cover image. Without it the catalog uses the default Vuesp cover template.',
      '',
      'Recommended screenshot size: 1440×900 or 1600×1000, PNG or WebP.',
      '',
    ].join('\n'),
    'utf8'
  );

  return { boards, boardInfo, manifest };
};
