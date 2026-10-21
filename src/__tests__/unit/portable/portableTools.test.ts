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
    expect(elf.readRunpath(image)).toBe('/publisher/sdk/lib');
    expect(
      elf.patchRunpath(image, elf.readRunpath(image), '$ORIGIN'),
    ).toHaveLength(image.length);
  });

  it('reads an RPATH when there is no RUNPATH', () => {
    expect(elf.readRunpath(elfImage([[15, '/old/lib']]))).toBe('/old/lib');
  });

  it('refuses an image with none: the SDK beside it would not be found', () => {
    expect(() => elf.readRunpath(elfImage([[1, 'libc.so.6']]))).toThrow(
      /no RUNPATH/,
    );
  });

  it('refuses an image with two', () => {
    expect(() =>
      elf.readRunpath(
        elfImage([
          [29, '/a'],
          [15, '/b'],
        ]),
      ),
    ).toThrow(/more than one/);
  });

  it('refuses what is not a 64-bit little-endian ELF', () => {
    expect(() => elf.readRunpath(Buffer.alloc(64))).toThrow(/not a 64-bit/);
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
