# Local testing

How to test `vuesp-create` on your machine before pushing or publishing.

The examples below use `/path/to/vuesp-create`. Replace it with your
local path if it is different.

## Requirements

- Node.js 22.13 or newer
- npm
- A local checkout of the Vuesp template (for offline tests)
- Optional: GitHub CLI (`gh`) for `--github`

```bash
cd /path/to/vuesp-create
node --version   # must be >= 22.13
npm ci
```

## 1. Unit tests

```bash
npm test
```

Expected:

```text
ℹ tests 41
ℹ pass 41
ℹ fail 0
```

## 2. CLI basics

```bash
node bin/cli.js --help
node bin/cli.js --version
node bin/cli.js --list-boards
```

`--list-boards` reads `platformio.ini` from the template. If the network is
unavailable it falls back to the built-in board list.

## 3. Create a project from the local template

Use the local `vuesp` checkout to test uncommitted template changes and avoid
network access:

```bash
cd /tmp
rm -rf vuesp.local-test

node /path/to/vuesp-create/bin/cli.js vuesp.local-test \
  --template /path/to/vuesp \
  --preset bms \
  --no-install \
  --no-git \
  --yes
```

Check the result:

```bash
cat /tmp/vuesp.local-test/.vuesp.json
grep -n '^\[env:' /tmp/vuesp.local-test/platformio.ini
cat /tmp/vuesp.local-test/vue/package.json
head -20 /tmp/vuesp.local-test/vue/index.html
```

Expected:

- only one `[env:...]` section in `platformio.ini`;
- `firmware_version = '{0, 1, 0}'`;
- `device_name` contains the project name;
- `.vuesp.json` exists with `preset: "bms"`;
- `vue/package.json` has version `0.1.0` and `private: true`;
- `README.md` is a clean project template with a link to Vuesp;
- `docs/`, `DEVELOPMENT.md`, `CONTRIBUTING.md` and `SECURITY.md` are removed;
- `vue/.env` and `AGENTS.md` are removed.

## 4. Create a project from GitHub

This uses the real template and the default branch:

```bash
cd /tmp
rm -rf vuesp.github-test

node /path/to/vuesp-create/bin/cli.js vuesp.github-test \
  --preset camera \
  --no-install \
  --no-git \
  --yes
```

The GitHub template must already contain the changes you want to test. Until
the new `vuesp` commit is pushed, use `--template ../vuesp` instead.

## 5. Interactive mode

```bash
cd /tmp
node /path/to/vuesp-create/bin/cli.js vuesp.interactive \
  --template /path/to/vuesp
```

The CLI asks for:

1. preset (or none);
2. board;
3. whether to install dependencies;
4. whether to initialize git;
5. whether to create a GitHub repository (only if `gh` is available).

Without `--yes`, `--no-install` and `--no-git` are not implied.

## 6. Add dashboard cards and sensors

```bash
cd /tmp/vuesp.local-test

node /path/to/vuesp-create/bin/cli.js add dashboard-card \
  --type button --gpio 2 --name Relay --yes

node /path/to/vuesp-create/bin/cli.js add dashboard-card \
  --type info --id device.power --name Power \
  --path device.power --unit W --yes

node /path/to/vuesp-create/bin/cli.js add sensor \
  --kind temperature --path device.temperature \
  --name Temperature --yes

node /path/to/vuesp-create/bin/cli.js add sensor \
  --kind analog --gpio 34 --name "Analog 34" --unit '%' --yes

node /path/to/vuesp-create/bin/cli.js add sensor \
  --kind digital --gpio 2 --name Door --yes
```

Expected:

- `vue/json/dashboard.json` contains the new cards;
- `vue/public/default.json` is updated too;
- duplicate ids are rejected with an error.

Interactive version:

```bash
node /path/to/vuesp-create/bin/cli.js add dashboard-card
node /path/to/vuesp-create/bin/cli.js add sensor
```

## 7. Check updates

```bash
cd /tmp/vuesp.local-test
node /path/to/vuesp-create/bin/cli.js check
node /path/to/vuesp-create/bin/cli.js check --json
node /path/to/vuesp-create/bin/cli.js check --strict
```

Notes:

- the CLI version check needs the package to be published on npm;
- the template check compares `template.commit` from `.vuesp.json`;
- the dependency check needs `vue/node_modules`, so run `npm install` in `vue/`
  first;
- `--strict` exits with code 1 when updates are available.

## 8. Test `--github`

Requires the GitHub CLI:

```bash
gh --version
gh auth status
```

Create a private test repository:

```bash
cd /tmp
node /path/to/vuesp-create/bin/cli.js vuesp.gh-test \
  --template /path/to/vuesp \
  --github --private --yes
```

Delete the test repository afterwards:

```bash
gh repo delete <owner>/vuesp.gh-test --yes
```

If `gh` is missing, the command should fail before scaffolding with:

```text
The GitHub CLI is not installed. Install it from https://cli.github.com/ and run "gh auth login"
```

## 9. Test the generated project

```bash
cd /tmp/vuesp.local-test/vue
cp .env.example .env
npm install
npm run dev
```

Without a real device, use the mock server from the template:

```bash
npm run dev:mock
```

Also check:

```bash
npm run typecheck
npm run lint
npm run build-web
```

## 10. Test packaging and global install

```bash
cd /path/to/vuesp-create
npm pack
rm -rf /tmp/vuesp-cli
npm install -g --prefix /tmp/vuesp-cli ./vuesp-create-1.0.0.tgz
/tmp/vuesp-cli/bin/vuesp-create --version
rm -f vuesp-create-*.tgz
```

Or use a temporary global link:

```bash
npm link
vuesp-create --version
npm unlink -g vuesp-create
```

## 11. Test the catalog prefill

After pushing a project with `.vuesp.json` to a public GitHub repository:

```bash
curl 'https://api.vuesp.ru/projects/prefill?repoUrl=https://github.com/<owner>/<repo>'
```

Expected fields: `name`, `summary`, `description`, `platforms`, `tags`,
`preset`, `hasManifest`.

Then open <https://lk.vuesp.ru/projects/new>, paste the repository URL and press
**Заполнить**.

## Cleanup

```bash
rm -rf /tmp/vuesp.local-test /tmp/vuesp.github-test /tmp/vuesp.interactive
rm -rf /tmp/vuesp.gh-test /tmp/vuesp-cli
```

## Common problems

| Problem | Check |
| --- | --- |
| `Node.js 22.13 or newer is required` | `node --version` |
| `The folder "…" already exists` | choose another name or remove the folder |
| `Unknown preset` | `node bin/cli.js --help` |
| `gh` not found | install GitHub CLI and run `gh auth login` |
| `check` skips dependencies | run `npm install` in `vue/` |
| `add` cannot find the project | run it from the project root or pass the directory |
| Template from GitHub is old | push the template changes or use `--template ../vuesp` |
