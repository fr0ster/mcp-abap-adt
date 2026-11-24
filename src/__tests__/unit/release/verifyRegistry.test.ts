/**
 * scripts/verify-registry.mjs (`npm run release:verify`): the post-publish
 * check of a release as the registry serves it. The script starts npm as
 * `node <npm_execpath>`, so each case points `npm_execpath` at a fake npm
 * that answers `view` and `install` from a plan and records every call: no
 * case reaches the network. The fake's install writes the tree and the
 * lockfile the plan states, its bins answer what the plan says.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, describe, it } from 'node:test';
import {
  environment,
  REPO,
  recorded,
  runNode,
  temporaryDir,
  writeAt,
} from '../runner/toolRuns';

const SCRIPT = path.join(REPO, 'scripts', 'verify-registry.mjs');
const VERSION = '9.9.9';
const REGISTRY = 'https://registry.npmjs.org/';

const FAKE_NPM = [
  "'use strict';",
  "const fs = require('node:fs');",
  "const path = require('node:path');",
  'const plan = JSON.parse(fs.readFileSync(process.env.FAKE_NPM_PLAN, "utf8"));',
  'const args = process.argv.slice(2);',
  'fs.appendFileSync(plan.log, `${JSON.stringify({ args, cwd: process.cwd() })}\\n`);',
  "const split = (spec) => { const at = spec.lastIndexOf('@'); return [spec.slice(0, at), spec.slice(at + 1)]; };",
  "if (args[0] === 'view') {",
  '  const [name, version] = split(args.at(-2));',
  '  if (plan.viewFails) { process.stderr.write("npm error code ECONNRESET\\n"); process.exit(1); }',
  '  if (plan.hidden.includes(name)) { process.stderr.write(`npm error code E404\\nnpm error 404 No match found for version ${version}\\n`); process.exit(1); }',
  '  if (!plan.empty.includes(name)) process.stdout.write(`${version}\\n`);',
  // Ends by itself once the version is flushed: an exit right after an
  // asynchronous pipe write can cut it short.
  '  process.exitCode = 0;',
  '  return;',
  '}',
  "if (args[0] === 'install') {",
  "  const packages = { '': { name: 'x' } };",
  "  for (const spec of args.slice(1).filter((arg) => !arg.startsWith('--'))) {",
  '    const [name, version] = split(spec);',
  "    const dir = path.join('node_modules', ...name.split('/'));",
  "    fs.mkdirSync(path.join(dir, 'bin'), { recursive: true });",
  '    const manifest = { name, version };',
  '    const bins = plan.bins[name];',
  '    if (bins) {',
  '      manifest.bin = {};',
  '      for (const [bin, said] of Object.entries(bins)) {',
  '        manifest.bin[bin] = `./bin/${bin}.js`;',
  "        fs.writeFileSync(path.join(dir, 'bin', `${bin}.js`), `process.stdout.write(process.argv[2] === '--version' ? ${JSON.stringify(`${said ?? version}\\n`)} : 'not asked for the version');\\n`);",
  '      }',
  '    }',
  "    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(manifest));",
  `    packages[\`node_modules/\${name}\`] = { version, resolved: \`${REGISTRY}\${name}/-/x-\${version}.tgz\` };`,
  '  }',
  '  Object.assign(packages, plan.lock);',
  "  fs.writeFileSync('package-lock.json', JSON.stringify({ lockfileVersion: 3, packages }));",
  '  process.exit(0);',
  '}',
  'process.exit(3);',
];

const scratch = temporaryDir('verify-registry-');
after(() => scratch.remove());
const fakeNpm = writeAt(scratch.dir, 'npm-cli.cjs', FAKE_NPM.join('\n'));

const REPORTED_LOCK = {
  'node_modules/@mcp-abap-adt/adt-clients': {
    version: '1.0.0',
    resolved: `${REGISTRY}@mcp-abap-adt/adt-clients/-/adt-clients-1.0.0.tgz`,
  },
  'node_modules/@mcp-abap-adt/adt-strategies': {
    version: '2.0.0',
    resolved: `${REGISTRY}@mcp-abap-adt/adt-strategies/-/adt-strategies-2.0.0.tgz`,
  },
  'node_modules/@mcp-abap-adt/connection': {
    version: '3.0.0',
    resolved: `${REGISTRY}@mcp-abap-adt/connection/-/connection-3.0.0.tgz`,
  },
};

interface Plan {
  hidden?: string[];
  empty?: string[];
  viewFails?: boolean;
  bins?: Record<string, Record<string, string | null>>;
  lock?: Record<string, Record<string, string | boolean>>;
}

interface Call {
  args: string[];
  cwd: string;
}

let runs = 0;

/** The script run against a fake npm following `plan`, and the npm calls. */
function verify(
  plan: Plan,
  args: readonly string[] = [VERSION],
  extraEnv: Readonly<Record<string, string>> = {},
) {
  runs += 1;
  const log = path.join(scratch.dir, `calls-${runs}.jsonl`);
  const planFile = writeAt(
    scratch.dir,
    `plan-${runs}.json`,
    JSON.stringify({
      log,
      hidden: plan.hidden ?? [],
      empty: plan.empty ?? [],
      viewFails: plan.viewFails ?? false,
      bins: plan.bins ?? {
        '@mcp-abap-adt/core': { 'mcp-abap-adt': null },
        '@mcp-abap-adt/http': { 'mcp-abap-adt-http': null },
      },
      lock: { ...REPORTED_LOCK, ...plan.lock },
    }),
  );
  const result = runNode(
    SCRIPT,
    args,
    environment({
      npm_execpath: fakeNpm,
      FAKE_NPM_PLAN: planFile,
      ...extraEnv,
    }),
  );
  const calls = recorded(log).map((line): Call => JSON.parse(line));
  return { ...result, calls };
}

