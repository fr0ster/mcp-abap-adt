import { execFileSync } from 'node:child_process';
import { isAbsolute, join } from 'node:path';
import { spawnOptionsForNpm } from './platform';

/** The repository root, where the library's own manifest lives. */
export const ROOT = join(__dirname, '../../..');

/**
 * Every package of this repository's release, by directory, in publish order
 * (`scripts/publish-all.sh`): the packed-package inventory. A package another
 * one depends on is packed from this checkout with it, never fetched from the
 * registry — the versions being released are not there yet.
 */
export const RELEASE_DIRS: readonly string[] = [
  '.',
  'background-runs-memory',
  'responsible-rules',
  'compact-readonly-entries',
  'compact-modify',
  'server-runtime',
  'server',
  'http',
  'sse',
  'compact',
  'compact-http',
  'compact-sse',
  'core-ro',
  'http-ro',
  'sse-ro',
  'compact-ro',
  'compact-http-ro',
  'compact-sse-ro',
];

const run = (command: string, args: string[], cwd: string): string =>
  execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    ...spawnOptionsForNpm,
  });

/**
 * Packs the given packages of this repository into `workdir` and answers each
 * tarball's path, in the order of `dirs`. `dirs` are relative to the
 * repository root (`.` is the library), or absolute (a prepared copy of a
 * package). Packing reads each package's `dist/` as it stands: build first.
 */
export function packRelease(
  workdir: string,
  dirs: readonly string[],
): string[] {
  return dirs.map((dir) =>
    join(
      workdir,
      run(
        'npm',
        [
          'pack',
          isAbsolute(dir) ? dir : join(ROOT, dir),
          '--pack-destination',
          workdir,
        ],
        workdir,
      )
        .trim()
        .split('\n')
        .at(-1) as string,
    ),
  );
}

/**
 * Packs the given packages of this repository and installs the tarballs together
 * into `workdir`, the way a user's tree looks after `npm install` — without
 * publishing first. Each package depends on the others by version, and the
 * versions being released are not on the registry yet, so installing the
 * tarballs side by side is the only installed tree there is before a release.
 *
 * `dirs` are relative to the repository root (`.` is the library). Packing reads
 * each package's `dist/` as it stands: build first.
 */
export function installPackedRelease(workdir: string, dirs: string[]): void {
  const tarballs = packRelease(workdir, dirs);
  run('npm', ['init', '-y'], workdir);
  run(
    'npm',
    ['install', '--no-save', '--ignore-scripts', ...tarballs],
    workdir,
  );
}

/** Where an installed package's file lands under `workdir`. */
export const installedFile = (
  workdir: string,
  pkg: string,
  ...file: string[]
): string => join(workdir, 'node_modules', '@mcp-abap-adt', pkg, ...file);
