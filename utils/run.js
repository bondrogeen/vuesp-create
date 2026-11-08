import { spawnSync } from 'node:child_process';

/**
 * Runs a command with inherited output and throws on a non-zero exit code.
 *
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd?: string }} [options]
 * @returns {import('node:child_process').SpawnSyncReturns<Buffer>}
 */
export const run = (command, args = [], options = {}) => {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`"${[command, ...args].join(' ')}" exited with code ${result.status}`);
  }

  return result;
};

/**
 * Runs a command and returns trimmed stdout.
 *
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd?: string }} [options]
 * @returns {string}
 */
export const runCapture = (command, args = [], options = {}) => {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    ...options,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = (result.stderr ?? '').trim();
    throw new Error(`"${[command, ...args].join(' ')}" exited with code ${result.status}${detail ? `: ${detail}` : ''}`);
  }

  return (result.stdout ?? '').trim();
};

/**
 * Checks whether a command is available in PATH.
 *
 * @param {string} command
 * @returns {boolean}
 */
export const hasCommand = (command) => {
  const result = spawnSync(command, ['--version'], {
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });

  return !result.error && result.status === 0;
};

/**
 * Package manager used to scaffold and install the project.
 *
 * @returns {'npm' | 'pnpm' | 'yarn' | 'bun'}
 */
export const detectPackageManager = () => {
  const agent = process.env.npm_config_user_agent ?? '';

  if (agent.startsWith('pnpm/')) return 'pnpm';
  if (agent.startsWith('yarn/')) return 'yarn';
  if (agent.startsWith('bun/')) return 'bun';
  return 'npm';
};

/**
 * Returns the install command for a package manager.
 *
 * @param {string} pm
 * @returns {[string, string[]]}
 */
export const installCommand = (pm) => {
  switch (pm) {
    case 'pnpm':
      return ['pnpm', ['install']];
    case 'yarn':
      return ['yarn', ['install']];
    case 'bun':
      return ['bun', ['install']];
    default:
      return ['npm', ['install']];
  }
};
