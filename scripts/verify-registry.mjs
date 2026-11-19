#!/usr/bin/env node
// Checks a release as it is published on the npm registry (npm run
// release:verify): the post-publish step of docs/deployment/RELEASE.md.
//
//   npm run release:verify                 the root package.json's version
//   npm run release:verify -- <version>    another one, e.g. 24.0.1
//
// 1. Every package of the release — the eighteen of scripts/publish-all.sh's
//    PACKAGES list, read from there — answers `npm view <name>@<version>
//    version` with the version. When any does not, the script says "not
//    visible yet", with the count, and exits 2: the registry can lag a few
//    minutes behind a publish, and the caller runs the script again. There is
//    no waiting loop or timer here.
// 2. All of them are installed together into a fresh directory outside the
//    repository (`npm install --ignore-scripts`), from the registry alone.
// 3. The installed lockfile holds no `"link": true`, and every package in it
//    is resolved from https://registry.npmjs.org/. The installed versions of
//    adt-clients, adt-strategies and connection are reported.
// 4. Every bin each package declares (its installed package.json's `bin`)
//    runs as `node <bin> --version` — no shell, no node_modules/.bin, no npx —
//    and answers exactly the version (stdout and stderr together, so a
//    `Two copies of @mcp-abap-adt/lib` line fails it).
//
// Exit 0 only when all of it holds, with one summary line; 1 on a failure; 2
// when the release is not visible on the registry yet. The directory is
// removed at the end. npm is started as the portable build starts it
// (scripts/portable/tools.cjs, `npmCommand`: node and npm-cli.js, no shell),
// and without the npm_* settings `npm run` hands this script.
import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const require_ = createRequire(import.meta.url);
const { npmCommand } = require_('./portable/tools.cjs');
const { withoutNpmSettings } = require_('./portable/readings.cjs');
// Taken before the npm_* variables are dropped.
const npm = npmCommand();
const env = withoutNpmSettings(process.env);
const run = promisify(execFile);

const REGISTRY = 'https://registry.npmjs.org/';
const REPORTED = [
  '@mcp-abap-adt/adt-clients',
  '@mcp-abap-adt/adt-strategies',
  '@mcp-abap-adt/connection',
];

function fail(lines, code = 1) {
  for (const line of lines) console.error(`release:verify: ${line}`);
  process.exit(code);
}

// The directories of scripts/publish-all.sh's `PACKAGES=( … )`, one quoted
// entry per line, in publish order.
function releaseDirs() {
  const lines = fs
    .readFileSync(path.join(repo, 'scripts', 'publish-all.sh'), 'utf8')
    .split('\n')
    .map((line) => line.trim());
  const start = lines.indexOf('PACKAGES=(');
  const end = lines.indexOf(')', start);
  if (start === -1 || end === -1) {
    fail(['scripts/publish-all.sh holds no PACKAGES=( … ) list']);
  }
  const dirs = [];
  for (const line of lines.slice(start + 1, end)) {
    if (line === '') continue;
    if (!line.startsWith('"') || !line.endsWith('"') || line.length < 3) {
      fail([`scripts/publish-all.sh: an unreadable PACKAGES entry: ${line}`]);
    }
    const dir = line.slice(1, -1);
    dirs.push(dir.startsWith('./') ? dir.slice(2) : dir);
  }
  return dirs;
}

const manifest = (dir) =>
  JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));

