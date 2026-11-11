#!/usr/bin/env node

import { access, cp, readFile, writeFile } from 'node:fs/promises';
import { constants, existsSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

import { confirm, input, select } from '@inquirer/prompts';
import { Command } from 'commander';
import { downloadTemplate } from 'giget';
import pc from 'picocolors';

import {
  CARD_TYPES,
  addCard,
  checkProjectUpdates,
  cloneFork,
  createCard,
  createInfoCard,
  createPortCard,
  detectPackageManager,
  findProjectRoot,
  getPreset,
  hasCommand,
  installCommand,
  latestTemplateCommit,
  listBoards,
  localGitCommit,
  presetNames,
  readManifest,
  run,
  runCapture,
  scaffold,
  syncProject,
  validatePackageName,
  validateProjectName,
} from '../utils/index.js';

const PACKAGE = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const DEFAULT_TEMPLATE = 'github:bondrogeen/vuesp';
const FALLBACK_BOARDS = ['esp32', 'esp32-c3-devkitm-1', 'esp8266', 'pico32'];
const DEFAULT_BOARD = 'esp32';
const PACKAGE_MANAGERS = ['npm', 'pnpm', 'yarn', 'bun'];

const BOARD_LABELS = {
  esp32: 'ESP32 · esp32dev',
  'esp32-c3-devkitm-1': 'ESP32-C3 · esp32-c3-devkitm-1',
  esp8266: 'ESP8266 · esp12e',
  pico32: 'Raspberry Pi Pico W · pico32',
};

const CARD_LABELS = {
  button: 'Button · GPIO output',
  dimmer: 'Dimmer · PWM output',
  info: 'Info · value or sensor',
  chart: 'Chart · buffer data',
  list: 'List · select value',
  input: 'Input · text value',
  date: 'Date · device time',
};

const SENSOR_LABELS = {
  temperature: 'Temperature · Dallas or custom value',
  analog: 'Analog · ADC / port value',
  digital: 'Digital · GPIO input',
};

const logo = `
${pc.cyan(pc.bold('vuesp-create'))} ${pc.dim('— new Vuesp project from the official template')}
`;

const step = (message) => console.log(`${pc.cyan('›')} ${message}`);
const ok = (message) => console.log(`${pc.green('✔')} ${message}`);
const warn = (message) => console.log(`${pc.yellow('!')} ${message}`);
const fail = (message) => console.error(`${pc.red('✖')} ${message}`);
const interactive = (options) => Boolean(process.stdin.isTTY) && !options.yes;

const exists = async (path) => {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const isLocalSource = (source) => source.startsWith('.') || source.startsWith('/') || source.startsWith('file:') || source.startsWith('~');

const normalizeLocalSource = (source) => (source.startsWith('file:') ? source.slice(5) : source).replace(/^~(?=$|\/|\\)/, process.env.HOME ?? '~');

const githubSource = (source) => {
  const [repoWithRef, hash] = source.split('#');
  const repo = repoWithRef
    .replace(/^github:/, '')
    .replace(/^gh:/, '')
    .replace(/^https?:\/\/github\.com\//, '')
    .replace(/\.git$/, '');

  const [owner, name] = repo.split('/');
  if (!owner || !name) return null;
  return { owner, name, ref: hash || 'HEAD' };
};

const templateSource = (source, ref) => {
  if (!ref) return source;
  const [base] = source.split('#');
  return `${base}#${ref}`;
};

const toGigetSource = (source) => {
  if (isLocalSource(source)) return source;
  if (/^https?:\/\/github\.com\//.test(source)) {
    const github = githubSource(source);
    if (github) {
      const ref = github.ref === 'HEAD' ? '' : `#${github.ref}`;
      return `github:${github.owner}/${github.name}${ref}`;
    }
  }
  return source;
};

const normalizeGitSource = (source, ref) => {
  const base = toGigetSource(source);

  if (ref) return templateSource(base, ref);
  if (isLocalSource(source) || base.includes('#')) return base;

  const github = githubSource(source);
  if (!github) return base;

  // giget assumes "main" for GitHub, while Vuesp uses "master". HEAD resolves
  // to the repository's actual default branch.
  return `${base}#${github.ref}`;
};

const fetchTemplatePlatformio = async (source, ref) => {
  if (isLocalSource(source)) {
    return readFile(resolve(normalizeLocalSource(source), 'platformio.ini'), 'utf8');
  }

  const github = githubSource(source);
  if (!github) return null;

  const branch = ref || github.ref;
  const url = `https://raw.githubusercontent.com/${github.owner}/${github.name}/${branch}/platformio.ini`;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) return null;
    return response.text();
  } catch {
    return null;
  }
};

const copyLocalTemplate = async (source, target) => {
  const root = resolve(normalizeLocalSource(source));

  if (!(await exists(join(root, 'platformio.ini')))) {
    throw new Error(`"${source}" does not look like a Vuesp template (platformio.ini is missing)`);
  }

  const absoluteTarget = resolve(target);
  if (absoluteTarget === root || absoluteTarget.startsWith(`${root}${sep}`)) {
    throw new Error('The target directory must be outside the template directory');
  }

  const excluded = new Set(['node_modules', '.git', '.pio']);
  const excludedRoots = new Set(['build', 'firmware', 'docs']);
  const excludedEnv = new Set(['.env', '.env.local', '.env.screen.local']);

  await cp(root, absoluteTarget, {
    recursive: true,
    filter: (src) => {
      const path = relative(root, src);
      if (!path) return true;

      const parts = path.split(sep);
      if (parts.some((part) => excluded.has(part))) return false;
      if (excludedRoots.has(parts[0])) return false;
      if (path === join('data', 'www') || path.startsWith(`${join('data', 'www')}${sep}`)) return false;
      if (excludedEnv.has(parts[parts.length - 1])) return false;

      return true;
    },
  });

  return absoluteTarget;
};

const download = async ({ source, ref, dir }) => {
  if (isLocalSource(source)) {
    await copyLocalTemplate(source, dir);
    return { source: normalizeLocalSource(source), dir };
  }

  return downloadTemplate(normalizeGitSource(source, ref), { dir, force: true });
};

const templateMetadata = async ({ source, ref }) => {
  const github = githubSource(source);
  const local = isLocalSource(source);
  const templateRef = ref || github?.ref;
  let commit = null;

  try {
    commit = local
      ? localGitCommit(resolve(normalizeLocalSource(source)))
      : await latestTemplateCommit({ source, ref });
  } catch {
    commit = null;
  }

  return {
    source: local ? resolve(normalizeLocalSource(source)) : source,
    ...(templateRef ? { ref: templateRef } : {}),
    ...(commit ? { commit } : {}),
  };
};

const boardChoices = (boards) => boards.map((board) => ({ name: BOARD_LABELS[board] ?? board, value: board }));

const askBoard = async (boards, options, preferred = DEFAULT_BOARD) => {
  if (options.board) {
    if (!boards.includes(options.board)) {
      throw new Error(`Unknown board "${options.board}". Available: ${boards.join(', ')}`);
    }
    return options.board;
  }

  const fallback = boards.includes(preferred) ? preferred : boards[0];
  if (!interactive(options)) return fallback;

  return select({ message: 'Select a board', choices: boardChoices(boards), default: fallback });
};

const askPreset = async (options) => {
  if (options.preset) {
    getPreset(options.preset);
    return options.preset;
  }

  if (!interactive(options)) return '';

  return select({
    message: 'Start from a preset?',
    choices: [
      { name: 'No preset · empty Vuesp project', value: '' },
      ...presetNames.map((name) => ({ name: `${name} · ${getPreset(name).label}`, value: name })),
    ],
    default: '',
  });
};

const askInstall = async (options) => {
  if (options.install !== undefined) return options.install;
  if (!interactive(options)) return true;
  return confirm({ message: 'Install dependencies now?', default: true });
};

const askGit = async (options) => {
  if (options.git !== undefined) return options.git;
  if (!interactive(options)) return true;
  return confirm({ message: 'Initialize a git repository?', default: true });
};

const askFork = async (options) => {
  if (options.fork !== undefined) return options.fork;
  if (!interactive(options)) return true;
  return confirm({ message: 'Create as a fork with upstream git history?', default: true });
};

const askGithub = async (options) => {
  if (options.github) return true;
  if (options.private) return true;
  if (!interactive(options)) return false;
  return confirm({ message: 'Create a GitHub repository with gh?', default: false });
};

const parseProjectName = async (name, options) => {
  if (name) {
    const valid = validateProjectName(name);
    if (valid !== true) throw new Error(valid);
    return name.trim();
  }

  if (!interactive(options)) {
    throw new Error('A project name is required in non-interactive mode: vuesp-create <project-name> --yes');
  }

  const answer = await input({
    message: 'Project name',
    default: 'vuesp.my-project',
    validate: (value) => validateProjectName(value),
  });

  return answer.trim();
};

const initRepository = (dir) => {
  try {
    run('git', ['init', '-b', 'main'], { cwd: dir });
  } catch {
    run('git', ['init'], { cwd: dir });
  }
};

const createGithubRepository = async ({ dir, name, isPrivate }) => {
  if (!hasCommand('gh')) {
    throw new Error('The GitHub CLI is not installed. Install it from https://cli.github.com/ and run "gh auth login"');
  }

  step('Creating GitHub repository…');
  if (!existsSync(join(dir, '.git'))) initRepository(dir);
  run('git', ['add', '-A'], { cwd: dir });

  try {
    run('git', ['commit', '-m', 'Initial commit'], { cwd: dir });
  } catch {
    warn('Could not create the initial commit. Check git user.name and user.email.');
    throw new Error('The GitHub repository was not created');
  }

  if (isPrivate) warn('Private repositories are not visible in the public Vuesp catalog');

  run('gh', ['repo', 'create', name, isPrivate ? '--private' : '--public', '--source', '.', '--remote', 'origin', '--push'], { cwd: dir });

  const url = runCapture('gh', ['repo', 'view', '--json', 'url', '--jq', '.url'], { cwd: dir });

  const packagePath = join(dir, 'vue/package.json');
  const packageJson = JSON.parse(await readFile(packagePath, 'utf8'));
  packageJson.homepage = 'https://vuesp.ru';
  packageJson.repository = { type: 'git', url };
  await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

  ok(`GitHub repository: ${url}`);
  return url;
};

const promptText = async (message, defaultValue, options) => {
  if (!interactive(options)) return defaultValue;
  return input({ message, default: defaultValue });
};

const promptNumber = async (message, defaultValue, options) => {
  const value = await promptText(message, `${defaultValue}`, options);
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 48) throw new Error('GPIO must be an integer between 0 and 48');
  return number;
};

