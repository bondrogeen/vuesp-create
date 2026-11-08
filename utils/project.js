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
export const buildReadme = ({ name, summary, description, board, presetLabel, presetNote }) => {
  const about = (description || summary || '').trim() || 'Describe your device and its features here.';
  const lines = [
    `# ${name}`,
    '',
    '> A project built with [Vuesp](https://github.com/bondrogeen/vuesp) — a local web interface for ESP32, ESP32-C3 and ESP8266.',
    '',
    '## About',
    '',
    about,
    '',
  ];

  if (presetNote) {
    lines.push(`> **Preset:** ${presetLabel} — ${presetNote}`, '');
  }

  lines.push(
    '## Quick start',
    '',
    '### Web interface',
    '',
    '```bash',
    'cd vue',
    'npm install',
    'cp .env.example .env',
    'npm run dev',
    '```',
    '',
    'Set `VITE_IP` in `vue/.env` to the device IP and open <http://localhost:3000>.',
    '',
    '### Firmware',
    '',
    '```bash',
    `pio run -e ${board}`,
    '```',
    '',
    '## Project structure',
    '',
    '```text',
    'src/              # firmware sources',
    'vue/              # Vue 3 + Vite web interface',
    'platformio.ini    # PlatformIO configuration',
    '.vuesp.json       # project manifest for the Vuesp catalog',
    '```',
    '',
    '## Publish to the Vuesp catalog',
    '',
    '1. Push the project to a public GitHub repository.',
    '2. Open <https://lk.vuesp.ru/projects/new>, paste the repository URL and press **Заполнить**.',
    '3. Submit the project for moderation.',
    '',
    '## Links',
    '',
    '- [Vuesp](https://github.com/bondrogeen/vuesp) — the parent project',
    '- [vuesp-create](https://github.com/bondrogeen/vuesp-create) — project generator',
    '- [Documentation](https://docs.vuesp.ru)',
    '- [Project catalog](https://vuesp.ru/projects)',
    '',
    '## License',
    '',
    'MIT',
    ''
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
