/**
 * The building blocks of the portable build that touch the host:
 * scripts/portable/elf.cjs (the RUNPATH rewritten or added) and tools.cjs (how npm and
 * tar are started, and the search path the smoke check runs with).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { assertThrows } from '../../helpers/assertions';
import { repositoryRoot } from '../../helpers/repoRoot';

const elf = require(
  path.join(repositoryRoot(__dirname), 'scripts', 'portable', 'elf.cjs'),
);
const tools = require(
  path.join(repositoryRoot(__dirname), 'scripts', 'portable', 'tools.cjs'),
);

const image = (...strings: string[]) =>
  Buffer.concat([
    Buffer.from([0x7f]),
    ...strings.map((s) => Buffer.from(`\0${s}`)),
    Buffer.from([0]),
  ]);

describe('RUNPATH rewrite', () => {
  it('replaces the whole string and pads it with NULs', () => {
    const before = image('libsapnwrfc.so', '/opt/sdk/lib', 'libc.so.6');
    const after = elf.patchRunpath(before, '/opt/sdk/lib', '$ORIGIN');
    assert.equal(after.length, before.length);
    assert.ok(after.toString('latin1').includes('\0$ORIGIN\0'));
    assert.ok(!after.toString('latin1').includes('/opt/sdk/lib'));
    assert.ok(after.toString('latin1').includes('\0libc.so.6\0'));
  });

  it('refuses when the path is not there', () => {
    assertThrows(
      () => elf.patchRunpath(image('/other/lib'), '/opt/sdk/lib', '$ORIGIN'),
      /not found/,
    );
  });

  it('refuses when it occurs more than once', () => {
    assertThrows(
      () =>
        elf.patchRunpath(
          image('/opt/sdk/lib', '/opt/sdk/lib'),
          '/opt/sdk/lib',
          '$ORIGIN',
        ),
      /more than once/,
    );
  });

  it('refuses a match that is only the tail of a longer string', () => {
    assertThrows(
      () =>
        elf.patchRunpath(image('/x/opt/sdk/lib'), '/opt/sdk/lib', '$ORIGIN'),
      /not found/,
    );
  });

  it('refuses a replacement longer than the original', () => {
    assertThrows(
      () => elf.patchRunpath(image('/l'), '/l', '$ORIGIN'),
      /longer/,
    );
  });
});

// A minimal ELF64 little-endian image: a header, a dynamic section and its
// string table, with the given dynamic entries ([tag, string]).
const elfImage = (entries: Array<[number, string]>) => {
  const strings = Buffer.concat([
    Buffer.from([0]),
    ...entries.map(([, s]) => Buffer.from(`${s}\0`)),
  ]);
  const dynamic = Buffer.alloc(16 * (entries.length + 1));
  let offset = 1;
  entries.forEach(([tag, s], i) => {
    dynamic.writeBigInt64LE(BigInt(tag), i * 16);
    dynamic.writeBigUInt64LE(BigInt(offset), i * 16 + 8);
    offset += Buffer.byteLength(s) + 1;
  });
  const header = Buffer.alloc(64);
  header.writeUInt32BE(0x7f454c46, 0);
  header[4] = 2;
  header[5] = 1;
  const dynOff = 64;
  const strOff = dynOff + dynamic.length;
  const shoff = strOff + strings.length;
  header.writeBigUInt64LE(BigInt(shoff), 0x28);
  header.writeUInt16LE(64, 0x3a);
  header.writeUInt16LE(3, 0x3c);
  const section = (type: number, off: number, size: number, link: number) => {
    const s = Buffer.alloc(64);
    s.writeUInt32LE(type, 4);
    s.writeBigUInt64LE(BigInt(off), 0x18);
    s.writeBigUInt64LE(BigInt(size), 0x20);
    s.writeUInt32LE(link, 0x28);
    return s;
  };
  return Buffer.concat([
    header,
    dynamic,
    strings,
    section(0, 0, 0, 0),
    section(6, dynOff, dynamic.length, 2),
    section(3, strOff, strings.length, 0),
  ]);
};

describe('RUNPATH read', () => {
  it('reads the RUNPATH the image carries, whoever built it', () => {
    const image = elfImage([
      [1, 'libsapnwrfc.so'],
      [29, '/publisher/sdk/lib'],
    ]);
    assert.equal(elf.readRunpath(image), '/publisher/sdk/lib');
    assert.equal(
      elf.patchRunpath(image, elf.readRunpath(image), '$ORIGIN').length,
      image.length,
    );
  });

  it('reads an RPATH when there is no RUNPATH', () => {
    assert.equal(elf.readRunpath(elfImage([[15, '/old/lib']])), '/old/lib');
  });

  it('reads none from an image that carries none (a prebuilt binding)', () => {
    assert.equal(elf.readRunpath(elfImage([[1, 'libc.so.6']])), undefined);
  });

  it('refuses an image with two', () => {
    assertThrows(
      () =>
        elf.readRunpath(
          elfImage([
            [29, '/a'],
            [15, '/b'],
          ]),
        ),
      /more than one/,
    );
  });

  it('refuses what is not a 64-bit little-endian ELF', () => {
    assertThrows(() => elf.readRunpath(Buffer.alloc(64)), /not a 64-bit/);
  });
});

// The file offset of the dynamic entry `index` of an elfImage, and of its value.
const entryAt = (index: number) => 64 + index * 16;

describe('RUNPATH added in place of the SONAME', () => {
  it('turns the SONAME into a RUNPATH of the new path, the image the same size', () => {
    const before = elfImage([
      [1, 'libsapnwrfc.so'],
      [14, 'sapnwrfc.node'],
    ]);
    const after = elf.addRunpath(before, '$ORIGIN');
    assert.equal(after.length, before.length);
    assert.equal(elf.readRunpath(after), '$ORIGIN');
    assert.equal(after.readBigInt64LE(entryAt(1)), 29n);
    assert.ok(!after.toString('latin1').includes('sapnwrfc.node'));
    assert.ok(after.toString('latin1').includes('\0libsapnwrfc.so\0'));
  });

  it('refuses an image that already carries one: it is rewritten instead', () => {
    assertThrows(
      () =>
        elf.addRunpath(
          elfImage([
            [14, 'sapnwrfc.node'],
            [29, '/opt/sdk/lib'],
          ]),
          '$ORIGIN',
        ),
      /already carries/,
    );
  });

  it('refuses an image with no SONAME to put it in place of', () => {
    assertThrows(
      () => elf.addRunpath(elfImage([[1, 'libc.so.6']]), '$ORIGIN'),
      /no SONAME/,
    );
  });

  it('refuses a path longer than the SONAME', () => {
    assertThrows(
      () => elf.addRunpath(elfImage([[14, 'a.node']]), '$ORIGIN'),
      /longer than the SONAME/,
    );
  });

  it('adds one to the linux-x64 binding sap-rfc-lite ships, which carries none', () => {
    const pkg = path.dirname(
      require.resolve('@mcp-abap-adt/sap-rfc-lite/package.json'),
    );
    const before = readFileSync(
      path.join(
        pkg,
        'prebuilds/linux-x64/@mcp-abap-adt+sap-rfc-lite.glibc.node',
      ),
    );
    assert.equal(elf.readRunpath(before), undefined);
    const after = elf.addRunpath(before, '$ORIGIN');
    assert.equal(elf.readRunpath(after), '$ORIGIN');
    assert.equal(after.length, before.length);
  });

  it('refuses a SONAME whose string another name shares', () => {
    const image = elfImage([
      [1, 'libc.so.6'],
      [14, 'sapnwrfc.node'],
    ]);
    // The NEEDED entry pointed at the tail of the SONAME, as a linker that
    // tail-merges strings would leave it.
    const sonameValue = image.readBigUInt64LE(entryAt(1) + 8);
    image.writeBigUInt64LE(sonameValue + 3n, entryAt(0) + 8);
    assertThrows(() => elf.addRunpath(image, '$ORIGIN'), /shares its string/);
  });

  it('refuses a SONAME that is the tail of another name', () => {
    const image = elfImage([
      [1, 'libsapnwrfc.node'],
      [14, 'sapnwrfc.node'],
    ]);
    // The SONAME pointed into the tail of the NEEDED name, as a linker that
    // tail-merges strings would leave it: overwriting it would change that name.
    const neededValue = image.readBigUInt64LE(entryAt(0) + 8);
    image.writeBigUInt64LE(neededValue + 3n, entryAt(1) + 8);
    assertThrows(() => elf.addRunpath(image, '$ORIGIN'), /shares its string/);
  });
});

describe('npm without a shell', () => {
  it('runs npm-cli.js through node when npm started us', () => {
    assert.deepStrictEqual(
      tools.npmCommand({
        env: { npm_execpath: '/usr/lib/node_modules/npm/bin/npm-cli.js' },
        execPath: '/usr/bin/node',
        platform: 'linux',
        exists: () => true,
      }),
      {
        cmd: '/usr/bin/node',
        args: ['/usr/lib/node_modules/npm/bin/npm-cli.js'],
      },
    );
  });

  it('finds npm-cli.js beside node.exe on Windows', () => {
    const execPath = path.win32.join('C:\\node', 'node.exe');
    const cli = path.join(
      path.dirname(execPath),
      'node_modules',
      'npm',
      'bin',
      'npm-cli.js',
    );
    assert.deepStrictEqual(
      tools.npmCommand({
        env: {},
        execPath,
        platform: 'win32',
        exists: (p: string) => p === cli,
      }),
      { cmd: execPath, args: [cli] },
    );
  });

  it('falls back to npm on the PATH elsewhere', () => {
    assert.deepStrictEqual(
      tools.npmCommand({
        env: {},
        execPath: '/usr/bin/node',
        platform: 'linux',
        exists: () => false,
      }),
      { cmd: 'npm', args: [] },
    );
  });
});

describe('tar', () => {
  it('is the system bsdtar on Windows, not a tar earlier on the PATH', () => {
    assert.equal(
      tools.tarCommand('win32', { SystemRoot: 'C:\\Windows' }),
      path.join('C:\\Windows', 'System32', 'tar.exe'),
    );
  });

  it('is tar from the PATH elsewhere', () => {
    assert.equal(tools.tarCommand('linux', {}), 'tar');
  });
});

describe('the search path the smoke check runs with', () => {
  it('drops every entry that holds an SDK library', () => {
    const value = ['/usr/bin', '/opt/sdk/lib', '/bin'].join(path.delimiter);
    assert.equal(
      tools.withoutSdk(
        value,
        'libsapnwrfc.so',
        (p: string) => p === path.join('/opt/sdk/lib', 'libsapnwrfc.so'),
      ),
      ['/usr/bin', '/bin'].join(path.delimiter),
    );
  });

  it('leaves an unset variable unset', () => {
    assert.equal(
      tools.withoutSdk(undefined, 'libsapnwrfc.so', () => true),
      undefined,
    );
  });
});

describe('the environment the smoke check runs every executable with', () => {
  // A shell that states a system: every one of these would route, or type,
  // the smoke's RFC logon if it reached the child.
  const parent = {
    PATH: ['/usr/bin', '/opt/sdk/lib'].join(path.delimiter),
    LD_LIBRARY_PATH: '/opt/sdk/lib',
    HOME: '/home/someone',
    SAPNWRFC_HOME: '/opt/sdk',
    SAP_MSHOST: 'msg.unreachable.invalid',
    SAP_MSSERV: '3600',
    SAP_SYSID: 'SID',
    SAP_GROUP: 'PUBLIC',
    SAP_SAPROUTER: '/H/192.0.2.1/S/3299',
    SAP_SYSNR: '00',
    SAP_CONNECTION_TYPE: 'http',
    SAP_SYSTEM_TYPE: 'cloud',
    SAP_URL: 'http://unreachable.invalid:8000',
    sap_username: 'someone',
    MCP_ENV_PATH: '/home/someone/.env',
    MCP_BROWSER: 'chrome',
    AUTH_BROKER_PATH: '/home/someone/.config/mcp-abap-adt',
  };
  const sdkHere = (p: string) =>
    p === path.join('/opt/sdk/lib', 'libsapnwrfc.so');

  it('carries no SAP_*, MCP_*, AUTH_BROKER_PATH or SAPNWRFC_HOME of the caller', () => {
    const env = tools.smokeEnv(parent, 'libsapnwrfc.so', sdkHere);
    assert.deepStrictEqual(
      Object.keys(env).filter((key) =>
        /^(SAP|MCP)_|^AUTH_BROKER_PATH$|^SAPNWRFC_HOME$/i.test(key),
      ),
      [],
    );
  });

  it('keeps the rest, the search paths without an SDK folder', () => {
    const env = tools.smokeEnv(parent, 'libsapnwrfc.so', sdkHere);
    assert.equal(env.HOME, '/home/someone');
    assert.equal(env.PATH, '/usr/bin');
    assert.equal(env.LD_LIBRARY_PATH, '');
  });

  it('is the one environment smoke.mjs gives every child', () => {
    const source = readFileSync(
      path.join(repositoryRoot(__dirname), 'scripts', 'portable', 'smoke.mjs'),
      'utf8',
    );
    assert.ok(source.includes('const env = smokeEnv(process.env, sdkLib);'));
    // process.env is read once more, for SystemRoot only; no child gets it.
    const reads = source.split('process.env').length - 1;
    assert.equal(reads, 2);
    assert.ok(source.includes('process.env.SystemRoot'));
    // Every child: spawnSync, spawn and the MCP transport take `env` alone.
    assert.deepStrictEqual(
      source.match(/\benv: (?!process)[^,}\n]+/g) ?? [],
      [],
    );
    assert.equal((source.match(/\{ env, encoding/g) ?? []).length, 1);
    assert.equal((source.match(/^\s+env,$/gm) ?? []).length, 2);
  });
});

describe('build tools installed apart from the repository', () => {
  const manifest = {
    devDependencies: {
      '@biomejs/biome': '^2.5.15',
      esbuild: '^0.28.2',
      postject: '^1.0.0-alpha.6',
    },
  };

  it('takes esbuild and postject at the ranges the repository declares, nothing else', () => {
    assert.deepStrictEqual(tools.buildToolSpecs(manifest), [
      'esbuild@^0.28.2',
      'postject@^1.0.0-alpha.6',
    ]);
  });

  it('refuses a manifest that lost one of them', () => {
    assertThrows(
      () => tools.buildToolSpecs({ devDependencies: { esbuild: '^0.28.2' } }),
      /postject/,
    );
  });

  it('reuses the tools folder only for the same specs', () => {
    const fs = require('node:fs');
    const os = require('node:os');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portable-tools-'));
    const specs = tools.buildToolSpecs(manifest);
    assert.equal(tools.toolsInstalled(dir, specs), false);
    tools.markToolsInstalled(dir, specs);
    assert.equal(tools.toolsInstalled(dir, specs), true);
    assert.equal(
      tools.toolsInstalled(dir, ['esbuild@^0.29.0', 'postject@^1.0.0-alpha.6']),
      false,
    );
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
