# Portable Builds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the working prototype into a tested, documented personal portable build: one executable per
server and platform with the builder's SAP NW RFC SDK inside, built by `npm run portable:build[:full|:compact]`
and checked by `npm run portable:smoke`.

**Architecture:** `scripts/portable/build.mjs` installs the published servers from npm, bundles each with
esbuild, injects it into the official Node 24 binary (Node SEA, postject) and lays out the archive with the SDK
runtime libraries and the RFC addon in `nwrfcsdk/lib`. `scripts/portable/sea-rfc-loader.cjs` replaces
`node-gyp-build` inside the bundle and loads the addon from there. This plan splits the testable logic out of
both scripts, adds the smoke check and the documentation.

**Tech Stack:** Node 22/24, esbuild 0.28, postject 1.0.0-alpha.6, Jest + ts-jest (existing), MCP TypeScript SDK
(existing dependency) for the smoke client.

**Spec:** `docs/superpowers/specs/2026-10-05-portable-builds-design.md`

## Global Constraints

- Platforms: `win-x64` (HTTP, RFC, SNC), `macos-arm64` (HTTP, RFC, SNC), `linux-x64` (HTTP, RFC).
- Servers: `full` → `mcp-abap-adt` (`@mcp-abap-adt/core`), `compact` → `mcp-abap-adt-compact` (`@mcp-abap-adt/compact`).
- Commands: `portable:build:full`, `portable:build:compact`, `portable:build` (both); for the platform the build runs on.
- The runtime inside is Node 24 from nodejs.org, SHA-256 checked.
- A portable build is personal: the archive carries the builder's SDK and is never published, attached to a
  release or uploaded as a CI artifact; its README says so.
- `SAPNWRFC_HOME`, when set, wins over `<exe dir>/nwrfcsdk/lib` at run time.
- Dependencies only from the npm registry; no `file:`/`link:`.
- Descriptions and docs name nothing concrete (placeholders such as `<your .env>`, `your-sap-system.example`).

## Review Focus

1. `SAPNWRFC_HOME` set to a folder without the SDK library — the refusal must name that folder and say
   `SAPNWRFC_HOME` is set, not point at `nwrfcsdk/lib` (Task 1 test).
2. An archive folder that is read-only and already holds the identical addon — the loader must not try to
   write (Task 1 test).
3. A stale `sapnwrfc.node` from an older build in the folder — replaced by the embedded one, not loaded
   (Task 1 test).
4. `npm run portable:build -- --platform=<other>` — refused naming cross-building, before any download
   (Task 2 test).
5. The smoke check run with `SAPNWRFC_HOME` set in the shell — it must test the archive's own SDK folder,
   so it clears the variable for the executables it starts (Task 3).

---

## File Structure

- `scripts/portable/sea-rfc-loader.cjs` — modify: split into pure helpers (`sdkLibraryName`,
  `resolveSdkLibDir`, `prepareAddon`) plus the default `loadEmbeddedAddon`.
- `scripts/portable/args.cjs` — create: `PLATFORMS`, `SERVERS`, `currentPlatform`, `parseArgs`.
- `scripts/portable/build.mjs` — modify: use `args.cjs`; no behaviour change.
- `scripts/portable/smoke.mjs` — create: post-build checks; `npm run portable:smoke`.
- `src/__tests__/unit/portable/seaRfcLoader.test.ts` — create.
- `src/__tests__/unit/portable/portableArgs.test.ts` — create.
- `docs/installation/PORTABLE.md` — create; `docs/installation/INSTALLATION.md`, `docs/installation/README.md`,
  `README.md`, `CHANGELOG.md` — modify.
- Spec and this plan — deleted in the last task.

---

### Task 1: Testable SEA loader

**Files:**
- Modify: `scripts/portable/sea-rfc-loader.cjs`
- Test: `src/__tests__/unit/portable/seaRfcLoader.test.ts`

**Interfaces:**
- Produces (CommonJS, `module.exports` is the loader function, helpers as properties):
  - `sdkLibraryName(platform: NodeJS.Platform): string | undefined`
  - `resolveSdkLibDir({ env, execPath }): string`
  - `prepareAddon({ dir, addon: Buffer, platform, fsImpl? }): string` — returns the addon file path; throws on
    missing SDK library or unwritable folder.

- [ ] **Step 1: Write the failing test**

