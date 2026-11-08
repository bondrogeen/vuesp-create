const SECTION = /^\s*\[([^\]]+)\]\s*$/;
const DEFAULT_ENVS = /^\s*default_envs\s*=/;

const normalize = (text) => text.replace(/\r\n/g, '\n');

const collapseBlankLines = (text) => text.replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '\n');

/**
 * Returns the board names declared as `[env:<board>]` sections.
 *
 * @param {string} text platformio.ini contents
 * @returns {string[]}
 */
export const listBoards = (text) => {
  const boards = [];

  for (const line of normalize(text).split('\n')) {
    const match = line.match(SECTION);
    if (!match) continue;
    const name = match[1].trim();
    if (name.startsWith('env:')) boards.push(name.slice(4).trim());
  }

  return boards;
};

/**
 * Reads platform/board values of a single environment.
 *
 * @param {string} text platformio.ini contents
 * @param {string} board environment name
 * @returns {{ platform: string | null, board: string | null }}
 */
export const getBoardInfo = (text, board) => {
  const lines = normalize(text).split('\n');
  let section = '';
  let platform = null;
  let boardName = null;

  for (const line of lines) {
    const match = line.match(SECTION);
    if (match) {
      section = match[1].trim();
      continue;
    }
    if (section !== `env:${board}`) continue;

    platform ??= line.match(/^\s*platform\s*=\s*(.+?)\s*$/)?.[1] ?? null;
    boardName ??= line.match(/^\s*board\s*=\s*(.+?)\s*$/)?.[1] ?? null;
  }

  return { platform, board: boardName };
};

/**
 * Keeps only the selected `[env:<board>]` section, drops the other
 * environments and preserves comments and the rest of the file.
 *
 * @param {string} text platformio.ini contents
 * @param {string} board environment name
 * @returns {string}
 */
export const selectBoard = (text, board) => {
  const lines = normalize(text).split('\n');
  const result = [];
  let section = '';
  let skip = false;

  for (const line of lines) {
    const match = line.match(SECTION);

    if (match) {
      section = match[1].trim();
      skip = section.startsWith('env:') && section !== `env:${board}`;
      if (skip) continue;
    }

    if (skip) continue;

    if (section === 'platformio' && DEFAULT_ENVS.test(line)) {
      result.push(`default_envs = ${board}`);
      continue;
    }

    result.push(line);
  }

  return collapseBlankLines(result.join('\n'));
};

/**
 * Sets `key = value` inside `[common]`, keeping the rest of the file intact.
 *
 * @param {string} text platformio.ini contents
 * @param {string} key option name
 * @param {string} value raw value (already quoted when needed)
 * @returns {string}
 */
export const setCommonValue = (text, key, value) => {
  const lines = normalize(text).split('\n');
  const start = lines.findIndex((line) => line.match(SECTION)?.[1]?.trim() === 'common');
  if (start === -1) return text;

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (SECTION.test(lines[index])) {
      end = index;
      break;
    }
  }

  let replaced = false;
  for (let index = start + 1; index < end; index += 1) {
    if (new RegExp(`^\\s*${key}\\s*=`).test(lines[index])) {
      lines[index] = `${key} = ${value}`;
      replaced = true;
    }
  }

  if (!replaced) lines.splice(start + 1, 0, `${key} = ${value}`);

  return collapseBlankLines(lines.join('\n'));
};

/**
 * Applies the project metadata to platformio.ini:
 * one board, a fresh firmware version and a device name.
 *
 * @param {string} text platformio.ini contents
 * @param {{ board: string, name: string, version?: string }} options
 * @returns {string}
 */
export const updatePlatformio = (text, { board, name, version = '{0, 1, 0}' }) => {
  const deviceName = name.slice(0, 20).replace(/[-._]+$/, '') || name.slice(0, 20);
  let result = selectBoard(text, board);
  result = setCommonValue(result, 'firmware_version', `'${version}'`);
  // The INI parser strips one level of quotes, so wrap the JSON string in
  // single quotes to keep "name" quoted in the -D build flag.
  result = setCommonValue(result, 'device_name', `'${JSON.stringify(deviceName)}'`);
  return result;
};
