/**
 * What `npm run portable:build` accepts (scripts/portable/args.cjs): the server
 * and the platform are chosen by the command, and anything it cannot build is
 * refused before anything is installed or downloaded.
 */

import assert from 'node:assert/strict';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { assertThrows } from '../../helpers/assertions';
import { repositoryRoot } from '../../helpers/repoRoot';

const args = require(
  path.join(repositoryRoot(__dirname), 'scripts', 'portable', 'args.cjs'),
);

describe('portable build arguments', () => {
  it('maps the platform of the running process', () => {
    assert.equal(args.currentPlatform('linux', 'x64'), 'linux-x64');
    assert.equal(args.currentPlatform('win32', 'x64'), 'win-x64');
    assert.equal(args.currentPlatform('darwin', 'arm64'), 'macos-arm64');
  });

  it('defaults to both servers on the current platform', () => {
    assert.deepStrictEqual(args.parseArgs([], 'linux-x64'), {
      which: 'all',
      platform: 'linux-x64',
    });
  });

  it('takes the server and a version', () => {
    assert.deepStrictEqual(
      args.parseArgs(['compact', '--version=17.0.1'], 'linux-x64'),
      { which: 'compact', platform: 'linux-x64', version: '17.0.1' },
    );
  });

  it('refuses an unknown server, naming the valid ones', () => {
    assertThrows(
      () => args.parseArgs(['both'], 'linux-x64'),
      /full, compact or all/,
    );
  });

  it('refuses an unknown platform, naming the valid ones', () => {
    assertThrows(
      () => args.parseArgs(['--platform=win-arm64'], 'linux-x64'),
      /linux-x64, win-x64, macos-arm64/,
    );
  });

  it('refuses another platform before anything is downloaded', () => {
    assertThrows(
      () => args.parseArgs(['--platform=win-x64'], 'linux-x64'),
      /^builds only for the platform it runs on \(linux-x64\), not win-x64$/,
    );
  });

  it('refuses an unknown option', () => {
    assertThrows(
      () => args.parseArgs(['--fast'], 'linux-x64'),
      /unknown option --fast/,
    );
  });

  it('refuses a version that is neither a semver nor a dist-tag', () => {
    assertThrows(
      () => args.parseArgs(['--version=1.0.0&calc'], 'linux-x64'),
      /not a version/,
    );
    assert.equal(
      args.parseArgs(['--version=latest'], 'linux-x64').version,
      'latest',
    );
  });

  it('names an unsupported host as such, not as an unknown platform', () => {
    assertThrows(
      () => args.parseArgs([], 'linux-arm64'),
      /this machine \(linux-arm64\) cannot build portable executables.*linux-x64, win-x64, macos-arm64/,
    );
  });

  it('describes every platform the spec names', () => {
    assert.deepStrictEqual(Object.keys(args.PLATFORMS).sort(), [
      'linux-x64',
      'macos-arm64',
      'win-x64',
    ]);
    assert.equal(args.SERVERS.full.pkg, '@mcp-abap-adt/core');
    assert.equal(args.SERVERS.compact.name, 'mcp-abap-adt-compact');
  });
});