```ts
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// biome-ignore lint/style/noCommonJs: the loader is CommonJS, bundled as such
const loader = require('../../../../scripts/portable/sea-rfc-loader.cjs');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sea-loader-'));
const addon = Buffer.from('addon-bytes');

describe('portable RFC loader', () => {
  it('names the SDK library per platform', () => {
    expect(loader.sdkLibraryName('win32')).toBe('sapnwrfc.dll');
    expect(loader.sdkLibraryName('darwin')).toBe('libsapnwrfc.dylib');
    expect(loader.sdkLibraryName('linux')).toBe('libsapnwrfc.so');
  });

  it('prefers SAPNWRFC_HOME/lib, else nwrfcsdk/lib beside the executable', () => {
    const execPath = path.join('/opt', 'p', 'mcp-abap-adt');
    expect(loader.resolveSdkLibDir({ env: { SAPNWRFC_HOME: '/sdk' }, execPath })).toBe(
      path.join('/sdk', 'lib'),
    );
    expect(loader.resolveSdkLibDir({ env: { SAPNWRFC_HOME: '  ' }, execPath })).toBe(
      path.join('/opt', 'p', 'nwrfcsdk', 'lib'),
    );
  });

  it('refuses a folder without the SDK library, naming it', () => {
    const dir = tmp();
    expect(() => loader.prepareAddon({ dir, addon, platform: 'linux' })).toThrow(
      new RegExp(`${dir.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')}.*libsapnwrfc\\.so was not found`),
    );
  });

  it('says so when SAPNWRFC_HOME chose the folder', () => {
    const dir = tmp();
    expect(() =>
      loader.prepareAddon({ dir, addon, platform: 'linux', fromEnv: true }),
    ).toThrow(/SAPNWRFC_HOME is set/);
  });

  it('writes nothing when the identical addon is already there (read-only folder)', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'libsapnwrfc.so'), '');
    fs.writeFileSync(path.join(dir, 'sapnwrfc.node'), addon);
    const writeFileSync = jest.fn();
    const file = loader.prepareAddon({ dir, addon, platform: 'linux', fsImpl: { ...fs, writeFileSync } });
    expect(file).toBe(path.join(dir, 'sapnwrfc.node'));
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it('replaces a stale addon with the embedded one', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'libsapnwrfc.so'), '');
    fs.writeFileSync(path.join(dir, 'sapnwrfc.node'), 'old');
    loader.prepareAddon({ dir, addon, platform: 'linux' });
    expect(fs.readFileSync(path.join(dir, 'sapnwrfc.node'))).toEqual(addon);
  });

  it('names an unwritable folder', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'libsapnwrfc.so'), '');
    const writeFileSync = () => {
      throw Object.assign(new Error('denied'), { code: 'EACCES' });
    };
    expect(() =>
      loader.prepareAddon({ dir, addon, platform: 'linux', fsImpl: { ...fs, writeFileSync } }),
    ).toThrow(/could not be written into .*EACCES.*must be writable/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/unit/portable/seaRfcLoader.test.ts`
Expected: FAIL — `loader.sdkLibraryName is not a function`.

- [ ] **Step 3: Implement**

Rewrite `scripts/portable/sea-rfc-loader.cjs`:

```js
'use strict';
// (header comment kept from the prototype)
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const LIBRARY = { win32: 'sapnwrfc.dll', darwin: 'libsapnwrfc.dylib', linux: 'libsapnwrfc.so' };

function sdkLibraryName(platform) {
  return LIBRARY[platform];
}

function resolveSdkLibDir({ env, execPath }) {
  const home = env.SAPNWRFC_HOME?.trim();
  if (home) return path.join(home, 'lib');
  return path.join(path.dirname(execPath), 'nwrfcsdk', 'lib');
}

const digest = (b) => crypto.createHash('sha256').update(b).digest('hex');

function prepareAddon({ dir, addon, platform, fromEnv = false, fsImpl = fs }) {
  const library = sdkLibraryName(platform);
  if (!library || !fsImpl.existsSync(path.join(dir, library))) {
    throw new Error(
      `RFC needs the SAP NW RFC SDK: copy the files of the SDK's lib/ folder into ${dir}` +
        (fromEnv ? ' (SAPNWRFC_HOME is set)' : '') +
        ` — ${library ?? 'this platform'} was not found there`,
    );
  }
  const file = path.join(dir, 'sapnwrfc.node');
  let current;
  try {
    current = fsImpl.readFileSync(file);
  } catch {
    current = undefined;
  }
  if (!current || digest(current) !== digest(addon)) {
    try {
      fsImpl.writeFileSync(file, addon);
    } catch (error) {
      throw new Error(
        `the RFC addon could not be written into ${dir}: ${error.code ?? error.message} — the folder must be writable`,
      );
    }
  }
  return file;
}

let loaded;

function loadEmbeddedAddon() {
  if (loaded) return loaded;
  const sea = require('node:sea');
  if (!sea.isSea()) {
    throw new Error('the embedded RFC addon is only available in a portable executable');
  }
  const dir = resolveSdkLibDir({ env: process.env, execPath: process.execPath });
  const file = prepareAddon({
    dir,
    addon: Buffer.from(sea.getRawAsset('sapnwrfc.node')),
    platform: process.platform,
    fromEnv: Boolean(process.env.SAPNWRFC_HOME?.trim()),
  });
  if (process.platform === 'win32') {
    process.env.PATH = `${dir}${path.delimiter}${process.env.PATH ?? ''}`;
  }
  const module_ = { exports: {} };
  process.dlopen(module_, file);
  loaded = module_.exports;
  return loaded;
}

module.exports = loadEmbeddedAddon;
module.exports.sdkLibraryName = sdkLibraryName;
module.exports.resolveSdkLibDir = resolveSdkLibDir;
module.exports.prepareAddon = prepareAddon;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/__tests__/unit/portable/seaRfcLoader.test.ts`
Expected: PASS (7 tests). If Jest refuses the `.cjs` path, add `"cjs"` to `jest.moduleFileExtensions`.

- [ ] **Step 5: Rebuild and re-run the Linux container check** (`npm run portable:build:full`, then the
read-only `docker run` from the spec's *Verified* section) — the bundle must still load the addon.

- [ ] **Step 6: Commit** — `feat(portable): testable RFC loader — folder, refusals, no write when present`.

### Task 2: Argument parsing as a module

**Files:**
- Create: `scripts/portable/args.cjs`
- Modify: `scripts/portable/build.mjs`
- Test: `src/__tests__/unit/portable/portableArgs.test.ts`

**Interfaces:**
- Produces: `PLATFORMS` (object keyed `linux-x64|win-x64|macos-arm64`, values `{ node, ext, exe, sdkLib, sdkExt, archive }`),
  `SERVERS` (`{ full, compact }` → `{ name, pkg }`), `currentPlatform(platform, arch): string`,
  `parseArgs(argv: string[], here: string): { which: 'full'|'compact'|'all', platform: string, version?: string }`
  — throws `Error` with the user-facing message.

- [ ] **Step 1: Write the failing test**

```ts
// biome-ignore lint/style/noCommonJs: the build helpers are CommonJS
const args = require('../../../../scripts/portable/args.cjs');

describe('portable build arguments', () => {
  it('maps the platform of the running process', () => {
    expect(args.currentPlatform('linux', 'x64')).toBe('linux-x64');
    expect(args.currentPlatform('win32', 'x64')).toBe('win-x64');
    expect(args.currentPlatform('darwin', 'arm64')).toBe('macos-arm64');
  });

  it('defaults to both servers on the current platform', () => {
    expect(args.parseArgs([], 'linux-x64')).toEqual({ which: 'all', platform: 'linux-x64' });
  });

  it('takes the server and a version', () => {
    expect(args.parseArgs(['compact', '--version=17.0.1'], 'linux-x64')).toEqual({
      which: 'compact',
      platform: 'linux-x64',
      version: '17.0.1',
    });
  });

  it('refuses an unknown server, naming the valid ones', () => {
    expect(() => args.parseArgs(['both'], 'linux-x64')).toThrow(/full, compact or all/);
  });

  it('refuses an unknown platform, naming the valid ones', () => {
    expect(() => args.parseArgs(['--platform=win-arm64'], 'linux-x64')).toThrow(
      /linux-x64, win-x64, macos-arm64/,
    );
  });

  it('refuses cross-building before anything is downloaded', () => {
    expect(() => args.parseArgs(['--platform=win-x64'], 'linux-x64')).toThrow(/cross-building win-x64 on linux-x64/);
  });

  it('refuses an unknown option', () => {
    expect(() => args.parseArgs(['--fast'], 'linux-x64')).toThrow(/unknown option --fast/);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx jest src/__tests__/unit/portable/portableArgs.test.ts`;
  Expected: FAIL, module not found.

- [ ] **Step 3: Implement `scripts/portable/args.cjs`** — move `SERVERS`, `PLATFORMS`, `currentPlatform` and
  the parsing from `build.mjs`, throwing instead of exiting:

```js
'use strict';
// Arguments and platform table of scripts/portable/build.mjs, CommonJS so the
// unit tests can load them.
const SERVERS = {
  full: { name: 'mcp-abap-adt', pkg: '@mcp-abap-adt/core' },
  compact: { name: 'mcp-abap-adt-compact', pkg: '@mcp-abap-adt/compact' },
};
const PLATFORMS = {
  'linux-x64': { node: 'linux-x64', ext: 'tar.xz', exe: '', sdkLib: 'libsapnwrfc.so', sdkExt: '.so', archive: 'tar.gz' },
  'win-x64': { node: 'win-x64', ext: 'zip', exe: '.exe', sdkLib: 'sapnwrfc.dll', sdkExt: '.dll', archive: 'zip' },
  'macos-arm64': { node: 'darwin-arm64', ext: 'tar.gz', exe: '', sdkLib: 'libsapnwrfc.dylib', sdkExt: '.dylib', archive: 'zip' },
};

function currentPlatform(platform = process.platform, arch = process.arch) {
  const key = { linux: 'linux', win32: 'win', darwin: 'macos' }[platform];
  return `${key}-${arch}`;
}

function parseArgs(argv, here = currentPlatform()) {
  const opts = { which: 'all', platform: here };
  for (const arg of argv) {
    if (arg.startsWith('--platform=')) opts.platform = arg.slice(11);
    else if (arg.startsWith('--version=')) opts.version = arg.slice(10);
    else if (!arg.startsWith('--')) opts.which = arg;
    else throw new Error(`unknown option ${arg}`);
  }
  if (!['full', 'compact', 'all'].includes(opts.which)) {
    throw new Error(`unknown server "${opts.which}": full, compact or all`);
  }
  if (!PLATFORMS[opts.platform]) {
    throw new Error(`unknown platform "${opts.platform}": ${Object.keys(PLATFORMS).join(', ')}`);
  }
  if (opts.platform !== here) {
    throw new Error(
      `cross-building ${opts.platform} on ${here} needs the target's prebuilt RFC addon (sap-rfc-lite prebuilds) — not in this version`,
    );
  }
  return opts;
}

module.exports = { SERVERS, PLATFORMS, currentPlatform, parseArgs };
```

  In `build.mjs`: `import { createRequire } from 'node:module'; const { SERVERS, PLATFORMS, parseArgs } =
  createRequire(import.meta.url)('./args.cjs');`, delete the moved definitions, and wrap:
  `let opts; try { opts = parseArgs(process.argv.slice(2)); } catch (e) { fail(e.message); }
  opts.version ??= <root package.json version>;`.

- [ ] **Step 4: Run to verify it passes**, then `npm run portable:build:compact` still builds.
- [ ] **Step 5: Commit** — `refactor(portable): arguments and platform table as a tested module`.

### Task 3: Smoke check

**Files:**
- Create: `scripts/portable/smoke.mjs`
- Modify: `package.json` (`"portable:smoke": "node scripts/portable/smoke.mjs"`)

**Interfaces:**
- Consumes: `SERVERS`, `PLATFORMS`, `currentPlatform` from `args.cjs`; built folders
  `dist-portable/<name>-<version>-<platform>/`.

- [ ] **Step 1: Implement `scripts/portable/smoke.mjs`**

```js
#!/usr/bin/env node
// Checks the portable executables built for this platform: version, MCP
// initialize + tools/list over stdio, and an RFC call that must reach the RFC
// stack (an unreachable host answers an RFC error) rather than fail to load it.
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const { SERVERS, PLATFORMS, currentPlatform } = createRequire(import.meta.url)('./args.cjs');
const version = process.argv[2] ?? JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')).version;
const platform = currentPlatform();
const { exe } = PLATFORMS[platform];

// The archive's own SDK folder is what is checked, not an SDK the shell knows.
const env = { ...process.env };
delete env.SAPNWRFC_HOME;

const envFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'portable-smoke-')), 'rfc.env');
fs.writeFileSync(
  envFile,
  [
    'SAP_URL=http://unreachable.invalid:8000',
    'SAP_CLIENT=001',
    'SAP_AUTH_TYPE=basic',
    'SAP_USERNAME=placeholder',
    'SAP_PASSWORD=placeholder',
    'SAP_CONNECTION_TYPE=rfc',
    'SAP_SYSTEM_TYPE=onprem',
    '',
  ].join('\n'),
);

let failed = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

for (const server of Object.values(SERVERS)) {
  const dir = path.join(repo, 'dist-portable', `${server.name}-${version}-${platform}`);
  const bin = path.join(dir, `${server.name}${exe}`);
  if (!fs.existsSync(bin)) {
    console.log(`skip ${server.name}: not built (${dir})`);
    continue;
  }
  const answered = execFileSync(bin, ['--version'], { env, encoding: 'utf8' }).trim();
  check(`${server.name} --version`, answered === version, answered);

  const client = new Client({ name: 'portable-smoke', version: '0' });
  await client.connect(new StdioClientTransport({ command: bin, args: [`--env-path=${envFile}`], env, stderr: 'ignore' }));
  const tools = (await client.listTools()).tools.map((t) => t.name);
  check(`${server.name} tools/list`, server.name.endsWith('compact') ? tools.length === 25 : tools.length > 25, `${tools.length} tools`);

  const search = tools.includes('SearchObject')
    ? { name: 'SearchObject', arguments: { object_name: 'X*', maxResults: 1 } }
    : { name: 'HandlerSearch', arguments: { query: 'X*', max_results: 1 } };
  const result = await client.callTool(search);
  const text = String(result.content?.[0]?.text ?? '');
  const reachedRfc = /RFC_[A-Z_]+/.test(text) && !/needs the SAP NW RFC SDK|is not available/.test(text);
  check(`${server.name} RFC stack loads from nwrfcsdk/lib`, result.isError === true && reachedRfc, text.replace(/\s+/g, ' ').slice(0, 160));
  await client.close();
}

process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run** — `npm run portable:build && npm run portable:smoke`.
  Expected: every line `ok`, exit 0 (both servers; RFC detail contains `RFC_COMMUNICATION_FAILURE`).
- [ ] **Step 3: Negative check** — move `dist-portable/mcp-abap-adt-<v>-linux-x64/nwrfcsdk/lib/libsapnwrfc.so`
  away, run `npm run portable:smoke`: the RFC line must be `FAIL` (refusal naming the folder); move it back.
- [ ] **Step 4: Commit** — `feat(portable): npm run portable:smoke — version, MCP, RFC stack from the archive`.

### Task 4: Documentation

**Files:**
- Create: `docs/installation/PORTABLE.md`
- Modify: `docs/installation/INSTALLATION.md` (section *Installation variants*), `docs/installation/README.md`,
  `README.md` (Getting Started paragraph), `CHANGELOG.md` (`## [Unreleased]` → `### Added`)

- [ ] **Step 1: Write `docs/installation/PORTABLE.md`** with: what a portable build is (one executable per
  server and platform, Node inside, the builder's SDK inside, personal — never handed on, and why); platform
  table; prerequisites on the building machine (SDK at `SAPNWRFC_HOME`, C++ toolchain, Node 22/24 + this
  checkout); the three commands and `--version=`; the output layout; `npm run portable:smoke`; running it
  from an MCP client (`<exe> --env-path=<your .env>`); which SDK folder wins and how to check the loaded one
  (same text as the archive README); signing (ad-hoc on macOS, SmartScreen on Windows); what is verified
  (Linux in a clean container, Windows 11 with SNC) and that macOS is built and smoke-tested on a Mac by
  the user; limits (no cross-building yet, no publication).
- [ ] **Step 2: Link it** — INSTALLATION.md: a *Portable build (personal)* paragraph after *What to run*;
  installation/README.md: list entry; README.md: one sentence in Getting Started.
- [ ] **Step 3: CHANGELOG** — under `## [Unreleased]`, `### Added`: the portable build, its commands, smoke,
  the personal-build rule, and the `FORCE_COLOR` workaround for `sap-rfc-lite`'s build.
- [ ] **Step 4: Check links** (relative links resolve) and commit — `docs(portable): building one's own portable server`.

### Task 5: macOS (on the user's Mac)

- [ ] **Step 1:** On a Mac (arm64) with Xcode CLT, the macOS SDK at `SAPNWRFC_HOME` and Node 22/24:
  `git checkout feat/portable-builds && npm ci && npm run portable:build && npm run portable:smoke`.
- [ ] **Step 2:** Report the output; fix what fails (expected risk: `install_name_tool -delete_rpath` path,
  codesign of the injected binary). Record the result in PORTABLE.md.

### Task 6: Close

- [ ] **Step 1:** Full checks: `npm run build`, `npm run lint:check`, `npm run test:check`, `npm test`.
- [ ] **Step 2:** Delete the spec and this plan (they live only while active); commit
  `chore: portable builds implemented — spec and plan removed`; mark PR #278 ready for review.