const promptChoice = async (message, choices, defaultValue, options) => {
  if (!interactive(options)) return defaultValue;
  return select({ message, choices, default: defaultValue });
};

const buildDashboardCard = async (options) => {
  const type = options.type ?? (await promptChoice('Card type', CARD_TYPES.map((value) => ({ name: CARD_LABELS[value], value })), 'info', options));

  if (!CARD_TYPES.includes(type)) throw new Error(`Unknown card type "${type}". Available: ${CARD_TYPES.join(', ')}`);

  if (['button', 'dimmer'].includes(type)) {
    const gpio = options.gpio !== undefined ? Number(options.gpio) : await promptNumber('GPIO', 12, options);
    const id = options.id ?? (await promptText('Card id', `ports.${gpio}`, options));
    const name = options.name ?? (await promptText('Card name', id, options));
    const icon = options.icon ?? (await promptText('Icon', type === 'button' ? 'bulb' : 'windy', options));
    return createPortCard({ type, gpio, id, name, icon, disabled: Boolean(options.disabled) });
  }

  if (type === 'info') {
    const path = options.path ?? (await promptText('Data path', 'device.voltage', options));
    const id = options.id ?? (await promptText('Card id', path, options));
    const name = options.name ?? (await promptText('Card name', id, options));
    const icon = options.icon ?? (await promptText('Icon', 'info', options));
    const unit = options.unit ?? (await promptText('Unit (optional)', '', options));
    return createInfoCard({ id, name, path, icon, unit, get: options.get });
  }

  const defaults = {
    chart: { id: 'buffer.head', name: 'Chart', icon: 'chart' },
    list: { id: 'device.list', name: 'List', icon: 'store' },
    input: { id: 'device.message', name: 'Message', icon: 'noti' },
    date: { id: 'device.now', name: 'now', icon: 'timer' },
  }[type];

  const id = options.id ?? (await promptText('Card id', defaults.id, options));
  const name = options.name ?? (await promptText('Card name', defaults.name, options));
  const icon = options.icon ?? (await promptText('Icon', defaults.icon, options));

  return createCard(type, { id, name, icon });
};