// `npm <args>` from `cwd`: its exit status and output, never a throw.
async function npmRun(args, cwd) {
  try {
    const { stdout, stderr } = await run(npm.cmd, [...npm.args, ...args], {
      cwd,
      env,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    return { status: 0, stdout, stderr };
  } catch (error) {
    return {
      status: typeof error.code === 'number' ? error.code : 1,
      stdout: typeof error.stdout === 'string' ? error.stdout : '',
      stderr: typeof error.stderr === 'string' ? error.stderr : String(error),
    };
  }
}

// Each name whose `<name>@<version>` the registry does not answer yet; a
// failure that is not npm's E404 stops the run.
async function notVisible(names, version) {
  const answers = await Promise.all(
    names.map(async (name) => ({
      name,
      answer: await npmRun(['view', `${name}@${version}`, 'version'], repo),
    })),
  );
  const missing = [];
  for (const { name, answer } of answers) {
    if (answer.status === 0 && answer.stdout.trim() === version) continue;
    if (answer.status === 0 || answer.stderr.includes('E404')) {
      missing.push(name);
      continue;
    }
    fail([
      `npm view ${name}@${version} failed (exit ${answer.status}):`,
      answer.stderr.trim(),
    ]);
  }
  return missing;
}

// What the installed lockfile says against a registry-only install, and the
// versions of the reported packages.
function readLockfile(file) {
  const lock = JSON.parse(fs.readFileSync(file, 'utf8'));
  const findings = [];
  const versions = new Map(REPORTED.map((name) => [name, new Set()]));
  for (const [key, entry] of Object.entries(lock.packages ?? {})) {
    if (key === '') continue;
    if (entry.link === true) findings.push(`${key}: "link": true`);
    else if (entry.inBundle === true) continue;
    else if (typeof entry.resolved !== 'string') {
      findings.push(`${key}: no "resolved"`);
    } else if (!entry.resolved.startsWith(REGISTRY)) {
      findings.push(`${key}: resolved from ${entry.resolved}`);
    }
    for (const name of REPORTED) {
      if (
        key === `node_modules/${name}` ||
        key.endsWith(`/node_modules/${name}`)
      )
        versions.get(name).add(entry.version);
    }
  }
  for (const [name, found] of versions) {
    if (found.size === 0) findings.push(`${name}: not installed`);
  }
  return { findings, versions };
}

// Every bin an installed package declares: [bin name, absolute path].
function binsOf(packageDir, name) {
  const { bin } = manifest(packageDir);
  if (bin === undefined) return [];
  if (typeof bin === 'string') {
    return [
      [name.slice(name.lastIndexOf('/') + 1), path.join(packageDir, bin)],
    ];
  }
  return Object.entries(bin).map(([binName, file]) => [
    binName,
    path.join(packageDir, file),
  ]);
}

const args = process.argv.slice(2);
if (args.length > 1) fail(['usage: npm run release:verify [-- <version>]']);
const version = args[0] ?? manifest(repo).version;
if (version === '' || version[0] < '0' || version[0] > '9') {
  fail([`not a version: ${version}`]);
}

const names = releaseDirs().map((dir) => manifest(path.join(repo, dir)).name);
const missing = await notVisible(names, version);
if (missing.length > 0) {
  fail(
    [
      `not visible yet: ${missing.length} of ${names.length} packages at ${version}; run it again in a few minutes`,
      ...missing.map((name) => `  ${name}@${version}`),
    ],
    2,
  );
}
console.log(
  `release:verify: all ${names.length} packages at ${version} are on the registry`,
);

const work = fs.realpathSync(
  fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-abap-adt-verify-')),
);
const failures = [];
let summary = '';
try {
  if (!path.relative(repo, work).startsWith('..')) {
    throw new Error(`the temporary directory ${work} is inside the repository`);
  }
  fs.writeFileSync(path.join(work, 'package.json'), '{"private":true}\n');
  const install = await npmRun(
    [
      'install',
      '--ignore-scripts',
      '--prefer-online',
      '--no-audit',
      '--no-fund',
      ...names.map((name) => `${name}@${version}`),
    ],
    work,
  );
  if (install.status !== 0) {
    failures.push(
      `npm install failed (exit ${install.status}):`,
      install.stderr.trim(),
    );
  } else {
    const { findings, versions } = readLockfile(
      path.join(work, 'package-lock.json'),
    );
    failures.push(...findings);
    const reported = [...versions]
      .map(
        ([name, found]) =>
          `${name.slice('@mcp-abap-adt/'.length)} ${[...found].join(', ')}`,
      )
      .join(', ');
    console.log(`release:verify: installed ${reported}`);

    let binCount = 0;
    for (const name of names) {
      const dir = path.join(work, 'node_modules', ...name.split('/'));
      const installed = manifest(dir).version;
      if (installed !== version) {
        failures.push(`${name}: installed ${installed}, not ${version}`);
      }
      for (const [binName, file] of binsOf(dir, name)) {
        binCount += 1;
        let said;
        try {
          const { stdout, stderr } = await run(
            process.execPath,
            [file, '--version'],
            { cwd: work, env, encoding: 'utf8' },
          );
          said = `${stdout}${stderr}`.trim();
        } catch (error) {
          said = `exit ${error.code}: ${`${error.stdout ?? ''}${error.stderr ?? ''}`.trim()}`;
        }
        if (said === version)
          console.log(`release:verify: ${binName} --version: ${said}`);
        else
          failures.push(
            `${binName} --version answered "${said}", not ${version}`,
          );
      }
    }
    if (binCount === 0)
      failures.push('no package of the release declares a bin');
    summary = `OK: ${names.length} packages at ${version} installed from the registry, lockfile registry-only, ${binCount} bins answer ${version} (${reported})`;
  }
} catch (error) {
  failures.push(String(error));
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}

if (failures.length > 0) fail(['FAILED:', ...failures.map((f) => `  ${f}`)]);
console.log(summary);
