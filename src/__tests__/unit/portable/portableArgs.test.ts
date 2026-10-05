/**
 * What `npm run portable:build` accepts (scripts/portable/args.cjs): the server
 * and the platform are chosen by the command, and anything it cannot build is
 * refused before anything is installed or downloaded.
 */
const args = require('../../../../scripts/portable/args.cjs');

describe('portable build arguments', () => {
  it('maps the platform of the running process', () => {
    expect(args.currentPlatform('linux', 'x64')).toBe('linux-x64');
    expect(args.currentPlatform('win32', 'x64')).toBe('win-x64');
    expect(args.currentPlatform('darwin', 'arm64')).toBe('macos-arm64');
  });

  it('defaults to both servers on the current platform', () => {
    expect(args.parseArgs([], 'linux-x64')).toEqual({
      which: 'all',
      platform: 'linux-x64',
    });
  });

  it('takes the server and a version', () => {
    expect(
      args.parseArgs(['compact', '--version=17.0.1'], 'linux-x64'),
    ).toEqual({ which: 'compact', platform: 'linux-x64', version: '17.0.1' });
  });

  it('refuses an unknown server, naming the valid ones', () => {
    expect(() => args.parseArgs(['both'], 'linux-x64')).toThrow(
      /full, compact or all/,
    );
  });

  it('refuses an unknown platform, naming the valid ones', () => {
    expect(() => args.parseArgs(['--platform=win-arm64'], 'linux-x64')).toThrow(
      /linux-x64, win-x64, macos-arm64/,
    );
  });

  it('refuses cross-building before anything is downloaded', () => {
    expect(() => args.parseArgs(['--platform=win-x64'], 'linux-x64')).toThrow(
      /cross-building win-x64 on linux-x64/,
    );
  });

  it('refuses an unknown option', () => {
    expect(() => args.parseArgs(['--fast'], 'linux-x64')).toThrow(
      /unknown option --fast/,
    );
  });

  it('describes every platform the spec names', () => {
    expect(Object.keys(args.PLATFORMS).sort()).toEqual([
      'linux-x64',
      'macos-arm64',
      'win-x64',
    ]);
    expect(args.SERVERS.full.pkg).toBe('@mcp-abap-adt/core');
    expect(args.SERVERS.compact.name).toBe('mcp-abap-adt-compact');
  });
});