const buildSensorCard = async (options) => {
  const kind = options.kind ?? (await promptChoice('Sensor type', Object.entries(SENSOR_LABELS).map(([value, name]) => ({ name, value })), 'temperature', options));

  if (!['temperature', 'analog', 'digital'].includes(kind)) {
    throw new Error(`Unknown sensor type "${kind}". Available: temperature, analog, digital`);
  }

  if (kind === 'digital') {
    const gpio = options.gpio !== undefined ? Number(options.gpio) : await promptNumber('GPIO', 2, options);
    const name = options.name ?? (await promptText('Sensor name', `Input ${gpio}`, options));
    return createPortCard({ type: 'button', gpio, id: options.id ?? `ports.${gpio}`, name, icon: options.icon ?? 'light', disabled: true });
  }

  const isAnalog = kind === 'analog';
  const gpio = isAnalog ? (options.gpio !== undefined ? Number(options.gpio) : await promptNumber('GPIO', 34, options)) : null;
  const defaultPath = isAnalog ? `ports.${gpio}.value` : 'device.temperature';
  const path = options.path ?? (await promptText('Data path', defaultPath, options));
  const id = options.id ?? (await promptText('Card id', path, options));
  const name = options.name ?? (await promptText('Sensor name', isAnalog ? `Analog ${gpio}` : 'Temperature', options));
  const icon = options.icon ?? (await promptText('Icon', isAnalog ? 'light' : 'therm', options));
  const unit = options.unit ?? (await promptText('Unit', isAnalog ? '%' : '°C', options));

  return createInfoCard({ id, name, path, icon, unit, get: options.get });
};

