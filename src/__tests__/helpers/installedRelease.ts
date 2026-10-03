import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { spawnOptionsForNpx } from './platform';

/** The repository root, where the library's own manifest lives. */
export const ROOT = join(__dirname, '../../..');

const run = (command: string, args: string[], cwd: string): string =>
  execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    ...spawnOptionsForNpx,
  });

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
  const tarballs = dirs.map((dir) =>
    join(
      workdir,
      run(
        'npm',
        ['pack', join(ROOT, dir), '--pack-destination', workdir],
        workdir,
      )
        .trim()
        .split('\n')
        .at(-1) as string,
    ),
  );
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
