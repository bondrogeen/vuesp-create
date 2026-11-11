# vuesp-create

Create a new [Vuesp](https://github.com/bondrogeen/vuesp) project from the official template in one command.

`vuesp-create` clones the current Vuesp template as a git fork by default, keeps only the selected board, sets the project name, optionally installs dependencies, initializes a git repository and can create the GitHub repository for you.

It also writes a `.vuesp.json` manifest so the Vuesp catalog can prefill the project card.

## Requirements

- Node.js >= 22.13
- npm, pnpm, yarn or bun
- [PlatformIO](https://platformio.org/) for building the firmware

## Quick start

```bash
npx vuesp-create@latest my-project
```

Or install the CLI globally:

```bash
npm install -g vuesp-create
vuesp-create my-project
```

You will be asked for a board, dependencies and git initialization. To use the defaults without prompts:

```bash
npx vuesp-create@latest my-project --yes
```

With a starter preset and an automatic GitHub repository:

```bash
npx vuesp-create@latest vuesp.bms-12v --preset bms --github --yes
```

## Fork mode

By default a project is cloned with the template's full git history and the parent repository is configured as `upstream`:

```bash
npx vuesp-create@latest vuesp.my-device --yes
```

After creation the project can receive template updates with normal git commands:

```bash
git fetch upstream
git merge upstream/master
```

or rebase the device branch on top of upstream:

```bash
git fetch upstream
git rebase upstream/master
```

Fork mode requires `git` and a git-based template source. With `--github` the CLI creates a repository with the shared history, but not a GitHub fork-network entry. If you need the GitHub fork itself, create it with `gh repo fork` and add the resulting repository as `origin`.

Use `--no-fork` to create an independent copy without upstream history.

Fork mode requires `git`. If it is not installed, pass `--no-fork` or install git first.

### Project links

The web UI shows two buttons in the sidebar:

- **Homepage** always opens `https://vuesp.ru`.
- **Github** opens the project repository from `repository.url` in `vue/package.json`.

`vuesp-create` does not copy the template repository URL into a new project. The GitHub button is filled from `repository.url` when the project has one, otherwise from the `origin` remote of the current git repository at build time. This means the link appears automatically after the project is pushed to its own GitHub repository.

## Checking template changes

Generated projects include a root `package.json` with two shortcuts:

```bash
npm run sync:check   # compare only
npm run sync         # compare and apply safe changes
```

The same check is available anywhere through the CLI:

```bash
npx vuesp-create@latest sync
```

The command compares three states:

- the recorded template commit from `.vuesp.json`;
- the local project files;
- the current upstream template.

It reports safe updates, new files, deletions and conflicts. To apply only the safe changes:

```bash
npx vuesp-create@latest sync --apply
```

Conflicting files are left untouched. Use `--force` to overwrite them with the upstream version.

By default only the shared UI and scripts are compared:

```text
vue/src
vue/scripts
vue/package.json
vue/vite.config.ts
```

Override the list in `.vuesp-sync.json`:

```json
{
  "upstream": "github:bondrogeen/vuesp",
  "paths": ["vue/src", "vue/scripts", "vue/package.json", "vue/vite.config.ts"]
}
```

## What you get

```text
my-project/
├── src/              # firmware sources for the selected board
├── vue/              # Vue 3 + Vite web interface
├── .vuesp.json       # project manifest for the Vuesp catalog
├── platformio.ini    # only the selected board is kept
├── data/www/         # built web interface (generated)
├── github/images/    # screenshots used by the README
└── ...
```

The command also:

- sets `name` in `vue/package.json`;
- resets the project version to `0.1.0`;
- sets `firmware_version` and `device_name` in `platformio.ini`;
- replaces the README with a clean project template that keeps a link to Vuesp;
- updates the browser tab title and description;
- removes Vuesp-specific `docs/`, `DEVELOPMENT.md`, `CONTRIBUTING.md` and `SECURITY.md`;
- removes the template repository link from `vue/package.json` and sets `homepage` to `https://vuesp.ru`;
- writes `.vuesp.json` with the name, summary, description, platforms and tags;
- adds starter dashboard cards when a preset is selected.

## Presets

| Preset | Default board | What it adds |
| --- | --- | --- |
| `bms` | ESP32-C3 | Battery tags and dashboard cards for voltage, current, SOC and temperature |
| `camera` | ESP32 | Camera/video tags and a starting description |
| `led` | ESP32 | LED/PWM tags and GPIO 12/13 buttons with a GPIO 14 dimmer |

```bash
npx vuesp-create@latest my-project --preset bms
```

Presets only change metadata and starter dashboard cards. The firmware remains the normal Vuesp template; edit `src/` and `vue/json/dashboard.json` for your device.

## Boards

| Board | PlatformIO environment |
| --- | --- |
| ESP32 | `esp32` |
| ESP32-C3 | `esp32-c3-devkitm-1` |
| ESP8266 | `esp8266` |
| Raspberry Pi Pico W | `pico32` |

The list is read from the template's `platformio.ini`, so new boards become available automatically:

```bash
npx vuesp-create@latest --list-boards
```

## Project manifest

Every generated project contains `.vuesp.json`:

```json
{
  "$schema": "https://vuesp.ru/schema/vuesp-project.json",
  "name": "vuesp.bms-12v",
  "summary": "Battery monitoring and management with a local web interface",
  "description": "## Battery management\n...",
  "platforms": ["ESP32-C3"],
  "tags": ["bms", "battery", "esp32-c3"],
  "preset": "bms",
  "createdWith": "vuesp-create@1.0.0",
  "createdAt": "2026-11-08T08:00:00.000Z",
  "template": {
    "source": "github:bondrogeen/vuesp",
    "ref": "HEAD",
    "commit": "…"
  }
}
```

The manifest is optional but recommended. When you add a project in
<https://lk.vuesp.ru/projects/new>, the LK reads `.vuesp.json` from the public
repository and fills the name, summary, description, platforms and tags.

The JSON Schema is published at
<https://vuesp.ru/schema/vuesp-project.json>.

## Extend an existing project

Two commands add typical dashboard modules to `vue/json/dashboard.json` and
`vue/public/default.json`:

```bash
# Interactive
vuesp-create add dashboard-card
vuesp-create add sensor

# Non-interactive
vuesp-create add dashboard-card --type info --id device.power --name Power --path device.power --unit W --yes
vuesp-create add sensor --kind temperature --path device.temperature --name Temperature --yes
vuesp-create add sensor --kind analog --gpio 34 --name "Analog 34" --unit '%' --yes
vuesp-create add sensor --kind digital --gpio 2 --name Door --yes
vuesp-create add dashboard-card --type button --gpio 12 --name Light --yes
```

The command finds the project root automatically, refuses duplicate card ids and
updates both the dashboard source and the generated `default.json`.

## Check for updates

```bash
vuesp-create check
vuesp-create check --json
vuesp-create check --strict   # exit code 1 when updates are available
```

The check reports:

- a newer `vuesp-create` on npm;
- a newer template commit than the one recorded in `.vuesp.json`;
- outdated dependencies in `vue/package.json` (via `npm outdated`).

## GitHub repository

`--github` initializes git (if needed), creates the initial commit and runs:

```bash
gh repo create my-project --public --source . --remote origin --push
```

Requires the [GitHub CLI](https://cli.github.com/) and `gh auth login`.

```bash
npx vuesp-create@latest my-project --github --yes
npx vuesp-create@latest my-project --github --private --yes
```

Private repositories are not visible in the public Vuesp catalog.

## Options

```text
vuesp-create [project-name] [options]

  -b, --board <board>       Board environment from platformio.ini
      --preset <name>       Starter preset: bms, camera, led
  -t, --template <source>   Template source (github:owner/repo or a local path)
      --ref <ref>           Template branch, tag or commit
  -p, --pm <name>           npm, pnpm, yarn or bun
      --install             Install dependencies
      --no-install          Skip dependency installation
      --git                 Initialize a git repository
      --fork                Keep template git history and add an upstream remote (default)
      --no-fork             Create an independent copy without upstream history
      --no-git              Skip git initialization
  -g, --github              Create a GitHub repository with gh
      --private             Create a private GitHub repository
      --name <name>         npm package name in vue/package.json
      --list-boards         Show available boards and exit
  -y, --yes                 Use defaults and skip prompts
  -V, --version             Show the CLI version
  -h, --help                Show help
```

Commands:

```text
vuesp-create add dashboard-card [dir]   Add a dashboard card
vuesp-create add sensor [dir]          Add a sensor card
vuesp-create check [dir]               Check CLI, template and dependency updates
```

Examples:

```bash
# Non-interactive: ESP32-C3, pnpm, install dependencies, initialize git
npx vuesp-create@latest vuesp.bms-12v --board esp32-c3-devkitm-1 --pm pnpm --yes

# Use another template branch or tag
npx vuesp-create@latest my-project --ref feature/V4.0

# Scaffold from a local checkout (useful for template development)
npx vuesp-create@latest my-project --template ./vuesp --board esp32
```

## After creating a project

```bash
cd my-project
cd vue
npm run dev
```

Open <http://localhost:3000>. The dev server proxies WebSocket and file requests to the device configured in `vue/.env` (`VITE_IP`).

Build the firmware:

```bash
pio run -e esp32-c3-devkitm-1
```

## Publishing to the Vuesp catalog

1. Push the project to a public GitHub repository (or create it with `--github`).
2. Open <https://lk.vuesp.ru/projects/new>.
3. Paste the repository URL and press **Заполнить** — the form reads `.vuesp.json`.
4. Check the description and submit the project for moderation.

The catalog reads the README, screenshots from `github/images/screen`, releases and `platformio.ini` automatically.

## Development

```bash
npm install
npm test          # unit tests (node:test)
npm start -- my-project --template ./vuesp --no-install --no-git
```

The CLI is a small ESM package:

```text
bin/cli.js          prompts and orchestration
utils/platformio.js platformio.ini parsing and editing
utils/project.js    package.json, README and index.html updates
utils/dashboard.js  dashboard cards (add dashboard-card / add sensor)
utils/manifest.js   .vuesp.json generation and validation
utils/presets.js    bms, camera and led presets
utils/scaffold.js   applies a project configuration to the template
utils/run.js        child process and package manager helpers
utils/updates.js    CLI/template/dependency update checks
```

See [TESTING.md](./TESTING.md) for a local end-to-end test checklist.

## Publishing a release

The `.github/workflows/publish.yml` workflow publishes to npm when a `v*` tag is
pushed. It checks that the tag matches `package.json` and runs the tests first.

```bash
npm version patch
git push --follow-tags
```

Configure the `NPM_TOKEN` secret in the GitHub repository settings. The workflow
uses `npm publish --provenance --access public`.

## Replaces `create-vuesp`

`vuesp-create` is the successor of `create-vuesp`. The old package name will no longer be updated.

## License

MIT © bondrogeen
