const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;

/**
 * Validates a folder and npm package name for a new project.
 *
 * @param {string} name
 * @returns {true | string} `true` or a human-readable error
 */
export const validateProjectName = (name) => {
  const value = (name ?? '').trim();

  if (!value) return 'Enter a project name';
  if (value.length > 100) return 'The name must be 100 characters or shorter';
  if (value.startsWith('.') || value.startsWith('_')) return 'The name cannot start with "." or "_"';
  if (value.includes('/')) return 'The project folder name cannot contain "/"';
  if (value !== value.toLowerCase()) return 'Use lowercase letters, digits, dots, dashes and underscores';
  if (!PACKAGE_NAME.test(value)) return 'Use lowercase letters, digits, dots, dashes and underscores';
  if (['node_modules', 'favicon.ico', 'add', 'check', 'help'].includes(value)) return `"${value}" is reserved`;

  return true;
};

/**
 * Validates an npm package name (scoped names are allowed).
 *
 * @param {string} name
 * @returns {true | string}
 */
export const validatePackageName = (name) => {
  const value = (name ?? '').trim();
  if (!value) return 'Enter a package name';
  if (!PACKAGE_NAME.test(value)) return 'Use lowercase letters, digits, dots, dashes and underscores (a scope is allowed)';
  return true;
};

/**
 * Empty folder name to a safe npm package name.
 *
 * @param {string} name
 * @returns {string}
 */
export const packageName = (name) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '') || 'vuesp-project';

/**
 * Updates vue/package.json for a freshly created project.
 *
 * @param {string} text
 * @param {{ name: string, description: string }} options
 * @returns {string}
 */
export const updatePackageJson = (text, { name, description }) => {
  const json = JSON.parse(text);

  json.name = name;
  json.version = '0.1.0';
  json.description = description;
  json.private = true;

  if (json.engines) {
    delete json.engines.npm;
    if (!Object.keys(json.engines).length) delete json.engines;
  }

  delete json.author;
  delete json.repository;
  delete json.homepage;
  delete json.bugs;

  return `${JSON.stringify(json, null, 2)}\n`;
};

/**
 * Updates the name/version fields of package-lock.json without reformatting it.
 *
 * @param {string} text
 * @param {{ name: string, version?: string }} options
 * @returns {string}
 */
export const updatePackageLock = (text, { name, version = '0.1.0' }) => {
  const json = JSON.parse(text);

  json.name = name;
  json.version = version;

  if (json.packages?.['']) {
    json.packages[''].name = name;
    json.packages[''].version = version;
  }

  // Keep the original formatting. npm writes lockfiles with two spaces and a
  // trailing newline, so a plain JSON round-trip only changes the two fields.
  return `${JSON.stringify(json, null, 2)}\n`;
};

/**
 * Builds a clean project README for a generated project.
 *
 * The Vuesp README is intentionally not copied: only a link to the parent
 * project is kept, the rest is a template for the current device.
 *
 * @param {{
 *   name: string,
 *   summary?: string,
 *   description?: string,
 *   board: string,
 *   presetLabel?: string,
 *   presetNote?: string,
 * }} options
 * @returns {string}
 */
export const buildReadme = ({ name, summary, description }) => {
  const about = (description || summary || '').trim() || 'Describe your device and its features here.';
  return [
    `# ${name}`,
    '',
    about,
    '',
    '## Version history',
    '',
    '- 0.1.0 — initial version.',
    '',
    '## Documentation',
    '',
    '- [Detailed documentation](./DOCS.md)',
    '- [Vuesp documentation](https://docs.vuesp.ru)',
    '- [vuesp-create](https://github.com/bondrogeen/vuesp-create)',
    '',
  ].join('\n');
};

/**
 * Builds a minimal DOCS.md skeleton for a generated project.
 *
 * @param {{
 *   name: string,
 *   summary?: string,
 *   description?: string,
 *   presetLabel?: string,
 *   presetNote?: string,
 * }} options
 * @returns {string}
 */
export const buildDocs = ({ name, summary, description, presetLabel, presetNote }) => {
  const overview = (description || summary || '').trim() || 'Describe your device and its features here.';
  const lines = [
    `# ${name} — documentation`,
    '',
    'Replace this template with the details of your device.',
    '',
    '## Overview',
    '',
    overview,
    '',
  ];

  if (presetNote) {
    lines.push(`> **Preset:** ${presetLabel} — ${presetNote}`, '');
  }

  lines.push(
    '## Features',
    '',
    '- Add the main features of your device here.',
    '',
    '## Web interface',
    '',
    'Describe the screens, dashboard cards and controls.',
    '',
    '## API',
    '',
    'Describe the HTTP endpoints, WebSocket messages and device commands.',
    '',
    '## Files',
    '',
    'Describe the configuration and user files stored on the device.',
    '',
    '## Links',
    '',
    '- [Vuesp](https://github.com/bondrogeen/vuesp)',
    '- [Documentation](https://docs.vuesp.ru)',
    '',
  );

  return lines.join('\n');
};

/**
 * Updates the browser tab title and description in vue/index.html.
 *
 * @param {string} text
 * @param {{ name: string, description: string }} options
 * @returns {string}
 */
export const updateIndexHtml = (text, { name, description }) => {
  let result = text.replace(/<title>.*<\/title>/, `<title>${escapeHtml(name)}</title>`);

  if (!/<meta\s+name="description"/i.test(result)) {
    result = result.replace(/<meta name="viewport"[^>]*>/, (tag) => `${tag}\n    <meta name="description" content="${escapeHtml(description)}" />`);
  }

  return result;
};

const escapeHtml = (value) =>
  value.replace(
    /[&<>"]/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
      })[character]
  );