/** Whether `dir` lies inside `root`, by the script's own segment rule. */
function inside(root: string, dir: string): boolean {
  const relative = path.relative(root, dir);
  return (
    relative !== '' &&
    !path.isAbsolute(relative) &&
    relative.split(path.sep)[0] !== '..'
  );
}

const installs = (calls: readonly Call[]) =>
  calls.filter((call) => call.args[0] === 'install');

describe('npm run release:verify', () => {
  it('passes a release every package of which the registry serves, with one summary line', () => {
    const run = verify({});
    assert.equal(run.status, 0, run.stderr);
    const lines = run.stdout.trim().split('\n');
    assert.equal(
      lines.at(-1),
      `OK: 18 packages at ${VERSION} installed from the registry, lockfile registry-only, 2 bins answer ${VERSION} (adt-clients 1.0.0, adt-strategies 2.0.0, connection 3.0.0)`,
    );
    const views = run.calls.filter((call) => call.args[0] === 'view');
    assert.equal(views.length, 18);
    assert.equal(new Set(views.map((call) => call.args.join(' '))).size, 18);
    assert.ok(
      views.some(
        (call) =>
          call.args[0] === 'view' &&
          call.args.slice(7).join(' ') ===
            `--json=false @mcp-abap-adt/lib@${VERSION} version`,
      ),
    );
    const [install, ...more] = installs(run.calls);
    assert.equal(more.length, 0);
    assert.ok(install);
    assert.ok(install.args.includes('--ignore-scripts'));
    assert.ok(install.args.includes(`--registry=${REGISTRY}`));
    assert.equal(
      install.args.filter((arg) => arg.endsWith(`@${VERSION}`)).length,
      18,
    );
    assert.equal(inside(REPO, install.cwd), false);
    assert.equal(fs.existsSync(install.cwd), false, 'the directory is removed');
  });

  it('runs every npm call from the temporary directory, reading no configuration of the user', () => {
    const run = verify({});
    assert.equal(run.status, 0, run.stderr);
    const [install] = installs(run.calls);
    assert.ok(install);
    const work = install.cwd;
    assert.equal(run.calls.length, 19);
    for (const call of run.calls) {
      assert.equal(call.cwd, work, call.args.join(' '));
      const settings = call.args.slice(1, 7);
      assert.deepEqual(settings, [
        `--prefix=${work}`,
        `--userconfig=${path.join(work, 'user.npmrc')}`,
        `--globalconfig=${path.join(work, 'global.npmrc')}`,
        `--registry=${REGISTRY}`,
        '--offline=false',
        '--prefer-online',
      ]);
    }
  });

  it('takes the root package.json version when none is given', () => {
    const { version } = JSON.parse(
      fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'),
    );
    const run = verify({}, []);
    assert.equal(run.status, 0, run.stderr);
    assert.ok(
      run.stdout.includes(`OK: 18 packages at ${version} installed`),
      run.stdout,
    );
  });

  it('says "not visible yet" for a version npm answers E404, exits 2 and installs nothing', () => {
    const run = verify({
      hidden: ['@mcp-abap-adt/core', '@mcp-abap-adt/compact-sse-ro'],
    });
    assert.equal(run.status, 2, run.stderr);
    assert.ok(
      run.stderr.includes(`not visible yet: 2 of 18 packages at ${VERSION}`),
      run.stderr,
    );
    assert.ok(run.stderr.includes(`@mcp-abap-adt/compact-sse-ro@${VERSION}`));
    assert.deepEqual(installs(run.calls), []);
  });

  it('counts an empty npm view answer as not visible yet', () => {
    const run = verify({
      hidden: ['@mcp-abap-adt/core'],
      empty: ['@mcp-abap-adt/lib'],
    });
    assert.equal(run.status, 2, run.stderr);
    assert.ok(
      run.stderr.includes(`not visible yet: 2 of 18 packages at ${VERSION}`),
      run.stderr,
    );
    assert.ok(run.stderr.includes(`@mcp-abap-adt/lib@${VERSION}`));
    assert.deepEqual(installs(run.calls), []);
  });

  it('fails on an npm view that fails for another reason than E404', () => {
    const run = verify({ viewFails: true });
    assert.equal(run.status, 1);
    assert.ok(run.stderr.includes('ECONNRESET'), run.stderr);
    assert.deepEqual(installs(run.calls), []);
  });

  it('fails on a "link": true in the lockfile', () => {
    const run = verify({
      lock: { 'node_modules/linked': { version: '1.0.0', link: true } },
    });
    assert.equal(run.status, 1);
    assert.ok(
      run.stderr.includes('node_modules/linked: "link": true'),
      run.stderr,
    );
  });

  it('fails on a package resolved from another place than the registry', () => {
    const run = verify({
      lock: {
        'node_modules/elsewhere': {
          version: '1.0.0',
          resolved: 'https://npm.example.com/elsewhere-1.0.0.tgz',
        },
      },
    });
    assert.equal(run.status, 1);
    assert.ok(
      run.stderr.includes(
        'node_modules/elsewhere: resolved from https://npm.example.com/',
      ),
      run.stderr,
    );
  });

  it('checks a bundled package that states where it was resolved from', () => {
    const run = verify({
      lock: {
        'node_modules/x/node_modules/bundled': {
          version: '1.0.0',
          inBundle: true,
          resolved: 'https://npm.example.com/bundled-1.0.0.tgz',
        },
        'node_modules/x/node_modules/plain-bundled': {
          version: '1.0.0',
          inBundle: true,
        },
      },
    });
    assert.equal(run.status, 1);
    assert.ok(
      run.stderr.includes(
        'node_modules/x/node_modules/bundled: resolved from https://npm.example.com/',
      ),
      run.stderr,
    );
    assert.ok(!run.stderr.includes('plain-bundled'), run.stderr);
  });

  it('fails on a bin that answers another version', () => {
    const run = verify({
      bins: { '@mcp-abap-adt/core': { 'mcp-abap-adt': '1.2.3' } },
    });
    assert.equal(run.status, 1);
    assert.ok(
      run.stderr.includes(
        `mcp-abap-adt --version answered "1.2.3", not ${VERSION}`,
      ),
      run.stderr,
    );
    const [install] = installs(run.calls);
    assert.equal(install && fs.existsSync(install.cwd), false);
  });

  it('refuses a temporary directory inside the repository', () => {
    const inside = path.join(scratch.dir, 'tmp');
    fs.mkdirSync(inside, { recursive: true });
    const run = verify({}, [VERSION], {
      TMPDIR: inside,
      TMP: inside,
      TEMP: inside,
    });
    assert.equal(run.status, 1);
    assert.ok(run.stderr.includes('is inside the repository'), run.stderr);
    assert.deepEqual(installs(run.calls), []);
    assert.deepEqual(fs.readdirSync(inside), [], 'the directory is removed');
  });
});
