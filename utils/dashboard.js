import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export const CARD_TYPES = ['button', 'dimmer', 'info', 'chart', 'list', 'input', 'date'];

const ICONS = {
  button: 'bulb',
  dimmer: 'windy',
  info: 'info',
  chart: 'chart',
  list: 'store',
  input: 'noti',
  date: 'timer',
};

const safeText = (value, fallback) => (typeof value === 'string' && value.trim() ? value.trim() : fallback);

const safeUnit = (unit) => (typeof unit === 'string' ? unit.replace(/[`\\$]/g, '').trim() : '');

const expression = (get) => (typeof get === 'string' && get.trim() ? get.trim() : undefined);

/**
 * Finds the root of a Vuesp project (a folder with platformio.ini and vue/).
 *
 * @param {string} [start]
 * @returns {string}
 */
export const findProjectRoot = (start = process.cwd()) => {
  let dir = resolve(start);

  while (true) {
    if (existsSync(join(dir, 'platformio.ini')) && existsSync(join(dir, 'vue'))) return dir;

    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error('Not a Vuesp project: platformio.ini and vue/ were not found');
    }
    dir = parent;
  }
};

/**
 * Reads dashboard cards from json/dashboard.json or public/default.json.
 *
 * @param {string} dir project root
 * @returns {Promise<object[]>}
 */
export const readDashboard = async (dir) => {
  const dashboardPath = join(dir, 'vue/json/dashboard.json');

  try {
    const parsed = JSON.parse(await readFile(dashboardPath, 'utf8'));
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Fall through to public/default.json.
  }

  try {
    const parsed = JSON.parse(await readFile(join(dir, 'vue/public/default.json'), 'utf8'));
    if (Array.isArray(parsed.dashboard)) return parsed.dashboard;
  } catch {
    // No dashboard in the project.
  }

  return [];
};

/**
 * Writes dashboard cards to json/dashboard.json and, when present, to
 * public/default.json (the file served by the device before the first save).
 *
 * @param {string} dir project root
 * @param {object[]} cards
 */
export const writeDashboard = async (dir, cards) => {
  await writeFile(join(dir, 'vue/json/dashboard.json'), `${JSON.stringify(cards, null, 2)}\n`, 'utf8');

  const defaultPath = join(dir, 'vue/public/default.json');
  if (!existsSync(defaultPath)) return;

  try {
    const parsed = JSON.parse(await readFile(defaultPath, 'utf8'));
    parsed.dashboard = cards;
    // default.json is generated as a compact single-line file.
    await writeFile(defaultPath, JSON.stringify(parsed), 'utf8');
  } catch {
    // Do not break the project if the generated file is malformed.
  }
};

/**
 * @param {{ type?: string, gpio: number, id?: string, name?: string, icon?: string, disabled?: boolean }} options
 */
export const createPortCard = ({ type = 'button', gpio, id, name, icon, disabled = false }) => {
  if (!CARD_TYPES.includes(type) || !['button', 'dimmer', 'info'].includes(type)) {
    throw new Error(`Unsupported port card type "${type}"`);
  }
  if (!Number.isInteger(gpio) || gpio < 0 || gpio > 48) throw new Error('GPIO must be an integer between 0 and 48');

  const cardId = safeText(id, `ports.${gpio}`);
  const card = {
    id: cardId,
    name: safeText(name, cardId),
    type,
    icon: safeText(icon, ICONS[type]),
    args: [`ports.${gpio}.value`, `ports.${gpio}`],
  };

  if (disabled) card.opts = { disabled: 1 };
  if (type !== 'info') card.set = '({ ...a, value: v, command: 2})';
  if (type === 'button') card.getTo = "v ? 'ON' : 'OFF'";
  if (type === 'dimmer') card.getTo = 'v';
  if (type === 'info') card.getTo = 'v';

  return card;
};

/**
 * @param {{ id: string, name?: string, path: string, icon?: string, unit?: string, get?: string }} options
 */
export const createInfoCard = ({ id, name, path, icon, unit, get }) => {
  if (!safeText(id, '')) throw new Error('An info card requires an id');
  if (!safeText(path, '')) throw new Error('An info card requires a data path');

  const card = {
    id: id.trim(),
    name: safeText(name, id),
    type: 'info',
    icon: safeText(icon, ICONS.info),
    args: [path.trim()],
  };

  const getExpression = expression(get);
  if (getExpression) card.get = getExpression;

  const suffix = safeUnit(unit);
  if (suffix) card.getTo = `\`\${v} ${suffix}\``;

  return card;
};

/**
 * @param {{ id?: string, name?: string, icon?: string }} [options]
 */
export const createChartCard = ({ id = 'buffer.head', name = 'Chart', icon } = {}) => ({
  id,
  name,
  type: 'chart',
  icon: safeText(icon, ICONS.chart),
  args: ['buffer.head', 'buffer'],
  get: 'a',
});

/**
 * @param {{ id?: string, name?: string, icon?: string, items?: Array<{ name: string, value: string }> }} [options]
 */
export const createListCard = ({ id = 'device.list', name = 'List', icon, items } = {}) => ({
  id,
  name,
  type: 'list',
  icon: safeText(icon, ICONS.list),
  opts: {
    items: items ?? [
      { name: 'Item1', value: '1' },
      { name: 'Item2', value: '2' },
      { name: 'Item3', value: '3' },
    ],
  },
  args: ['device.list', 'device'],
  set: '({ ...a, list: v, command: 1})',
});

/**
 * @param {{ id?: string, name?: string, icon?: string }} [options]
 */
export const createInputCard = ({ id = 'device.message', name = 'Message', icon } = {}) => ({
  id,
  name,
  type: 'input',
  icon: safeText(icon, ICONS.input),
  args: ['device.message', 'device'],
  set: '({ ...a, message: `${v}`, command: 1})',
});

/**
 * @param {{ id?: string, name?: string, icon?: string }} [options]
 */
export const createDateCard = ({ id = 'device.now', name = 'now', icon } = {}) => ({
  id,
  name,
  type: 'date',
  icon: safeText(icon, ICONS.date),
  args: ['device.now', 'device'],
  set: '({ ...a, now: v, command: 1})',
  getTo: 'new Date(v * 1000).toLocaleDateString()',
});

/**
 * @param {string} type
 * @param {object} options
 * @returns {object}
 */
export const createCard = (type, options = {}) => {
  switch (type) {
    case 'button':
    case 'dimmer':
      return createPortCard({ ...options, type });
    case 'info':
      return createInfoCard(options);
    case 'chart':
      return createChartCard(options);
    case 'list':
      return createListCard(options);
    case 'input':
      return createInputCard(options);
    case 'date':
      return createDateCard(options);
    default:
      throw new Error(`Unknown card type "${type}". Available types: ${CARD_TYPES.join(', ')}`);
  }
};

/**
 * Removes dashboard cards by id.
 *
 * @param {string} dir project root
 * @param {string[]} ids
 * @returns {Promise<number>} number of removed cards
 */
export const removeCards = async (dir, ids) => {
  const cards = await readDashboard(dir);
  const remove = new Set(ids);
  const next = cards.filter((card) => !remove.has(card.id));
  const removed = cards.length - next.length;

  if (removed) await writeDashboard(dir, next);
  return removed;
};

/**
 * Adds one card to the dashboard, rejecting duplicate ids.
 *
 * @param {string} dir project root
 * @param {object} card
 * @returns {Promise<object>}
 */
export const addCard = async (dir, card) => {
  const cards = await readDashboard(dir);
  if (cards.some((item) => item.id === card.id)) {
    throw new Error(`A dashboard card with id "${card.id}" already exists`);
  }

  cards.push(card);
  await writeDashboard(dir, cards);
  return card;
};

/**
 * Adds several cards, skipping ids that already exist.
 *
 * @param {string} dir project root
 * @param {object[]} cards
 * @returns {Promise<{ added: object[], skipped: object[] }>}
 */
export const addCards = async (dir, cards) => {
  const dashboard = await readDashboard(dir);
  const existing = new Set(dashboard.map((item) => item.id));
  const added = cards.filter((card) => !existing.has(card.id));
  const skipped = cards.filter((card) => existing.has(card.id));

  if (added.length) await writeDashboard(dir, [...dashboard, ...added]);

  return { added, skipped };
};
