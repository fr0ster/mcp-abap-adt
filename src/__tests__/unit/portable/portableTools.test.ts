/**
 * The building blocks of the portable build that touch the host:
 * scripts/portable/elf.cjs (the RUNPATH rewrite) and tools.cjs (how npm and
 * tar are started, and the search path the smoke check runs with).
 */
import * as path from 'node:path';

const elf = require('../../../../scripts/portable/elf.cjs');
const tools = require('../../../../scripts/portable/tools.cjs');

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
    expect(after.length).toBe(before.length);
    expect(after.toString('latin1')).toContain('\0$ORIGIN\0');
    expect(after.toString('latin1')).not.toContain('/opt/sdk/lib');
    expect(after.toString('latin1')).toContain('\0libc.so.6\0');
  });

  it('refuses when the path is not there', () => {
    expect(() =>
      elf.patchRunpath(image('/other/lib'), '/opt/sdk/lib', '$ORIGIN'),
    ).toThrow(/not found/);
  });

  it('refuses when it occurs more than once', () => {
    expect(() =>
      elf.patchRunpath(
        image('/opt/sdk/lib', '/opt/sdk/lib'),
        '/opt/sdk/lib',
        '$ORIGIN',
      ),
    ).toThrow(/more than once/);
  });

  it('refuses a match that is only the tail of a longer string', () => {
    expect(() =>
      elf.patchRunpath(image('/x/opt/sdk/lib'), '/opt/sdk/lib', '$ORIGIN'),
    ).toThrow(/not found/);
  });

  it('refuses a replacement longer than the original', () => {
    expect(() => elf.patchRunpath(image('/l'), '/l', '$ORIGIN')).toThrow(
      /longer/,
    );
  });
});

describe('npm without a shell', () => {
  it('runs npm-cli.js through node when npm started us', () => {
    expect(
      tools.npmCommand({
        env: { npm_execpath: '/usr/lib/node_modules/npm/bin/npm-cli.js' },
        execPath: '/usr/bin/node',
        platform: 'linux',
        exists: () => true,
      }),
    ).toEqual({
      cmd: '/usr/bin/node',
      args: ['/usr/lib/node_modules/npm/bin/npm-cli.js'],
    });
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
    expect(
      tools.npmCommand({
        env: {},
        execPath,
        platform: 'win32',
        exists: (p: string) => p === cli,
      }),
    ).toEqual({ cmd: execPath, args: [cli] });
  });

  it('falls back to npm on the PATH elsewhere', () => {
    expect(
      tools.npmCommand({
        env: {},
        execPath: '/usr/bin/node',
        platform: 'linux',
        exists: () => false,
      }),
    ).toEqual({ cmd: 'npm', args: [] });
  });
});

describe('tar', () => {
  it('is the system bsdtar on Windows, not a tar earlier on the PATH', () => {
    expect(tools.tarCommand('win32', { SystemRoot: 'C:\\Windows' })).toBe(
      path.join('C:\\Windows', 'System32', 'tar.exe'),
    );
  });

  it('is tar from the PATH elsewhere', () => {
    expect(tools.tarCommand('linux', {})).toBe('tar');
  });
});

describe('the search path the smoke check runs with', () => {
  it('drops every entry that holds an SDK library', () => {
    const value = ['/usr/bin', '/opt/sdk/lib', '/bin'].join(path.delimiter);
    expect(
      tools.withoutSdk(
        value,
        'libsapnwrfc.so',
        (p: string) => p === path.join('/opt/sdk/lib', 'libsapnwrfc.so'),
      ),
    ).toBe(['/usr/bin', '/bin'].join(path.delimiter));
  });

  it('leaves an unset variable unset', () => {
    expect(tools.withoutSdk(undefined, 'libsapnwrfc.so', () => true)).toBe(
      undefined,
    );
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
    expect(tools.buildToolSpecs(manifest)).toEqual([
      'esbuild@^0.28.2',
      'postject@^1.0.0-alpha.6',
    ]);
  });

  it('refuses a manifest that lost one of them', () => {
    expect(() =>
      tools.buildToolSpecs({ devDependencies: { esbuild: '^0.28.2' } }),
    ).toThrow(/postject/);
  });

  it('reuses the tools folder only for the same specs', () => {
    const fs = require('node:fs');
    const os = require('node:os');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portable-tools-'));
    const specs = tools.buildToolSpecs(manifest);
    expect(tools.toolsInstalled(dir, specs)).toBe(false);
    tools.markToolsInstalled(dir, specs);
    expect(tools.toolsInstalled(dir, specs)).toBe(true);
    expect(
      tools.toolsInstalled(dir, ['esbuild@^0.29.0', 'postject@^1.0.0-alpha.6']),
    ).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
