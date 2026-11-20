/**
 * AUTH_BROKER_PATH is split into a list of base paths. The separator has to
 * depend on the platform: a Windows absolute path carries a colon after its
 * drive letter, so splitting on ':' there tears every path in two.
 *
 * The assertions count the paths produced rather than comparing them, because
 * `path.resolve` normalises differently on each platform and the test would
 * otherwise pass or fail depending on where CI happens to run.
 */

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { format } from 'node:util';
import { getPlatformPaths } from '../../config/platformPaths';

describe('getPlatformPaths with AUTH_BROKER_PATH', () => {
  const realPlatform = process.platform;
  const realEnv = process.env.AUTH_BROKER_PATH;

  const pretendPlatform = (value: NodeJS.Platform) => {
    Object.defineProperty(process, 'platform', {
      value,
      configurable: true,
    });
  };

  afterEach(() => {
    pretendPlatform(realPlatform);
    if (realEnv === undefined) {
      delete process.env.AUTH_BROKER_PATH;
    } else {
      process.env.AUTH_BROKER_PATH = realEnv;
    }
  });

  it('keeps a Windows absolute path whole', () => {
    pretendPlatform('win32');
    process.env.AUTH_BROKER_PATH = 'D:\\Users\\dev\\mcp-abap-adt';

    // One path from the variable. Splitting on ':' as well would yield "D" and "\Users\dev\mcp-abap-adt" — two entries, the
    // second resolving against whatever drive the process happens to be on.
    assert.equal(getPlatformPaths(undefined, 'sessions').length, 1);
  });

  it('still separates several Windows paths on the semicolon', () => {
    pretendPlatform('win32');
    process.env.AUTH_BROKER_PATH = 'D:\\one;E:\\two';

    assert.equal(getPlatformPaths(undefined, 'sessions').length, 2);
  });

  it('separates Unix paths on the colon', () => {
    pretendPlatform('linux');
    process.env.AUTH_BROKER_PATH = '/opt/one:/opt/two';

    assert.equal(getPlatformPaths(undefined, 'sessions').length, 2);
  });

  it('still accepts a semicolon on Unix', () => {
    // Kept working so an existing configuration does not break.
    pretendPlatform('linux');
    process.env.AUTH_BROKER_PATH = '/opt/one;/opt/two';

    assert.equal(getPlatformPaths(undefined, 'sessions').length, 2);
  });

  it('ignores empty entries left by a trailing separator', () => {
    pretendPlatform('win32');
    process.env.AUTH_BROKER_PATH = 'D:\\one;;';

    assert.equal(getPlatformPaths(undefined, 'sessions').length, 1);
  });
});

/**
 * Nothing is looked up in the working directory: a server started inside
 * someone else's project must not take their stores.
 */
describe('getPlatformPaths never returns the working directory', () => {
  const realEnv = process.env.AUTH_BROKER_PATH;
  afterEach(() => {
    if (realEnv === undefined) delete process.env.AUTH_BROKER_PATH;
    else process.env.AUTH_BROKER_PATH = realEnv;
  });

  for (const [_label, custom, env] of [
    ['the platform default', undefined, undefined],
    ['a custom path', '/opt/stores', undefined],
    ['AUTH_BROKER_PATH', undefined, '/opt/stores'],
  ]) {
    it(format('%s', _label), () => {
      if (env === undefined) delete process.env.AUTH_BROKER_PATH;
      else process.env.AUTH_BROKER_PATH = env;
      for (const sub of [undefined, 'sessions', 'service-keys'] as const) {
        assert.ok(!getPlatformPaths(custom, sub).includes(process.cwd()));
      }
    });
  }
});