const printUpdateReport = (report) => {
  if (report.cli.latest) {
    console.log(
      `${report.cli.updateAvailable ? pc.yellow('↑') : pc.green('✔')} vuesp-create: ${report.cli.current}${report.cli.updateAvailable ? ` → ${report.cli.latest}` : pc.dim(' (up to date)')}`
    );
  } else {
    console.log(`${pc.dim('·')} vuesp-create: ${report.cli.current} ${pc.dim('(registry unavailable)')}`);
  }

  if (!report.template.source) {
    console.log(`${pc.dim('·')} template: no .vuesp.json — check skipped`);
  } else if (!report.template.current) {
    console.log(`${pc.dim('·')} template: ${report.template.source} ${pc.dim('(commit is unknown)')}`);
  } else if (!report.template.latest) {
    console.log(`${pc.dim('·')} template: ${report.template.source} ${pc.dim('(remote unavailable)')}`);
  } else {
    console.log(
      `${report.template.updateAvailable ? pc.yellow('↑') : pc.green('✔')} template: ${report.template.source} ${report.template.updateAvailable ? `${report.template.current.slice(0, 7)} → ${report.template.latest.slice(0, 7)}` : pc.dim('(up to date)')}`
    );
  }

  if (report.dependencies === null) {
    console.log(`${pc.dim('·')} dependencies: vue/node_modules is missing — check skipped`);
  } else if (!report.dependencyUpdates.length) {
    console.log(`${pc.green('✔')} dependencies: up to date`);
  } else {
    console.log(`${pc.yellow('↑')} dependencies: ${report.dependencyUpdates.length} update(s)`);
    for (const item of report.dependencyUpdates.slice(0, 15)) {
      console.log(`  ${item.name}: ${item.current} → ${item.latest}`);
    }
  }
};

