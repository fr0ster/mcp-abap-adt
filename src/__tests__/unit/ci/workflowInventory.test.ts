/**
 * The pipelines check every package of the release, and only those.
 *
 * `ci.yml` and `release.yml` name the packages by hand in four places: the
 * `npm pack` lists (what the install and the images take from this checkout
 * instead of the registry), the `ours` list of the install step's nested-copy
 * check, and one `lint:check` / `test:check` step per package. A package left
 * out of a pack list is installed from the registry — the version being
 * released is not there yet, or an older one is — and the run stays green;
 * one left out of the step lists is never linted or type-checked. 19.2.0 added
 * `server-runtime` to each by hand, so this test holds them to the inventory
 * the install tests pack (`RELEASE_DIRS`).
 *
 * Plain line parsing over the workflow text: no YAML parser in the repository.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RELEASE_DIRS, ROOT } from '../../helpers/installedRelease';

const WORKFLOWS = ['ci.yml', 'release.yml'] as const;

const read = (workflow: string): string[] =>
  readFileSync(join(ROOT, '.github', 'workflows', workflow), 'utf8').split(
    /\r?\n/,
  );

/** Each package directory's npm name, without the scope. */
const nameOf = (dir: string): string =>
  (
    JSON.parse(readFileSync(join(ROOT, dir, 'package.json'), 'utf8')) as {
      name: string;
    }
  ).name.replace('@mcp-abap-adt/', '');

const sorted = (items: Iterable<string>): string[] => [...items].sort();