const main = async () => {
  const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);
  const supported = (nodeMajor === 22 && nodeMinor >= 13) || (nodeMajor === 23 && nodeMinor >= 5) || nodeMajor >= 24;

  if (!supported) {
    fail(`Node.js 22.13 or newer is required (current: ${process.versions.node})`);
    process.exit(1);
  }

  const program = new Command();

  program
    .name('vuesp-create')
    .description('Create and extend a Vuesp project')
    .version(PACKAGE.version)
    .argument('[project-name]', 'project folder and npm package name')
    .option('-b, --board <board>', 'board environment from platformio.ini')
    .option('--preset <name>', `starter preset: ${presetNames.join(', ')}`)
    .option('-t, --template <source>', 'template source (github:owner/repo or a local path)', DEFAULT_TEMPLATE)
    .option('--ref <ref>', 'template branch, tag or commit')
    .option('-p, --pm <name>', `package manager: ${PACKAGE_MANAGERS.join(', ')}`)
    .option('--install', 'install dependencies')
    .option('--no-install', 'skip dependency installation')
    .option('--git', 'initialize a git repository')
    .option('--no-git', 'skip git initialization')
    .option('--fork', 'clone the template as a history-preserving fork with an upstream remote (default)')
    .option('--no-fork', 'create an independent copy without upstream git history')
    .option('-g, --github', 'create a GitHub repository with gh')
    .option('--private', 'create a private GitHub repository (not listed in the catalog)')
    .option('--name <name>', 'npm package name in vue/package.json')
    .option('--list-boards', 'show available boards and exit')
    .option('-y, --yes', 'use defaults and skip prompts')
    .action(async (projectName, options) => {
      const source = options.template;

      if (options.pm && !PACKAGE_MANAGERS.includes(options.pm)) {
        throw new Error(`Unknown package manager "${options.pm}". Use one of: ${PACKAGE_MANAGERS.join(', ')}`);
      }
      if (options.preset) getPreset(options.preset);
      if ((options.github || options.private) && !hasCommand('gh')) {
        throw new Error('The GitHub CLI is not installed. Install it from https://cli.github.com/ and run "gh auth login"');
      }

      const platformio = await fetchTemplatePlatformio(source, options.ref);
      const boards = platformio ? listBoards(platformio) : FALLBACK_BOARDS;
      if (!boards.length) throw new Error('No board environments found in the template');

      if (options.listBoards) {
        console.log(`\nAvailable boards (${source}):`);
        for (const board of boards) console.log(`  ${BOARD_LABELS[board] ?? board}`);
        console.log('');
        return;
      }

      const name = await parseProjectName(projectName, options);
      const presetName = await askPreset(options);
      const preset = presetName ? getPreset(presetName) : null;
      const preferredBoard = preset?.board ?? DEFAULT_BOARD;
      const board = await askBoard(boards, options, preferredBoard);
      const packageName = (options.name ?? name).trim();

      const validPackage = validatePackageName(packageName);
      if (validPackage !== true) throw new Error(validPackage);

      const target = resolve(process.cwd(), name);
      if (await exists(target)) throw new Error(`The folder "${name}" already exists`);

      const pm = options.pm ?? detectPackageManager();
      const installDeps = await askInstall(options);
      const createGithub = await askGithub(options);
      const fork = await askFork(options);
      const initGit = createGithub || fork ? true : await askGit(options);

      if (fork && !hasCommand('git')) {
        throw new Error('Fork mode is the default and requires git. Install git or pass --no-fork.');
      }
      if (fork && options.git === false) {
        throw new Error('Fork mode requires git history. Pass --no-fork to create an independent copy.');
      }

      console.log(logo);
      step(`Template: ${pc.bold(source)}${options.ref ? pc.dim(`#${options.ref}`) : ''}`);
      step(`Project:  ${pc.bold(name)}`);
      step(`Board:    ${pc.bold(BOARD_LABELS[board] ?? board)}`);
      if (preset) step(`Preset:   ${pc.bold(preset.label)}`);
      step(`Manager:  ${pc.bold(pm)}`);
      console.log('');

      step(fork ? 'Cloning template with upstream history…' : 'Downloading template…');
      const downloaded = fork
        ? await cloneFork({ source, ref: options.ref, dir: target })
        : await download({ source, ref: options.ref, dir: target });
      ok(fork ? `Template cloned to ${pc.bold(name)}` : `Template downloaded to ${pc.bold(name)}`);

      step('Configuring project…');
      const template = await templateMetadata({ source, ref: options.ref });
      const result = await scaffold(downloaded.dir, {
        name,
        packageName,
        board,
        preset,
        presetName,
        template,
        createdWith: `vuesp-create@${PACKAGE.version}`,
      });
      ok('platformio.ini, package.json, README and .vuesp.json updated');

      if (initGit) {
        if (fork) {
          ok('Git history preserved; upstream remote is configured');
        } else {
          step('Initializing git repository…');
          if (hasCommand('git')) {
            initRepository(target);
            ok('Git repository initialized');
          } else {
            warn('"git" is not available, skipping git initialization');
          }
        }
      }

      if (installDeps) {
        const [command, args] = installCommand(pm);

        if (!hasCommand(command)) {
          warn(`"${command}" is not available, skipping dependency installation`);
        } else {
          step(`Installing dependencies with ${pm}…`);
          run(command, args, { cwd: join(target, 'vue') });
          ok('Dependencies installed');
        }
      }

      let githubUrl = '';
      if (createGithub) {
        githubUrl = await createGithubRepository({ dir: target, name, isPrivate: Boolean(options.private) });
      }

      console.log(`\n${pc.green(pc.bold('Done!'))} Your Vuesp project is ready.\n`);
      console.log('Next steps:');
      console.log(`  ${pc.cyan('cd')} ${name}`);
      console.log(`  ${pc.cyan('cd')} vue`);
      if (!installDeps) console.log(`  ${pc.cyan(pm)} install`);
      console.log(`  ${pc.cyan(pm)} run dev`);
      console.log('');
      console.log(pc.dim('Open http://localhost:3000 and edit src/ for the firmware.'));
      console.log(pc.dim(`Manifest: .vuesp.json · boards: ${result.boards.length} · preset: ${presetName || 'none'}`));
      if (fork) {
        console.log(pc.dim('Fork mode: update with "git fetch upstream && git merge upstream/master".'));
      }
      if (githubUrl) {
        console.log(pc.dim(`GitHub: ${githubUrl}`));
      } else {
        console.log(pc.dim('To publish the project, push it to GitHub and add it at https://lk.vuesp.ru/projects/new'));
      }
      console.log('');
    });

  const add = program.command('add').description('Add a module to an existing Vuesp project');

  add
    .command('dashboard-card')
    .description('Add a dashboard card')
    .argument('[dir]', 'project directory', '.')
    .option('--type <type>', `card type: ${CARD_TYPES.join(', ')}`)
    .option('--id <id>', 'card id')
    .option('--name <name>', 'card name')
    .option('--icon <icon>', 'Remix icon name')
    .option('--gpio <number>', 'GPIO number for button/dimmer cards')
    .option('--path <path>', 'data path for info cards')
    .option('--unit <unit>', 'unit for info cards')
    .option('--get <expression>', 'get expression, for example "v/100"')
    .option('--disabled', 'add a read-only/disabled card')
    .option('-y, --yes', 'use defaults and skip prompts')
    .action(async (dir, options) => {
      console.log(logo);
      const root = findProjectRoot(resolve(dir));
      const card = await buildDashboardCard(options);
      await addCard(root, card);
      ok(`Dashboard card "${card.id}" added to ${pc.bold(relative(process.cwd(), root) || '.')}`);
      console.log(pc.dim('Restart the dev server or reload the page to see the card.'));
      console.log('');
    });

  add
    .command('sensor')
    .description('Add a sensor card to the dashboard')
    .argument('[dir]', 'project directory', '.')
    .option('--kind <kind>', 'sensor type: temperature, analog, digital')
    .option('--id <id>', 'card id')
    .option('--name <name>', 'sensor name')
    .option('--icon <icon>', 'Remix icon name')
    .option('--gpio <number>', 'GPIO number for analog/digital sensors')
    .option('--path <path>', 'data path for temperature/analog sensors')
    .option('--unit <unit>', 'unit for temperature/analog sensors')
    .option('--get <expression>', 'get expression, for example "v/100"')
    .option('-y, --yes', 'use defaults and skip prompts')
    .action(async (dir, options) => {
      console.log(logo);
      const root = findProjectRoot(resolve(dir));
      const card = await buildSensorCard(options);
      await addCard(root, card);
      ok(`Sensor card "${card.id}" added to ${pc.bold(relative(process.cwd(), root) || '.')}`);
      console.log(pc.dim('Restart the dev server or reload the page to see the card.'));
      console.log('');
    });

  program
    .command('sync')
    .description('Compare the project with its upstream template')
    .argument('[dir]', 'project directory', '.')
    .option('--ref <ref>', 'upstream branch, tag or commit')
    .option('--from <commit>', 'base commit to compare from')
    .option('--upstream <source>', 'override the upstream repository')
    .option('--apply', 'apply non-conflicting changes')
    .option('--force', 'apply upstream files even when local changes conflict')
    .option('--json', 'print machine-readable JSON')
    .action(async (dir, options) => {
      const root = findProjectRoot(resolve(dir));
      const manifest = await readManifest(root);
      const result = await syncProject({
        root,
        manifest,
        upstream: options.upstream,
        ref: options.ref,
        from: options.from,
        apply: Boolean(options.apply),
        force: Boolean(options.force),
      });

      if (options.json) {
        console.log(JSON.stringify({ dir: root, ...result }, null, 2));
        return;
      }

      console.log(logo);
      console.log(`${pc.dim('upstream:')} ${result.upstream}`);
      console.log(`${pc.dim('base:')} ${result.base.slice(0, 7)}  ${pc.dim('target:')} ${result.target.slice(0, 7)} ${pc.dim(`(${result.ref})`)}`);
      console.log(
        `${pc.green(`+${result.summary.add}`)} add  ` +
          `${pc.cyan(`~${result.summary.update}`)} update  ` +
          `${pc.yellow(`-${result.summary.delete}`)} delete  ` +
          `${pc.red(`!${result.summary.conflict}`)} conflict`
      );

      for (const file of result.files) {
        const color =
          file.action === 'add' ? pc.green : file.action === 'update' ? pc.cyan : file.action === 'delete' ? pc.yellow : pc.red;
        const mark = file.action === 'add' ? '+' : file.action === 'update' ? '~' : file.action === 'delete' ? '-' : '!';
        console.log(`  ${color(mark)} ${file.path} ${pc.dim(file.action)}`);
      }

      if (!result.files.length) console.log(pc.green('✔ already up to date'));
      if (result.summary.conflict) console.log(pc.yellow('Conflicts were left untouched. Resolve them manually.'));
      if (!options.apply && result.files.some((file) => file.action !== 'conflict')) {
        console.log(pc.dim('Run with --apply to update non-conflicting files.'));
      }
      console.log('');
    });

  program
    .command('check')
    .description('Check for vuesp-create, template and dependency updates')
    .argument('[dir]', 'project directory', '.')
    .option('--json', 'print machine-readable JSON')
    .option('--strict', 'exit with code 1 when updates are available')
    .action(async (dir, options) => {
      const root = findProjectRoot(resolve(dir));
      const manifest = await readManifest(root);
      const report = await checkProjectUpdates({ dir: root, manifest, cliVersion: PACKAGE.version });

      if (options.json) {
        console.log(JSON.stringify({ dir: root, ...report }, null, 2));
      } else {
        console.log(logo);
        printUpdateReport(report);
        console.log('');
      }

      const hasUpdates = report.cli.updateAvailable || report.template.updateAvailable || report.dependencyUpdates.length > 0;
      if (options.strict && hasUpdates) process.exitCode = 1;
    });

  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    if (error?.name === 'ExitPromptError') {
      console.log(`\n${pc.dim('Cancelled.')}`);
      process.exit(130);
    }

    fail(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
};

await main();