/** The directories the `npm pack` lines pack; a bare `npm pack` is the root. */
function packed(lines: string[]): string[] {
  const dirs: string[] = [];
  for (const line of lines) {
    const words = line.trim().split(/\s+/);
    if (words[0] !== 'npm' || words[1] !== 'pack') continue;
    const args = words.slice(2);
    if (args.length === 0) dirs.push('.');
    for (const arg of args) dirs.push(arg.replace(/^\.\//, ''));
  }
  return dirs;
}

/** The names in the install step's `const ours=[...]`. */
function ours(lines: string[]): string[] {
  const found = lines.filter((line) => line.includes('const ours=['));
  expect(found).toHaveLength(1);
  const list = (found[0] as string).split('const ours=[')[1]?.split(']')[0];
  return (list ?? '')
    .split(',')
    .map((item) => item.trim().replace(/^'|'$/g, ''))
    .filter((item) => item !== '');
}

/** The directories of `run: npm --prefix <dir> run <script>` steps. */
function prefixed(lines: string[], script: string): string[] {
  const dirs: string[] = [];
  for (const line of lines) {
    const words = line.trim().split(/\s+/);
    if (
      words[0] === 'run:' &&
      words[1] === 'npm' &&
      words[2] === '--prefix' &&
      words[4] === 'run' &&
      words[5] === script &&
      words.length === 6
    )
      dirs.push(words[3] as string);
  }
  return dirs;
}

const hasStep = (lines: string[], command: string): boolean =>
  lines.some((line) => line.trim() === `run: ${command}`);

describe.each(WORKFLOWS)('%s names every package of the release', (file) => {
  const lines = read(file);
  const packages = RELEASE_DIRS.filter((dir) => dir !== '.');

  it('packs each of them once, the root included', () => {
    const dirs = packed(lines);
    expect(sorted(dirs)).toEqual(sorted(RELEASE_DIRS));
    expect(new Set(dirs).size).toBe(dirs.length);
  });

  it("checks each of them in the install step's nested-copy list", () => {
    const names = ours(lines);
    expect(sorted(names)).toEqual(sorted(RELEASE_DIRS.map(nameOf)));
    expect(new Set(names).size).toBe(names.length);
  });

  it('lints each of them: the root its src, every other package its own', () => {
    expect(
      hasStep(lines, 'npm run lint:check -- --diagnostic-level=error'),
    ).toBe(true);
    expect(sorted(prefixed(lines, 'lint:check'))).toEqual(sorted(packages));
  });

  it('type-checks the tests of each package that has a tsconfig.test.json', () => {
    expect(hasStep(lines, 'npm run test:check')).toBe(true);
    const withTests = packages.filter((dir) =>
      existsSync(join(ROOT, dir, 'tsconfig.test.json')),
    );
    expect(withTests.length).toBeGreaterThan(0);
    expect(sorted(prefixed(lines, 'test:check'))).toEqual(sorted(withTests));
  });
});

/**
 * The install matrix runs in one CI cell: ubuntu-latest + Node 22. Every
 * other cell's `npm test` step sets `SKIP_INSTALL_MATRIX` to `'true'` (on
 * windows-latest both cells hung in that step with it).
 */
/** A GitHub Actions expression, `$` + `{{ inner }}`, built so no literal looks like a JS template. */
const expression = (inner: string): string =>
  ['$', '{{ ', inner, ' }}'].join('');

const INSTALL_MATRIX_GATE = {
  'ci.yml': `SKIP_INSTALL_MATRIX: ${expression("(matrix.os == 'ubuntu-latest' && matrix.node-version == 22) && 'false' || 'true'")}`,
  'release.yml': `SKIP_INSTALL_MATRIX: ${expression("matrix.node-version == 22 && 'false' || 'true'")}`,
} as const;

/** The lines of the step named `name`, up to the next step. */
function step(lines: string[], name: string): string[] {
  const start = lines.findIndex((line) => line.trim() === `- name: ${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.trim().startsWith('- name: '));
  return end === -1 ? rest : rest.slice(0, end);
}

describe.each(WORKFLOWS)('%s runs the install matrix in one cell', (file) => {
  const lines = read(file);

  it("the npm test step's SKIP_INSTALL_MATRIX: 'false' only on ubuntu-latest + Node 22", () => {
    const run = step(lines, 'Run tests').map((line) => line.trim());
    expect(run).toContain('run: npm test');
    expect(run).toContain('env:');
    expect(
      run.filter((line) => line.startsWith('SKIP_INSTALL_MATRIX:')),
    ).toEqual([INSTALL_MATRIX_GATE[file]]);
  });

  it('the job runs where the gate assumes', () => {
    const text = lines.join('\n');
    if (file === 'ci.yml') {
      expect(text).toContain(`runs-on: ${expression('matrix.os')}`);
      expect(text).toContain(
        'os: [ubuntu-latest, macos-latest, windows-latest]',
      );
    } else {
      // The test job, the first of the file.
      expect(
        lines.find((line) => line.trim().startsWith('runs-on:'))?.trim(),
      ).toBe('runs-on: ubuntu-latest');
    }
    expect(text).toContain('node-version: [22, 24]');
  });
});

it('the install matrix suite skips only on SKIP_INSTALL_MATRIX=true', () => {
  const source = readFileSync(
    join(ROOT, 'src', '__tests__', 'unit', 'installMatrix.test.ts'),
    'utf8',
  );
  expect(source).toContain(
    "const SKIPPED = process.env.SKIP_INSTALL_MATRIX === 'true';",
  );
});

/**
 * Supply-chain hardening (20.0.0). `package.json` `allowScripts` with `.npmrc`
 * `strict-allow-scripts` keeps dependency install scripts from running, but
 * only npm 11.19.0 and later read them: the Node 22 runner's npm 10 reads
 * neither, so the workflows install with `--ignore-scripts`. Nothing calls
 * `npx`, which fetches from the registry whatever it does not find installed.
 */
describe.each(WORKFLOWS)('%s installs and runs nothing unreviewed', (file) => {
  const lines = read(file);

  it('installs with npm ci --ignore-scripts, and only so', () => {
    const installs = lines
      .map((line) => line.trim())
      .filter((line) => line.startsWith('run: npm ci'));
    expect(installs.length).toBeGreaterThan(0);
    for (const line of installs)
      expect(line).toBe('run: npm ci --ignore-scripts');
  });

  it('runs no install script in any install, a run block line included', () => {
    // The tarball install in /tmp/install-check is outside the checkout and
    // its .npmrc, so only the flag keeps a dependency's script from running.
    // A release's notes (`body: |`) are text for its readers, not commands.
    const commands: string[] = [];
    let body = -1;
    for (const line of lines) {
      const indent = line.length - line.trimStart().length;
      if (body >= 0 && (line.trim() === '' || indent > body)) continue;
      body = line.trim() === 'body: |' ? indent : -1;
      commands.push(line);
    }
    const installs = commands
      .map((line) => line.trim().replace(/^run:\s*/, ''))
      .filter((line) => /^npm (ci|install|i)(\s|$)/.test(line));
    expect(installs.some((line) => line.startsWith('npm install'))).toBe(true);
    expect(
      installs.filter((line) => !line.includes('--ignore-scripts')),
    ).toEqual([]);
  });

  it('gates on every known advisory of moderate severity or above', () => {
    const audit = step(lines, 'Security audit (moderate+)').map((line) =>
      line.trim(),
    );
    expect(audit).toContain('run: npm audit --audit-level=moderate');
    expect(
      lines.filter((line) => line.trim().startsWith('continue-on-error')),
    ).toEqual([]);
  });

  it('caps every job', () => {
    const body = lines.slice(lines.indexOf('jobs:') + 1);
    const jobs = body.filter((line) => /^ {2}[a-z-]+:$/.test(line)).length;
    const caps = body.filter((line) =>
      /^ {4}timeout-minutes: \d+$/.test(line),
    ).length;
    expect(jobs).toBeGreaterThan(0);
    expect(caps).toBe(jobs);
  });

  it('calls no npx', () => {
    expect(lines.filter((line) => /\bnpx\b/.test(line))).toEqual([]);
  });
});

it('no package script and no git hook calls npx', () => {
  const offenders: string[] = [];
  for (const dir of RELEASE_DIRS) {
    const { scripts = {} } = JSON.parse(
      readFileSync(join(ROOT, dir, 'package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> };
    for (const [name, command] of Object.entries(scripts))
      if (/\bnpx\b/.test(command)) offenders.push(`${dir}: ${name}`);
  }
  const hook = readFileSync(join(ROOT, '.husky', 'pre-commit'), 'utf8');
  if (/\bnpx\b/.test(hook)) offenders.push('.husky/pre-commit');
  expect(offenders).toEqual([]);
});

it('every dependency install script is decided, and the policy is strict', () => {
  const lock = JSON.parse(
    readFileSync(join(ROOT, 'package-lock.json'), 'utf8'),
  ) as { packages: Record<string, { hasInstallScript?: boolean }> };
  const withScripts = new Set(
    Object.entries(lock.packages)
      .filter(([path, entry]) => path !== '' && entry.hasInstallScript)
      .map(([path]) => path.split('node_modules/').pop() as string),
  );
  const { allowScripts = {} } = JSON.parse(
    readFileSync(join(ROOT, 'package.json'), 'utf8'),
  ) as { allowScripts?: Record<string, boolean> };
  expect(sorted(Object.keys(allowScripts))).toEqual(sorted(withScripts));
  expect(
    Object.values(allowScripts).every((allowed) => allowed === false),
  ).toBe(true);
  const npmrc = readFileSync(join(ROOT, '.npmrc'), 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim());
  expect(npmrc).toContain('strict-allow-scripts=true');
  // The 7-day release age was dropped: it conflicted with the gating audit.
  expect(npmrc.some((line) => line.includes('min-release-age'))).toBe(false);
});

it('every Dockerfile installs with --ignore-scripts', () => {
  // Inside an image neither the checkout's .npmrc nor its allowScripts
  // applies, and the install runs as root.
  const dir = join(ROOT, 'docker');
  const files = readdirSync(dir).filter((name) =>
    name.startsWith('Dockerfile'),
  );
  expect(sorted(files)).toEqual([
    'Dockerfile',
    'Dockerfile.inspect.cloud',
    'Dockerfile.inspect.onprem',
  ]);
  const installs = files.flatMap((name) =>
    readFileSync(join(dir, name), 'utf8')
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith('#'))
      .filter((line) => /\bnpm (ci|install|i)\b/.test(line))
      .map((line) => `${name}: ${line.trim()}`),
  );
  expect(installs.length).toBe(4);
  expect(installs.filter((line) => !line.includes('--ignore-scripts'))).toEqual(
    [],
  );
});
